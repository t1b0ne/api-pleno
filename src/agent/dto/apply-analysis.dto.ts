import { IsBoolean, IsIn, IsNumber, Max, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ApplyAnalysisDto {
  @IsBoolean()
  @ApiProperty({ example: true })
  confirmed!: boolean;

  @IsIn(['low', 'medium', 'high'])
  @ApiProperty({ enum: ['low', 'medium', 'high'], example: 'high' })
  priority!: 'low' | 'medium' | 'high';

  @IsIn(['todo', 'in_progress', 'completed'])
  @ApiProperty({ enum: ['todo', 'in_progress', 'completed'], example: 'in_progress' })
  status!: 'todo' | 'in_progress' | 'completed';

  @IsNumber()
  @Min(0)
  @Max(100)
  @ApiProperty({ example: 88 })
  importanceScore!: number;
}
