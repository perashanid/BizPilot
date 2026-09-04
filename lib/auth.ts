import bcrypt from 'bcryptjs';
import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import { ObjectId } from 'mongodb';
import { col, COLLECTIONS } from './db';
import type { Role, SessionUser, User } from './types';

const SESSION_COOKIE = 'sme_session';
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days

function getSecretKey(): Uint8Array {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error('SESSION_SECRET is not set or is too short. See .env.example.');
  }
  return new TextEncoder().encode(secret);
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export async function createSessionCookie(user: SessionUser): Promise<void> {
  const token = await new SignJWT({ ...user })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(getSecretKey());

  cookies().set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_TTL_SECONDS,
  });
}

export function clearSessionCookie(): void {
  cookies().set(SESSION_COOKIE, '', { path: '/', maxAge: 0 });
}

/** Reads and verifies the session cookie. Returns null if absent or invalid — never throws. */
export async function getSession(): Promise<SessionUser | null> {
  const token = cookies().get(SESSION_COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, getSecretKey());
    const { userId, businessId, role, name, email } = payload as Record<string, unknown>;
    if (typeof userId !== 'string' || typeof businessId !== 'string' || typeof role !== 'string') return null;
    return { userId, businessId, role: role as Role, name: name as string, email: email as string };
  } catch {
    return null;
  }
}

export class AuthError extends Error {
  status: number;
  code: string;
  constructor(message: string, status = 401, code = 'UNAUTHORIZED') {
    super(message);
    this.status = status;
    this.code = code;
  }
}

/** Throws AuthError(401) if not logged in. Use at the top of every protected API route. */
export async function requireSession(): Promise<SessionUser> {
  const session = await getSession();
  if (!session) throw new AuthError('You must be signed in.', 401, 'UNAUTHORIZED');
  return session;
}

const ROLE_RANK: Record<Role, number> = { staff: 0, accountant: 1, manager: 2, owner: 3 };

/** Throws AuthError(403) if the session's role is not one of `roles`. */
export function requireRole(session: SessionUser, roles: Role[]): void {
  if (!roles.includes(session.role)) {
    throw new AuthError('You do not have permission to perform this action.', 403, 'FORBIDDEN');
  }
}

/** Role-based module access. staff cannot see financials/payroll; accountant is read-only on financials. */
export function canViewFinancials(role: Role): boolean {
  return role === 'owner' || role === 'manager' || role === 'accountant';
}
export function canEditFinancials(role: Role): boolean {
  return role === 'owner' || role === 'manager';
}
export function canManageInventory(role: Role): boolean {
  return role !== 'accountant';
}
export function canManageUsers(role: Role): boolean {
  return role === 'owner';
}
export function canViewPayroll(role: Role): boolean {
  return role === 'owner' || role === 'manager';
}

export async function findUserByEmail(businessId: string, email: string): Promise<User | null> {
  const users = await col<User>(COLLECTIONS.users);
  return users.findOne({ businessId, email: email.toLowerCase() });
}

/**
 * Email is unique per business, not globally, so login (which only has an email + password,
 * no businessId) must check every account with that email and verify the password against each.
 * In practice this list has 1 entry; it's rare for the same person to run multiple businesses
 * with the same login email.
 */
export async function findUsersByEmailAnyBusiness(email: string): Promise<User[]> {
  const users = await col<User>(COLLECTIONS.users);
  return users.find({ email: email.toLowerCase() }).toArray();
}

export async function findUserById(id: string): Promise<User | null> {
  if (!ObjectId.isValid(id)) return null;
  const users = await col<User>(COLLECTIONS.users);
  return users.findOne({ _id: id });
}

export function toPublicUser(user: User): Omit<User, 'passwordHash'> {
  const { passwordHash, ...rest } = user;
  return rest;
}
