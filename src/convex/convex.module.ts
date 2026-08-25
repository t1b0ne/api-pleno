import { Module, Global } from '@nestjs/common';
import { ConvexService } from './convex.service';

@Global() 
@Module({
  providers: [ConvexService],
  exports: [ConvexService],
})
export class ConvexModule {}