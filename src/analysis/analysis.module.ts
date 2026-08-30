import { Module } from '@nestjs/common';
import { AnalysisService } from './analysis.service';
import { SummaryModule } from '../summary/summary.module';

@Module({
  imports: [SummaryModule],
  providers: [AnalysisService],
  exports: [AnalysisService],
})
export class AnalysisModule {}
