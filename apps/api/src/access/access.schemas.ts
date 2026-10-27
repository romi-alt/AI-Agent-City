import { BadRequestException } from '@nestjs/common';
import { z } from 'zod';
import { ACCESS_ERRORS } from './access.errors.js';

const Uuid = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, 'must be a UUID');
/** Same rule as app.enter_scope: `kc:<keycloak sub>` and friends. */
export const Subject = z.string().regex(/^[A-Za-z0-9._@:+-]{1,200}$/, 'invalid subject');
export const Role = z.enum(['agency-owner', 'agency-staff', 'client-admin', 'client-viewer']);
export type Role = z.infer<typeof Role>;

export const SwitchTenantBody = z.strictObject({ tenantId: Uuid, workspaceId: Uuid.nullish() });
export const CreateInvitationBody = z.strictObject({
  email: z.string().trim().min(3).max(320),
  role: Role,
  workspaceId: Uuid.nullish(),
});
/** 256-bit token, base64url without padding. */
export const AcceptInvitationBody = z.strictObject({ token: z.string().regex(/^[A-Za-z0-9_-]{43}$/, 'invalid token') });
export const SetRoleBody = z.strictObject({ role: Role, workspaceId: Uuid.nullish() });
export const TenantParam = Uuid;
export const InvitationParam = Uuid;

/** Parses or answers 400 `{ error: 'invalid_request', issues }`. Issue messages never echo the token. */
export function parse<T extends z.ZodType>(schema: T, value: unknown): z.infer<T> {
  const r = schema.safeParse(value);
  if (!r.success) {
    throw new BadRequestException({
      error: ACCESS_ERRORS.invalidRequest,
      issues: r.error.issues.map(i => `${i.path.join('.') || 'value'}: ${i.message}`),
    });
  }
  return r.data;
}
