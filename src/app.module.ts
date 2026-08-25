import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConvexModule } from './convex/convex.module';
import { ClassroomModule } from './classroom/classroom.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true, // Disponible en toda la app
      envFilePath: ['.env.local', '.env'], // Lee .env.local de Convex
    }),
    ConvexModule,
    ClassroomModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}