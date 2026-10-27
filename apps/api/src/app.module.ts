import { join } from 'node:path';
import { ApolloDriver, type ApolloDriverConfig } from '@nestjs/apollo';
import { type DynamicModule, Module } from '@nestjs/common';
import { GraphQLModule } from '@nestjs/graphql';
import { AccessModule } from './access/access.module.js';
import { AuthModule } from './auth/auth.module.js';
import { DemoModule } from './demo/demo.module.js';
import { HeartbeatController } from './dev/heartbeat.controller.js';
import { API_ENV, type ApiEnv } from './env.js';
import { HealthController } from './health/health.controller.js';
import { HealthResolver } from './health/health.resolver.js';
import { ReadinessService } from './health/readiness.service.js';
import { PlatformModule } from './platform/platform.module.js';
import { RealtimeModule } from './realtime/realtime.module.js';

export const GENERATED_DIR = join(import.meta.dirname, '..', 'generated');

/** Makes the validated environment injectable everywhere (API_ENV). */
@Module({})
class EnvModule {}

@Module({})
export class AppModule {
  static forEnv(env: ApiEnv): DynamicModule {
    return {
      module: AppModule,
      imports: [
        { module: EnvModule, global: true, providers: [{ provide: API_ENV, useValue: env }], exports: [API_ENV] },
        PlatformModule,
        AuthModule,
        AccessModule,
        RealtimeModule,
        DemoModule,
        GraphQLModule.forRoot<ApolloDriverConfig>({
          driver: ApolloDriver,
          // Code-first: the schema is generated from the resolvers and written for consumers to compile against.
          autoSchemaFile: join(GENERATED_DIR, 'schema.graphql'),
          sortSchema: true,
          playground: false,
          introspection: env.NODE_ENV !== 'production',
        }),
      ],
      controllers: [HealthController, ...(env.ENABLE_DEV_ROUTES ? [HeartbeatController] : [])],
      providers: [ReadinessService, HealthResolver],
    };
  }
}
