import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  Inject,
  NotFoundException,
  Param,
  Post,
  Put,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AUTH_ERRORS, type AuthenticatedRequest } from '../auth/contracts.js';
import { RequireStepUp } from '../auth/decorators.js';
import { ACCESS_ERRORS } from './access.errors.js';
import {
  AcceptInvitationBody,
  CreateInvitationBody,
  InvitationParam,
  SetRoleBody,
  Subject,
  SwitchTenantBody,
  TenantParam,
  parse,
} from './access.schemas.js';
import { AccessService } from './access.service.js';
import { hashInvitationToken } from './invitation-token.js';

/** The session set by the auth module's global SessionGuard (every route here needs one). */
function sessionOf(req: AuthenticatedRequest) {
  if (!req.session) throw new UnauthorizedException({ error: AUTH_ERRORS.notSignedIn });
  return req.session;
}

/** Endpoints as in planning/agentcity-migration/m03/DESIGN.md, "Access". */
@ApiTags('access')
@Controller('api')
export class AccessController {
  constructor(@Inject(AccessService) private readonly access: AccessService) {}

  @Get('access/memberships')
  async memberships(@Req() req: AuthenticatedRequest) {
    const s = sessionOf(req);
    return {
      current: { tenantId: s.tenantId, workspaceId: s.workspaceId },
      memberships: await this.access.memberships(s.subject),
    };
  }

  @Post('session/tenant')
  @HttpCode(200)
  switchTenant(@Req() req: AuthenticatedRequest, @Body() body: unknown) {
    const input = parse(SwitchTenantBody, body);
    return this.access.switchTenant(sessionOf(req), input.tenantId, input.workspaceId);
  }

  @Post('invitations')
  @RequireStepUp('permission')
  @Header('Cache-Control', 'no-store')
  createInvitation(@Req() req: AuthenticatedRequest, @Body() body: unknown) {
    return this.access.createInvitation(sessionOf(req), parse(CreateInvitationBody, body));
  }

  @Post('invitations/accept')
  @HttpCode(200)
  acceptInvitation(@Req() req: AuthenticatedRequest, @Body() body: unknown) {
    const { token } = parse(AcceptInvitationBody, body);
    return this.access.acceptInvitation(sessionOf(req), hashInvitationToken(token));
  }

  @Post('invitations/:id/token')
  @RequireStepUp('permission')
  @Header('Cache-Control', 'no-store')
  issueToken(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.access.issueToken(sessionOf(req), parse(InvitationParam, id));
  }

  @Put('tenants/:tenantId/members/:subject')
  @RequireStepUp('permission')
  setMemberRole(
    @Req() req: AuthenticatedRequest,
    @Param('tenantId') tenantId: string,
    @Param('subject') subject: string,
    @Body() body: unknown,
  ) {
    const input = parse(SetRoleBody, body);
    return this.access.setMemberRole(
      sessionOf(req),
      parse(TenantParam, tenantId),
      parse(Subject, subject),
      input.role,
      input.workspaceId,
    );
  }

  @Delete('tenants/:tenantId/members/:subject')
  @RequireStepUp('permission')
  removeMember(
    @Req() req: AuthenticatedRequest,
    @Param('tenantId') tenantId: string,
    @Param('subject') subject: string,
  ) {
    return this.access.removeMember(sessionOf(req), parse(TenantParam, tenantId), parse(Subject, subject));
  }

  @Put('agency/assignments/:tenantId/:subject')
  @RequireStepUp('permission')
  assign(@Req() req: AuthenticatedRequest, @Param('tenantId') tenantId: string, @Param('subject') subject: string) {
    return this.access.setAssignment(sessionOf(req), parse(TenantParam, tenantId), parse(Subject, subject), true);
  }

  @Delete('agency/assignments/:tenantId/:subject')
  @RequireStepUp('permission')
  async unassign(
    @Req() req: AuthenticatedRequest,
    @Param('tenantId') tenantId: string,
    @Param('subject') subject: string,
  ) {
    const r = await this.access.setAssignment(
      sessionOf(req),
      parse(TenantParam, tenantId),
      parse(Subject, subject),
      false,
    );
    if (!r.changed) throw new NotFoundException({ error: ACCESS_ERRORS.notFound });
    return r;
  }
}
