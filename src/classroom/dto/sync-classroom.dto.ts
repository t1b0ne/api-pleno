import { ApiPropertyOptional, ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class SyncClassroomDto {
  @ApiPropertyOptional({ description: 'Access Token de Google' })
  @IsOptional()
  @IsString()
  accessToken?: string;

  @ApiPropertyOptional({ description: 'Refresh Token de Google para renovación automática' })
  @IsOptional()
  @IsString()
  refreshToken?: string;
}