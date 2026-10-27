import { ConflictException, Inject, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { withScope } from '@agentcity/db';
import type pg from 'pg';
import { AUTH_ERRORS, type SessionContext } from '../auth/contracts.js';
import { API_ENV, type ApiEnv } from '../env.js';
import { APP_POOL } from '../platform/platform.module.js';
import { RevocationBus } from '../platform/revocation-bus.js';
import { rethrowAccessError } from './access.errors.js';
import type { Role } from './access.schemas.js';
import { invitationLink, newInvitationToken } from './invitation-token.js';

export interface Membership {
  tenantId: string;
  tenantName: string;
  tenantKind: 'client' | 'agency' | 'demo';
  agencyId: string;
  role: Role | 'support';
  /** Set when the membership is limited to one workspace. */
  workspaceId: string | null;
  workspaces: { id: string; name: string; kind: string }[];
}

/**
 * Roles, tenant switching, invitations, role changes, removals and staff assignments. Every membership write is a
 * SECURITY DEFINER function in the database (migration 1793145600001_access.sql) that checks the caller's own
 * membership; this service only passes the signed-in subject, never a role the client claims.
 */
@Injectable()
export class AccessService {
  private readonly log = new Logger('AccessService');

  constructor(
    @Inject(APP_POOL) private readonly pool: pg.Pool,
    @Inject(RevocationBus) private readonly bus: RevocationBus,
    @Inject(API_ENV) private readonly env: ApiEnv,
  ) {}

  private get ttl() {
    return `${this.env.INVITATION_TTL_HOURS} hours`;
  }

  async memberships(subject: string): Promise<Membership[]> {
    const r = await this.pool.query('SELECT * FROM app.list_memberships($1)', [subject]);
    return r.rows.map(row => ({
      tenantId: row.tenant_id,
      tenantName: row.tenant_name,
      tenantKind: row.tenant_kind,
      agencyId: row.agency_id,
      role: row.role,
      workspaceId: row.workspace_id,
      workspaces: row.workspaces,
    }));
  }

  /**
   * Proves the person may enter the tenant (app.enter_scope, in a transaction) and stores the choice on their
   * session in that same transaction. A member limited to one workspace gets that workspace when none is named.
   */
  async switchTenant(session: SessionContext, tenantId: string, workspaceId: string | null | undefined) {
    let ws = workspaceId ?? null;
    if (workspaceId === undefined) {
      const limited = await this.pool.query<{ workspace_id: string | null }>(
        'SELECT workspace_id FROM app.list_memberships($1) WHERE tenant_id = $2',
        [session.subject, tenantId],
      );
      ws = limited.rows[0]?.workspace_id ?? null;
    }
    try {
      return await withScope(this.pool, { subject: session.subject, tenantId, workspaceId: ws }, async c => {
        const u = await c.query(
          `UPDATE identity.session SET tenant_id = $1, workspace_id = $2
           WHERE id = $3 AND subject = $4 AND revoked_at IS NULL`,
          [tenantId, ws, session.sessionId, session.subject],
        );
        if (u.rowCount !== 1) throw new UnauthorizedException({ error: AUTH_ERRORS.sessionRevoked });
        const role = await c.query<{ role: string }>('SELECT app.current_scope_role() AS role');
        return { tenantId, workspaceId: ws, role: role.rows[0]!.role };
      });
    } catch (e) {
      rethrowAccessError(e);
    }
  }

  private currentTenant(session: SessionContext) {
    if (!session.tenantId) throw new ConflictException({ error: AUTH_ERRORS.noTenant });
    return session.tenantId;
  }

  /** Creates (or renews) an invitation in the current tenant. The link is returned here once, and nowhere else. */
  async createInvitation(session: SessionContext, input: { email: string; role: Role; workspaceId?: string | null }) {
    const tenantId = this.currentTenant(session);
    const { token, sha256 } = newInvitationToken();
    try {
      const r = await this.pool.query<{ invitation_id: string; expires_at: Date }>(
        'SELECT * FROM app.create_invitation($1, $2, $3, $4, $5, $6, $7::interval)',
        [session.subject, tenantId, input.email, input.role, input.workspaceId ?? null, sha256, this.ttl],
      );
      const row = r.rows[0]!;
      return {
        invitationId: row.invitation_id,
        tenantId,
        role: input.role,
        workspaceId: input.workspaceId ?? null,
        expiresAt: row.expires_at.toISOString(),
        link: invitationLink(this.env.PUBLIC_ORIGIN, token),
      };
    } catch (e) {
      rethrowAccessError(e);
    }
  }

  /** A fresh link for an existing invitation in the current tenant (agency owners). Earlier links stop working. */
  async issueToken(session: SessionContext, invitationId: string) {
    const tenantId = this.currentTenant(session);
    const { token, sha256 } = newInvitationToken();
    try {
      const r = await this.pool.query<{ expires_at: Date }>(
        'SELECT app.issue_invitation_token($1, $2, $3, $4, $5::interval) AS expires_at',
        [session.subject, tenantId, invitationId, sha256, this.ttl],
      );
      return {
        invitationId,
        tenantId,
        expiresAt: r.rows[0]!.expires_at.toISOString(),
        link: invitationLink(this.env.PUBLIC_ORIGIN, token),
      };
    } catch (e) {
      rethrowAccessError(e, 'issue');
    }
  }

  /** Accepts with the signed-in person's own (verified) email, as recorded at sign-in. */
  async acceptInvitation(session: SessionContext, tokenSha256: string) {
    try {
      const r = await this.pool.query<{ tenant_id: string; workspace_id: string | null; role: Role }>(
        'SELECT * FROM app.accept_invitation($1, $2, $3, $4)',
        [session.subject, session.email, session.emailVerified, tokenSha256],
      );
      const row = r.rows[0]!;
      return { tenantId: row.tenant_id, workspaceId: row.workspace_id, role: row.role };
    } catch (e) {
      rethrowAccessError(e);
    }
  }

  async setMemberRole(
    session: SessionContext,
    tenantId: string,
    subject: string,
    role: Role,
    workspaceId: string | null | undefined,
  ) {
    let r: pg.QueryResult<{ previous_role: string; affected_tenants: string[] }>;
    try {
      r = await this.pool.query('SELECT * FROM app.set_member_role($1, $2, $3, $4, $5)', [
        session.subject,
        tenantId,
        subject,
        role,
        workspaceId ?? null,
      ]);
    } catch (e) {
      rethrowAccessError(e);
    }
    const row = r.rows[0]!;
    await this.revoked(subject, row.affected_tenants, 'role-changed');
    return { tenantId, subject, role, workspaceId: workspaceId ?? null, previousRole: row.previous_role };
  }

  async removeMember(session: SessionContext, tenantId: string, subject: string) {
    let r: pg.QueryResult<{ removed_role: string; affected_tenants: string[] }>;
    try {
      r = await this.pool.query('SELECT * FROM app.remove_member($1, $2, $3)', [session.subject, tenantId, subject]);
    } catch (e) {
      rethrowAccessError(e);
    }
    const row = r.rows[0]!;
    await this.revoked(subject, row.affected_tenants, 'member-removed');
    return { tenantId, subject, removedRole: row.removed_role };
  }

  async setAssignment(session: SessionContext, tenantId: string, subject: string, assigned: boolean) {
    let changed: boolean;
    try {
      const r = await this.pool.query<{ changed: boolean }>('SELECT app.set_assignment($1, $2, $3, $4) AS changed', [
        session.subject,
        tenantId,
        subject,
        assigned,
      ]);
      changed = r.rows[0]!.changed;
    } catch (e) {
      rethrowAccessError(e);
    }
    if (changed && !assigned) await this.revoked(subject, [tenantId], 'staff-unassigned');
    return { tenantId, subject, assigned, changed };
  }

  /**
   * Tells every API instance (realtime disconnects the person's sockets in these tenants). The database change is
   * already committed and every request re-enters scope, so a failed publish delays only the socket reaction; the
   * realtime module's periodic re-check is the backstop.
   */
  private async revoked(subject: string, tenants: string[], reason: string) {
    for (const tenantId of tenants) {
      try {
        await this.bus.publish({ kind: 'membership', subject, tenantId, reason });
      } catch (e) {
        this.log.warn(`membership revocation not published (${reason}): ${(e as Error).message}`);
      }
    }
  }
}
