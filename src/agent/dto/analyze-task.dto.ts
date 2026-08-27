import { IsObject, IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class AnalyzeTaskDto {
  @IsOptional()
  @IsObject()
  @ApiPropertyOptional({
    description: 'Respuestas del usuario para mejorar el análisis',
    example: {
      experience: 'intermedio en Python',
      availableTime: '2 horas',
      objective: 'aprender resolución de problemas',
    },
  })
  answers?: Record<string, string>;
}
