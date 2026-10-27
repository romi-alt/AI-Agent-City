import { SetMetadata } from '@nestjs/common';
import type { StepUpReason } from './contracts.js';

// The auth module registers SessionGuard globally (APP_GUARD): every route needs a session unless marked @Public().
export const IS_PUBLIC = 'agentcity:public';
/** No session needed (health checks, the sign-in start/callback, back-channel logout). */
export const Public = () => SetMetadata(IS_PUBLIC, true);

export const STEP_UP = 'agentcity:step-up';
/** Needs a fresh strong sign-in (see DESIGN.md); enforced by the auth module's guard. */
export const RequireStepUp = (reason: StepUpReason) => SetMetadata(STEP_UP, reason);
