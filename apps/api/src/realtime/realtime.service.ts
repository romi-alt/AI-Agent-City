import { Inject, Injectable } from '@nestjs/common';
import { RealtimeGateway } from './realtime.gateway.js';

/**
 * How other modules push events to browsers. Everything is addressed to one tenant's room; there is deliberately no
 * global broadcast, so a missing tenant id is a bug, not "send to everyone".
 */
@Injectable()
export class RealtimeService {
  constructor(@Inject(RealtimeGateway) private readonly gateway: RealtimeGateway) {}

  publishToTenant(tenantId: string, event: string, payload: unknown): void {
    if (!tenantId) throw new Error('publishToTenant needs a tenant id');
    if (!event) throw new Error('publishToTenant needs an event name');
    this.gateway.toTenant(tenantId, event, payload);
  }
}
