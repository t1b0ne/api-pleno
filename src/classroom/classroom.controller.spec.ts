import { Controller, Post, Body, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { ClassroomService } from './classroom.service';
import { GoogleAuthGuard } from '../common/guards/google-auth.guard';
import { GoogleToken, GoogleUser } from '../common/decorators/google-user.decorator';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { SyncClassroomDto } from './dto/sync-classroom.dto';

@ApiTags('Classroom Integration') // Agrupa las rutas en Swagger bajo esta sección
@Controller('v1/classroom')
export class ClassroomController {
  constructor(private readonly classroomService: ClassroomService) {}

  @Post('sync')
  @UseGuards(GoogleAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('google-token') // Requiere el botón "Authorize" en Swagger UI
  @ApiOperation({
    summary: 'Sincroniza las tareas pendientes de Google Classroom hacia Convex',
  })
  @ApiResponse({
    status: 200,
    description: 'Sincronización completada exitosamente.',
    schema: {
      example: {
        success: true,
        message: 'Sincronización completada',
        syncedCount: 5,
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Token de Google inválido o no proporcionado.' })
  async syncTasks(
    @GoogleToken() accessToken: string,
    @GoogleUser() user: any,
  ) {
    return await this.classroomService.syncClassroomTasks(
      accessToken,
      user?.sub || user?.email || '',
    );
  }
}
