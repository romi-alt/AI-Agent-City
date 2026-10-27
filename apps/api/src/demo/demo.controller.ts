import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  Inject,
  Param,
  Post,
  Query,
  Req,
  Res,
  UnauthorizedException,
  UseFilters,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { AUTH_ERRORS, type AuthenticatedRequest } from '../auth/contracts.js';
import { Public, RequireStepUp } from '../auth/decorators.js';
import { authError, singleHeader } from '../auth/http-util.js';
import { parsePageSize } from '../common/pagination.js';
import { API_ENV, type ApiEnv } from '../env.js';
import { DemoErrorFilter } from './demo.errors.js';
import { DemoService, leadsCsv } from './demo.service.js';

function sessionOf(req: AuthenticatedRequest) {
  if (!req.session) throw new UnauthorizedException({ error: AUTH_ERRORS.notSignedIn });
  return req.session;
}
const clientIp = (req: Request) => req.ip ?? req.socket.remoteAddress ?? 'unknown';

/** The demo funnel's routes, as in PLAN.md "API contract (demo module)". */
@ApiTags('demo')
@Controller('api/demo')
@UseFilters(DemoErrorFilter)
export class DemoController {
  constructor(
    @Inject(DemoService) private readonly demo: DemoService,
    @Inject(API_ENV) private readonly env: ApiEnv,
  ) {}

  /** `{ token }` to put in the form; a submission sooner than DEMO_FORM_MIN_SECONDS after this is refused. */
  @Public()
  @Get('form-token')
  @Header('Cache-Control', 'no-store')
  formToken(@Req() req: Request) {
    return this.demo.formToken(clientIp(req));
  }

  /** `202 { requestId, status: 'verification-sent' }` for new and known addresses alike. */
  @Public()
  @Post('requests')
  @HttpCode(202)
  @Header('Cache-Control', 'no-store')
  submit(@Req() req: Request, @Body() body: unknown) {
    // A public write still only accepts posts from our own pages.
    if (singleHeader(req, 'origin') !== this.env.PUBLIC_ORIGIN) throw authError(AUTH_ERRORS.badOrigin);
    return this.demo.submit(body, clientIp(req));
  }

  /** `{ status }` only: no personal data. The id is unguessable. */
  @Public()
  @Get('requests/:requestId')
  @Header('Cache-Control', 'no-store')
  status(@Req() req: Request, @Param('requestId') requestId: string) {
    return this.demo.status(requestId, clientIp(req));
  }

  @Post('claim')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  claim(@Req() req: AuthenticatedRequest) {
    return this.demo.claim(sessionOf(req));
  }

  @Get('workspace')
  @Header('Cache-Control', 'no-store')
  workspace(@Req() req: AuthenticatedRequest) {
    return this.demo.workspace(sessionOf(req));
  }
}

/** Demo leads for platform owners (owners of the "AgentCity demos" agency), after a fresh strong sign-in. */
@ApiTags('demo')
@Controller('api/admin')
@UseFilters(DemoErrorFilter)
export class AdminLeadsController {
  constructor(@Inject(DemoService) private readonly demo: DemoService) {}

  /** `{ items: Lead[], pageInfo: { hasNextPage, endCursor } }`; `?first=1..100&after=<endCursor>`. */
  @Get('leads')
  @RequireStepUp('permission')
  @Header('Cache-Control', 'no-store')
  leads(@Req() req: AuthenticatedRequest, @Query('first') first?: string, @Query('after') after?: string) {
    return this.demo.leads(sessionOf(req), parsePageSize(first), after);
  }

  @Get('leads.csv')
  @RequireStepUp('permission')
  async leadsCsv(@Req() req: AuthenticatedRequest, @Res() res: Response) {
    const rows = await this.demo.allLeads(sessionOf(req));
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="agentcity-demo-leads.csv"');
    res.send(leadsCsv(rows));
  }
}
