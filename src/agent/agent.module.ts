import { Module } from '@nestjs/common';
import { AgentController } from './agent.controller';
import { AgentService } from './agent.service';
import { AnalysisModule } from '../analysis/analysis.module';
import { PlannerModule } from '../planner/planner.module';

@Module({
  imports: [AnalysisModule, PlannerModule],
  controllers: [AgentController],
  providers: [AgentService],
})
export class AgentModule {}
