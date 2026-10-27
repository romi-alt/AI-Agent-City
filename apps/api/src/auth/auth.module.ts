import { Module } from '@nestjs/common';

/** Owner: M03 agent B (OIDC client, sessions, devices, step-up). Must export SessionGuard and StepUpGuard. */
@Module({ providers: [], controllers: [], exports: [] })
export class AuthModule {}
