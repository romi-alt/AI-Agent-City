import { Global, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AuthController } from './auth.controller.js';
import { SESSION_RESOLVER } from './contracts.js';
import { DeviceProofVerifier } from './device-proof.js';
import { SessionGuard, StepUpGuard } from './guards.js';
import { OidcClient } from './oidc.js';
import { AuthSessionResolver } from './session-resolver.js';
import { SessionService } from './session.service.js';

/**
 * OIDC backend-for-frontend: sign-in, server sessions bound to a device key, step-up, logout and revocation
 * (DESIGN.md "Auth", "Device binding", "Revocation"). Registers SessionGuard and then StepUpGuard as global guards
 * (in that order), and provides SESSION_RESOLVER for Socket.IO handshakes. Needs API_ENV, APP_POOL, REDIS and
 * RevocationBus from the global env and platform modules.
 */
// Global so realtime and access can inject SESSION_RESOLVER and SessionService without importing this module.
@Global()
@Module({
  controllers: [AuthController],
  providers: [
    OidcClient,
    DeviceProofVerifier,
    SessionService,
    SessionGuard,
    StepUpGuard,
    { provide: APP_GUARD, useExisting: SessionGuard },
    { provide: APP_GUARD, useExisting: StepUpGuard },
    AuthSessionResolver,
    { provide: SESSION_RESOLVER, useExisting: AuthSessionResolver },
  ],
  exports: [SESSION_RESOLVER, SessionService, SessionGuard, StepUpGuard],
})
export class AuthModule {}
