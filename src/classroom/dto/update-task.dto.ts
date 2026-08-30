import { IsOptional, IsString, IsIn, IsNumber } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateTaskDto {
  @ApiPropertyOptional({ enum: ['todo', 'in_progress', 'completed'] })
  @IsOptional()
  @IsIn(['todo', 'in_progress', 'completed'])
  status?: 'todo' | 'in_progress' | 'completed';

  @ApiPropertyOptional({ enum: ['low', 'medium', 'high'] })
  @IsOptional()
  @IsIn(['low', 'medium', 'high'])
  priority?: 'low' | 'medium' | 'high';

  @ApiPropertyOptional({ description: 'Timestamp en milisegundos' })
  @IsOptional()
  @IsNumber()
  dueDate?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;
}
