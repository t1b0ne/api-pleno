import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsNumber, IsOptional, IsString } from 'class-validator';

export class CreateTaskDto {
  @ApiProperty({
    description: 'Título de la tarea',
    example: 'Entregar reporte de Matemáticas',
  })
  @IsString()
  @IsNotEmpty()
  title: string;

  @ApiPropertyOptional({
    description: 'Descripción o detalles adicionales',
    example: 'Resolver ejercicios del capítulo 4',
  })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({
    description: 'Fecha límite en timestamp (milisegundos)',
    example: 1770000000000,
  })
  @IsNumber()
  @IsOptional()
  dueDate?: number;

  @ApiPropertyOptional({
    description: 'Nombre de la materia o categoría',
    example: 'Álgebra Lineal',
  })
  @IsString()
  @IsOptional()
  courseName?: string;
}