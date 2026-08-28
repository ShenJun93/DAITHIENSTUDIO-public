/**
 * Operator identity for approvals.
 *
 * The studio is single-operator, so this is deliberately minimal: a
 * `X-Studio-Operator` header carrying an operator email resolves to a row in
 * the `users` table; when the header is absent the default owner from
 * `workspaces.ensureDefault()` is used. `decidedBy` is therefore never null on
 * an approval recorded through a route or server action.
 */
import { headers } from 'next/headers';
import type { Studio } from '@/application/ports';
import { DomainError } from '@/domain/errors';

export const OPERATOR_HEADER = 'x-studio-operator';

export async function resolveOperatorId(studio: Studio, operatorEmail: string | null): Promise<string> {
  const email = operatorEmail?.trim();
  if (email) {
    const user = await studio.users.byEmail(email);
    if (!user) {
      throw new DomainError('UNAUTHORIZED', `No studio user matches operator email "${email}".`);
    }
    return user.id;
  }
  const { ownerId } = await studio.workspaces.ensureDefault();
  return ownerId;
}

/** Resolves the current operator for a server action from the request headers. */
export async function resolveOperatorIdFromRequest(studio: Studio): Promise<string> {
  const headerStore = await headers();
  return resolveOperatorId(studio, headerStore.get(OPERATOR_HEADER));
}
