import { type MiddlewareConsumer, Module, type NestModule } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { AccessModule } from '../access/access.module.js';
import { isValidRequestId, requestIdMiddleware } from '../common/request-id.js';
import { demoConfigProvider } from './demo.config.js';
import { AdminLeadsController, DemoController } from './demo.controller.js';
import { DemoService } from './demo.service.js';

const assignRequestId = requestIdMiddleware();
/** The M04 request id, unless an earlier (global) middleware already assigned one. */
function demoRequestId(req: Request, res: Response, next: NextFunction) {
  if (isValidRequestId((req as Request & { requestId?: string }).requestId)) return next();
  return assignRequestId(req, res, next);
}

/**
 * Owner: X01 workstream C. Lead capture → demo provisioning (database + Keycloak) → claim after email verification
 * and sign-in → demo workspace data; platform-owner lead list; expiry runs in the worker (apps/worker/src/demo-*).
 * Uses APP_POOL, REDIS and API_ENV from the global modules, the auth module's global guards, and AccessService to
 * switch the session into the claimed demo.
 */
@Module({
  imports: [AccessModule],
  providers: [demoConfigProvider, DemoService],
  controllers: [DemoController, AdminLeadsController],
  exports: [DemoService],
})
export class DemoModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(demoRequestId).forRoutes(DemoController, AdminLeadsController);
  }
}
