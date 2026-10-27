import { join } from 'node:path';
import { ApolloDriver, type ApolloDriverConfig } from '@nestjs/apollo';
import { type DynamicModule, Module } from '@nestjs/common';
import { GraphQLModule } from '@nestjs/graphql';
import { HeartbeatController } from './dev/heartbeat.controller.js';
import { API_ENV, type ApiEnv } from './env.js';
import { HealthController } from './health/health.controller.js';
import { HealthResolver } from './health/health.resolver.js';
import { ReadinessService } from './health/readiness.service.js';

export const GENERATED_DIR = join(import.meta.dirname, '..', 'generated');

@Module({})
export class AppModule {
  static forEnv(env: ApiEnv): DynamicModule {
    return {
      module: AppModule,
      imports: [
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
      providers: [{ provide: API_ENV, useValue: env }, ReadinessService, HealthResolver],
    };
  }
}
