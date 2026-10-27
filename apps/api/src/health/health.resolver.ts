import { Query, Resolver } from '@nestjs/graphql';
import { LivenessDto, ReadinessReportDto } from './health.dto.js';
import { SERVICE_VERSION } from './health.controller.js';
import { ReadinessService } from './readiness.service.js';

/** GraphQL view of the same health data as REST, from the same service. */
@Resolver()
export class HealthResolver {
  constructor(private readonly readinessService: ReadinessService) {}

  @Query(() => LivenessDto)
  liveness(): LivenessDto {
    return { status: 'alive', service: 'agentcity-api', version: SERVICE_VERSION };
  }

  @Query(() => ReadinessReportDto)
  readiness(): Promise<ReadinessReportDto> {
    return this.readinessService.report();
  }
}
