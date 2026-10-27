import { Public } from '../auth/decorators.js';
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Inject,
  NotFoundException,
  Param,
  Post,
  type OnModuleDestroy,
} from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { HeartbeatInput, PLATFORM_TASK_QUEUE, type HeartbeatResult } from '@agentcity/contracts';
import { Client, Connection, WorkflowIdConflictPolicy, WorkflowNotFoundError } from '@temporalio/client';
import { API_ENV, type ApiEnv } from '../env.js';

/**
 * Development-only round trip: API → Temporal → worker → database → back. Registered only when
 * ENABLE_DEV_ROUTES=true (refused in production). No authentication yet (that is M03), which is why it is
 * development-only. It contacts nothing outside our own services.
 */
@Public()
@ApiExcludeController()
@Controller('dev/heartbeat')
export class HeartbeatController implements OnModuleDestroy {
  private client?: Client;

  constructor(@Inject(API_ENV) private readonly env: ApiEnv) {}

  private async temporal() {
    if (!this.client) {
      const connection = await Connection.connect({ address: this.env.TEMPORAL_ADDRESS });
      this.client = new Client({ connection, namespace: this.env.TEMPORAL_NAMESPACE });
    }
    return this.client;
  }

  /** Start a run (or return the existing one with the same id) without waiting for it. */
  @Post()
  async start(@Body() body: unknown) {
    const input = HeartbeatInput.safeParse(body);
    if (!input.success)
      throw new BadRequestException(input.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; '));
    const client = await this.temporal();
    const handle = await client.workflow.start('heartbeat', {
      taskQueue: PLATFORM_TASK_QUEUE,
      workflowId: `heartbeat-${input.data.runId}`,
      args: [input.data],
      workflowIdConflictPolicy: WorkflowIdConflictPolicy.USE_EXISTING,
    });
    return { workflowId: handle.workflowId, runId: input.data.runId };
  }

  /** Wait for a run to finish and return what the worker recorded. */
  @Get(':runId')
  async result(@Param('runId') runId: string): Promise<HeartbeatResult> {
    const client = await this.temporal();
    try {
      return await client.workflow.getHandle(`heartbeat-${runId}`).result();
    } catch (e) {
      if (e instanceof WorkflowNotFoundError) throw new NotFoundException('No such heartbeat run');
      throw e;
    }
  }

  async onModuleDestroy() {
    await this.client?.connection.close();
  }
}
