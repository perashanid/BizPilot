import { NextRequest } from 'next/server';
import { requireSession, requireRole, canViewPayroll } from '@/lib/auth';
import { parseJson, ok, withErrorHandling } from '@/lib/api-helpers';
import { getDocOr404, updateDocById } from '@/lib/repo';
import { recordAudit } from '@/lib/audit';
import { COLLECTIONS } from '@/lib/db';
import { zEmployeeInput, type Employee, type Role } from '@/lib/types';

export const runtime = 'nodejs';

function stripSalaryIfNeeded(employee: Employee, role: Role): Employee {
  if (canViewPayroll(role)) return employee;
  const { salary, ...rest } = employee;
  return rest as Employee;
}

export const GET = withErrorHandling(async (_req: NextRequest, { params }: { params: { id: string } }) => {
  const session = await requireSession();
  const employee = await getDocOr404<Employee>(COLLECTIONS.employees, session.businessId, params.id, 'Employee');
  return ok(stripSalaryIfNeeded(employee, session.role));
});

export const PATCH = withErrorHandling(async (req: NextRequest, { params }: { params: { id: string } }) => {
  const session = await requireSession();
  requireRole(session, ['owner', 'manager']);
  const before = await getDocOr404<Employee>(COLLECTIONS.employees, session.businessId, params.id, 'Employee');
  const input = await parseJson(req, zEmployeeInput.partial());
  const after = await updateDocById<Employee>(
    COLLECTIONS.employees,
    session.businessId,
    params.id,
    input,
    'Employee'
  );
  await recordAudit({
    businessId: session.businessId,
    userId: session.userId,
    action: 'update',
    entityType: COLLECTIONS.employees,
    entityId: params.id,
    before,
    after,
  });
  return ok(after);
});

export const DELETE = withErrorHandling(async (_req: NextRequest, { params }: { params: { id: string } }) => {
  const session = await requireSession();
  requireRole(session, ['owner', 'manager']);
  const before = await getDocOr404<Employee>(COLLECTIONS.employees, session.businessId, params.id, 'Employee');
  const after = await updateDocById<Employee>(
    COLLECTIONS.employees,
    session.businessId,
    params.id,
    { status: 'terminated' },
    'Employee'
  );
  await recordAudit({
    businessId: session.businessId,
    userId: session.userId,
    action: 'delete',
    entityType: COLLECTIONS.employees,
    entityId: params.id,
    before,
    after,
  });
  return ok(after);
});
