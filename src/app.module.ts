import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConvexModule } from './convex/convex.module';
import { ClassroomModule } from './classroom/classroom.module';
import { AgentModule } from './agent/agent.module';
import { AnalysisModule } from './analysis/analysis.module';
import { PlannerModule } from './planner/planner.module';
import { SummaryModule } from './summary/summary.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true, // Disponible en toda la app
      envFilePath: ['.env.local', '.env'], // Lee .env.local de Convex
    }),
    ConvexModule,
    ClassroomModule,
    AgentModule,
    AnalysisModule,
    PlannerModule,
    SummaryModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
