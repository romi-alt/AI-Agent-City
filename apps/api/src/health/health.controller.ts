import { Public } from '../auth/decorators.js';
import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import { ApiOkResponse, ApiServiceUnavailableResponse, ApiTags } from '@nestjs/swagger';
import type { Liveness, ReadinessReport } from '@agentcity/contracts';
import type { Response } from 'express';
import { ReadinessService } from './readiness.service.js';
import { LivenessDto, ReadinessReportDto } from './health.dto.js';

export const SERVICE_VERSION = '0.0.0';

@Public()
@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(private readonly readiness: ReadinessService) {}

  @Get('live')
  @ApiOkResponse({ type: LivenessDto, description: 'The process is up. Says nothing about dependencies.' })
  live(): Liveness {
    return { status: 'alive', service: 'agentcity-api', version: SERVICE_VERSION };
  }

  @Get('ready')
  @ApiOkResponse({ type: ReadinessReportDto, description: 'Every dependency answered.' })
  @ApiServiceUnavailableResponse({ type: ReadinessReportDto, description: 'At least one dependency is unavailable.' })
  async ready(@Res({ passthrough: true }) res: Response): Promise<ReadinessReport> {
    const report = await this.readiness.report();
    res.status(report.status === 'ready' ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE);
    return report;
  }
}
