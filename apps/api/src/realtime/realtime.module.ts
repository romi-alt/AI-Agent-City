import { Module } from '@nestjs/common';
import { RealtimeGateway } from './realtime.gateway.js';
import { DEFAULT_REALTIME_OPTIONS, REALTIME_OPTIONS } from './realtime.options.js';
import { RealtimeService } from './realtime.service.js';

/**
 * Authenticated Socket.IO gateway that disconnects sockets on revocation (DESIGN.md "Revocation and realtime").
 * Needs SESSION_RESOLVER (auth module, global) and RevocationBus (platform module, global).
 */
@Module({
  providers: [{ provide: REALTIME_OPTIONS, useValue: DEFAULT_REALTIME_OPTIONS }, RealtimeGateway, RealtimeService],
  exports: [RealtimeService],
})
export class RealtimeModule {}
