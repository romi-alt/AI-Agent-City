import { ApiProperty } from '@nestjs/swagger';
import { Field, Int, ObjectType } from '@nestjs/graphql';

// One class per contract serves both OpenAPI (@ApiProperty) and GraphQL (@Field). The runtime shape is
// defined once, in @agentcity/contracts (zod); these classes only describe it to the two schema generators.

@ObjectType('DependencyCheck')
export class DependencyCheckDto {
  @ApiProperty({ enum: ['postgres', 'redis', 'objectStorage', 'temporal'] }) @Field() name!: string;
  @ApiProperty() @Field() ok!: boolean;
  @ApiProperty({ description: 'Short reason; never a connection string or credential' }) @Field() detail!: string;
  @ApiProperty() @Field(() => Int) latencyMs!: number;
}

@ObjectType('ReadinessReport')
export class ReadinessReportDto {
  @ApiProperty({ enum: ['ready', 'not-ready'] }) @Field() status!: string;
  @ApiProperty() @Field() checkedAt!: string;
  @ApiProperty({ type: [DependencyCheckDto] }) @Field(() => [DependencyCheckDto]) checks!: DependencyCheckDto[];
}

@ObjectType('Liveness')
export class LivenessDto {
  @ApiProperty({ enum: ['alive'] }) @Field() status!: string;
  @ApiProperty() @Field() service!: string;
  @ApiProperty() @Field() version!: string;
}
