import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class SyncClassroomDto {
  @ApiProperty({
    description: 'OAuth Access Token generado por el cliente mediante Google Login',
    example: 'ya29.a0AxooC9...',
  })
  @IsString()
  @IsNotEmpty()
  accessToken: string | undefined;
}