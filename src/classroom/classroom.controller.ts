import { Controller, Post, Get,Param, Patch, Body, Req, UseGuards, HttpCode, HttpStatus, UnauthorizedException } from '@nestjs/common';
import { ClassroomService } from './classroom.service';
import { GoogleAuthGuard } from '../common/guards/google-auth.guard';
import { GoogleToken, GoogleUser } from '../common/decorators/google-user.decorator';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiParam } from '@nestjs/swagger';
import { SyncClassroomDto } from './dto/sync-classroom.dto';
import { UpdateTaskDto } from './dto/update-task.dto';

@ApiTags('Classroom Integration')
@Controller('v1/tasks')
export class ClassroomController {
  constructor(private readonly classroomService: ClassroomService) {}

@Post('sync')
@UseGuards(GoogleAuthGuard)
@HttpCode(HttpStatus.OK)
async syncTasks(
  @Body() body: any,
  @Req() req: any, // 👈 Inyectamos Req por si el decorador no extrae request.user
  @GoogleToken() tokenFromHeader: string,
  @GoogleUser() user: any,
) {
  const token = body?.accessToken || tokenFromHeader;

  // Extraer el usuario desde el decorador O directamente del request
  const currentUser = user || req.user || req.googleUser;
  const userId = currentUser?.sub || currentUser?.email;

  if (!userId) {
    throw new UnauthorizedException('No se pudo identificar al usuario de Google.');
  }

  return await this.classroomService.syncClassroomTasks(token, userId);
}

  @Get()
  @UseGuards(GoogleAuthGuard)
  @ApiBearerAuth('google-token')
  @ApiOperation({ summary: 'Obtener solo las tareas del usuario autenticado ordenadas por importancia' })
  @ApiResponse({ status: 200, description: 'Lista de tareas del usuario obtenida exitosamente.' })
  async getTasks(@GoogleUser() user: any) {
    const userId = user.sub || user.email;
    return await this.classroomService.getTasksByUser(userId);
  }

  @Patch(':id')
  @UseGuards(GoogleAuthGuard)
  @ApiBearerAuth('google-token')
  @ApiOperation({ summary: 'Actualizar estado, prioridad o campos de una tarea' })
  @ApiParam({ name: 'id', description: 'ID del documento de Convex de la tarea' })
  @ApiResponse({ status: 200, description: 'Tarea actualizada y score de importancia recalculado.' })
  async updateTask(
    @Param('id') taskId: string,
    @Body() updateTaskDto: UpdateTaskDto,
    @GoogleUser() user: any,
  ) {
    const userId = user.sub || user.email;
    return await this.classroomService.updateTask(taskId, userId, updateTaskDto);
  }
}