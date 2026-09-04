import { NextRequest } from 'next/server';
import { requireSession, requireRole, canViewPayroll } from '@/lib/auth';
import { parseJson, parseQuery, ok, withErrorHandling } from '@/lib/api-helpers';
import { listDocs, insertDoc } from '@/lib/repo';
import { recordAudit } from '@/lib/audit';
import { COLLECTIONS } from '@/lib/db';
import { zEmployeeInput, type Employee, type Role } from '@/lib/types';

export const runtime = 'nodejs';

function stripSalaryIfNeeded(employees: Employee[], role: Role): Employee[] {
  if (canViewPayroll(role)) return employees;
  return employees.map((employee) => {
    const { salary, ...rest } = employee;
    return rest as Employee;
  });
}

export const GET = withErrorHandling(async (req: NextRequest) => {
  const session = await requireSession();
  const query = parseQuery(req.nextUrl.searchParams);
  // Status filter, additive (mirrors the extraFilter pattern in app/api/tasks/route.ts) —
  // the employees list UI needs to filter by employment status alongside search/pagination.
  const status = req.nextUrl.searchParams.get('status') || undefined;
  const extraFilter: Record<string, unknown> = {};
  if (status) extraFilter.status = status;

  const result = await listDocs<Employee>(COLLECTIONS.employees, {
    businessId: session.businessId,
    ...query,
    searchFields: ['name', 'email', 'role', 'department'],
    extraFilter,
  });
  return ok({ ...result, data: stripSalaryIfNeeded(result.data, session.role) });
});

export const POST = withErrorHandling(async (req: NextRequest) => {
  const session = await requireSession();
  requireRole(session, ['owner', 'manager']);
  const input = await parseJson(req, zEmployeeInput);
  const employee = await insertDoc<Employee>(COLLECTIONS.employees, session.businessId, input);
  await recordAudit({
    businessId: session.businessId,
    userId: session.userId,
    action: 'create',
    entityType: COLLECTIONS.employees,
    entityId: employee._id,
    after: employee,
  });
  return ok(employee, 201);
});
