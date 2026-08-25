import { Controller, Post, Get, Param, Patch, Body, Req, UseGuards, HttpCode, HttpStatus, UnauthorizedException } from '@nestjs/common';
import { ClassroomService } from './classroom.service';
import { GoogleAuthGuard } from '../common/guards/google-auth.guard';
import { GoogleToken, GoogleUser } from '../common/decorators/google-user.decorator';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiParam } from '@nestjs/swagger';
import { SyncClassroomDto } from './dto/sync-classroom.dto';
import { UpdateTaskDto } from './dto/update-task.dto';

@ApiTags('Classroom Integration')
@ApiBearerAuth('google-token') // 👈 Se aplica a TODOS los endpoints de la clase
@Controller('v1/tasks')
export class ClassroomController {
  constructor(private readonly classroomService: ClassroomService) {}

  @Post('sync')
  @UseGuards(GoogleAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Sincronizar tareas de Google Classroom para el usuario autenticado' })
  @ApiResponse({ status: 200, description: 'Tareas sincronizadas con éxito.' })
  @ApiResponse({ status: 401, description: 'No autorizado o token de Google inválido.' })
  async syncTasks(
    @Body() body: SyncClassroomDto, // 👈 Usamos el DTO para tipado y validación
    @Req() req: any,
    @GoogleToken() tokenFromHeader: string,
    @GoogleUser() user: any,
  ) {
    const token = body?.accessToken || tokenFromHeader;
    const refreshToken = body?.refreshToken;

    if (!token) {
      throw new UnauthorizedException('No se proporcionó un Access Token de Google.');
    }

    const currentUser = user || req.user || req.googleUser;
    const userId = currentUser?.sub || currentUser?.email;

    if (!userId) {
      throw new UnauthorizedException('No se pudo identificar al usuario de Google.');
    }

    return await this.classroomService.syncClassroomTasks(token, userId, refreshToken);
  }

  @Get()
  @UseGuards(GoogleAuthGuard)
  @ApiOperation({ summary: 'Obtener solo las tareas del usuario autenticado ordenadas por importancia' })
  @ApiResponse({ status: 200, description: 'Lista de tareas del usuario obtenida exitosamente.' })
  @ApiResponse({ status: 401, description: 'No autorizado.' })
  async getTasks(@GoogleUser() user: any, @Req() req: any) {
    const currentUser = user || req.user || req.googleUser;
    const userId = currentUser?.sub || currentUser?.email;

    if (!userId) {
      throw new UnauthorizedException('No se pudo identificar al usuario de Google.');
    }

    return await this.classroomService.getTasksByUser(userId);
  }

  @Patch(':id')
  @UseGuards(GoogleAuthGuard)
  @ApiOperation({ summary: 'Actualizar estado, prioridad o campos de una tarea' })
  @ApiParam({ name: 'id', description: 'ID del documento de Convex de la tarea' })
  @ApiResponse({ status: 200, description: 'Tarea actualizada y score de importancia recalculado.' })
  @ApiResponse({ status: 401, description: 'No autorizado.' })
  async updateTask(
    @Param('id') taskId: string,
    @Body() updateTaskDto: UpdateTaskDto,
    @GoogleUser() user: any,
    @Req() req: any,
  ) {
    const currentUser = user || req.user || req.googleUser;
    const userId = currentUser?.sub || currentUser?.email;

    if (!userId) {
      throw new UnauthorizedException('No se pudo identificar al usuario de Google.');
    }

    return await this.classroomService.updateTask(taskId, userId, updateTaskDto);
  }
}