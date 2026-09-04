import { NextRequest, NextResponse } from 'next/server';
import { z, ZodError, ZodTypeAny } from 'zod';
import { AuthError } from './auth';
import { PAGINATION_DEFAULTS, type PaginationQuery } from './types';

export class ApiValidationError extends Error {
  fields: Record<string, string>;
  constructor(fields: Record<string, string>) {
    super('Validation failed');
    this.fields = fields;
  }
}

export class NotFoundError extends Error {
  constructor(message = 'Not found') {
    super(message);
  }
}

export class BusinessRuleError extends Error {
  code: string;
  fields?: Record<string, string>;
  constructor(message: string, code = 'BUSINESS_RULE', fields?: Record<string, string>) {
    super(message);
    this.code = code;
    this.fields = fields;
  }
}

function zodFieldErrors(err: ZodError): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const issue of err.issues) {
    const key = issue.path.join('.') || '_';
    if (!fields[key]) fields[key] = issue.message;
  }
  return fields;
}

/**
 * `S extends ZodTypeAny` (rather than a parameterized `ZodSchema<T>`) so TS infers the exact
 * schema type and `z.infer<S>` resolves fields with `.default()` as non-optional, matching what
 * `schema.parse()` actually returns at runtime.
 */
export async function parseJson<S extends ZodTypeAny>(req: NextRequest, schema: S): Promise<z.infer<S>> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    throw new ApiValidationError({ _: 'Request body must be valid JSON.' });
  }
  const result = schema.safeParse(body);
  if (!result.success) throw new ApiValidationError(zodFieldErrors(result.error));
  return result.data;
}

export function parseQuery(searchParams: URLSearchParams): PaginationQuery {
  return {
    page: clampInt(searchParams.get('page'), 1, 1, Number.MAX_SAFE_INTEGER),
    limit: clampInt(searchParams.get('limit'), PAGINATION_DEFAULTS.limit, 1, PAGINATION_DEFAULTS.maxLimit),
    sort: searchParams.get('sort') || undefined,
    order: searchParams.get('order') === 'asc' ? 'asc' : 'desc',
    search: searchParams.get('search')?.trim() || undefined,
  };
}

function clampInt(raw: string | null, fallback: number, min: number, max: number): number {
  const n = raw ? parseInt(raw, 10) : NaN;
  if (!Number.isFinite(n) || Number.isNaN(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

export function ok<T>(data: T, init?: number): NextResponse {
  return NextResponse.json(data, { status: init ?? 200 });
}

/**
 * Wraps a route handler with consistent error -> JSON mapping. Every API route should use this.
 * Generic over the params shape so a dynamic route's `{ params: { id: string } }` (what Next.js
 * actually infers) type-checks without forcing a `Record<string,string>` cast at every call site.
 */
export function withErrorHandling<P = Record<string, string>>(
  handler: (req: NextRequest, ctx: { params: P }) => Promise<NextResponse>
) {
  return async (req: NextRequest, ctx: { params: P }): Promise<NextResponse> => {
    try {
      return await handler(req, ctx);
    } catch (err) {
      return errorToResponse(err);
    }
  };
}

export function errorToResponse(err: unknown): NextResponse {
  if (err instanceof AuthError) {
    return NextResponse.json({ error: { code: err.code, message: err.message } }, { status: err.status });
  }
  if (err instanceof ApiValidationError) {
    return NextResponse.json(
      { error: { code: 'VALIDATION_ERROR', message: 'Please fix the highlighted fields.', fields: err.fields } },
      { status: 400 }
    );
  }
  if (err instanceof NotFoundError) {
    return NextResponse.json({ error: { code: 'NOT_FOUND', message: err.message } }, { status: 404 });
  }
  if (err instanceof BusinessRuleError) {
    return NextResponse.json(
      { error: { code: err.code, message: err.message, fields: err.fields } },
      { status: 422 }
    );
  }
  if (err && typeof err === 'object' && 'code' in err && (err as { code: unknown }).code === 11000) {
    return NextResponse.json(
      { error: { code: 'DUPLICATE', message: 'A record with this value already exists.' } },
      { status: 409 }
    );
  }
  // eslint-disable-next-line no-console
  console.error('Unhandled API error:', err);
  return NextResponse.json(
    { error: { code: 'INTERNAL_ERROR', message: 'Something went wrong. Please try again.' } },
    { status: 500 }
  );
}
