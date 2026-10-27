import 'reflect-metadata';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule, GENERATED_DIR } from './app.module.js';
import { loadEnv } from './env.js';

const env = loadEnv();
const app = await NestFactory.create(AppModule.forEnv(env), { logger: ['error', 'warn', 'log'] });
app.enableShutdownHooks();

const openapi = SwaggerModule.createDocument(
  app,
  new DocumentBuilder()
    .setTitle('AgentCity API')
    .setDescription('REST contract. GraphQL schema: generated/schema.graphql. M01 covers health only.')
    .setVersion('0.0.0')
    .build(),
);
mkdirSync(GENERATED_DIR, { recursive: true });
writeFileSync(join(GENERATED_DIR, 'openapi.json'), `${JSON.stringify(openapi, null, 2)}\n`);
SwaggerModule.setup('docs', app, openapi);

if (process.argv.includes('--write-contracts')) {
  // Build the schema files without serving: init() runs the GraphQL schema generation too.
  await app.init();
  await app.close();
  console.log(`[api] wrote ${join(GENERATED_DIR, 'openapi.json')} and schema.graphql`);
} else {
  await app.listen(env.API_PORT, '127.0.0.1');
  console.log(
    `[api] listening on http://127.0.0.1:${env.API_PORT} (REST /health/*, GraphQL /graphql, OpenAPI /docs)${env.ENABLE_DEV_ROUTES ? ' with dev routes' : ''}`,
  );
}
