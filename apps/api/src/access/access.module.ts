import { Module } from '@nestjs/common';
import { AccessController } from './access.controller.js';
import { AccessService } from './access.service.js';

/**
 * Owner: M03 agent C (roles, assignments, tenant switching, invitations, membership changes). Uses APP_POOL,
 * RevocationBus and API_ENV from the global platform/env modules; reads the caller from req.session, which the auth
 * module's global SessionGuard sets (this module never imports the guard).
 */
@Module({ providers: [AccessService], controllers: [AccessController], exports: [AccessService] })
export class AccessModule {}
