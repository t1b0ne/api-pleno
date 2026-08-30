import { Module } from '@nestjs/common';
import { SummaryService } from './summary.service';

@Module({
  providers: [SummaryService],
  exports: [SummaryService],
})
export class SummaryModule {}
