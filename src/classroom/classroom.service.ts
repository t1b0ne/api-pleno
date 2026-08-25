import {
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { google } from 'googleapis';
import { UpdateTaskDto } from './dto/update-task.dto';
import { ConvexService } from '../convex/convex.service';
import { anyApi } from 'convex/server';

@Injectable()
export class ClassroomService {
  constructor(private readonly convexService: ConvexService) {}

  private createOAuth2Client(accessToken: string, refreshToken?: string) {
    const auth = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI,
    );

    auth.setCredentials({
      access_token: accessToken,
      refresh_token: refreshToken,
    });

    return auth;
  }

  async syncClassroomTasks(
    accessToken: string,
    userId: string,
    refreshToken?: string,
  ) {
    const auth = this.createOAuth2Client(accessToken, refreshToken);

    try {
      // 1. Verificar si el token requiere refresco manual previo
      if (refreshToken) {
        try {
          const tokenInfo = await auth.getTokenInfo(accessToken);
          if (!tokenInfo) {
            const { credentials } = await auth.refreshAccessToken();
            auth.setCredentials(credentials);
          }
        } catch {
          // Si el access_token ya venció, forzamos la renovación
          const { credentials } = await auth.refreshAccessToken();
          auth.setCredentials(credentials);
        }
      }

      const classroom = google.classroom({ version: 'v1', auth });

      const coursesResponse = await classroom.courses.list({
        studentId: 'me',
        courseStates: ['ACTIVE'],
      });

      const courses = coursesResponse.data.courses || [];
      let totalSynced = 0;

      // 2. Recorrer cursos con aislamiento de errores
      for (const course of courses) {
        if (!course.id) continue;

        try {
          const workResponse = await classroom.courses.courseWork.list({
            courseId: course.id,
          });

          const courseWorks = workResponse.data.courseWork || [];

          for (const work of courseWorks) {
            if (!work.id) continue;

            let dueTimestamp: number | undefined = undefined;
            if (work.dueDate) {
              const { year, month, day } = work.dueDate;
              dueTimestamp = new Date(
                year || new Date().getFullYear(),
                (month || 1) - 1,
                day || 1,
              ).getTime();
            }

            await this.convexService
              .getClient()
              .mutation(anyApi.tasks.upsertTask as any, {
                userId,
                externalId: work.id,
                title: work.title || 'Tarea de Classroom',
                description: work.description || '',
                dueDate: dueTimestamp,
                courseName: course.name || 'Sin materia',
              });

            totalSynced++;
          }
        } catch (courseError: any) {
          // Un error en un curso específico no interrumpe los demás
          console.warn(
            `Error al sincronizar el curso "${course.name}" (${course.id}): ${courseError.message}`,
          );
        }
      }

      return {
        success: true,
        message: 'Sincronización completada exitosamente',
        syncedCount: totalSynced,
      };
    } catch (error: any) {
      if (error.code === 401 || error.status === 401) {
        throw new UnauthorizedException(
          'El token de Google ha expirado o es inválido. Vuelve a iniciar sesión.',
        );
      }

      throw new InternalServerErrorException(
        `Error al sincronizar con Google Classroom: ${error.message}`,
      );
    }
  }

  async getTasksByUser(userId: string) {
    try {
      const tasks = await this.convexService
        .getClient()
        .query(anyApi.tasks.getTasksByUser as any, { userId });

      return {
        success: true,
        data: tasks,
      };
    } catch (error: any) {
      throw new InternalServerErrorException(
        `Error al obtener las tareas del usuario: ${error.message}`,
      );
    }
  }

  async updateTask(taskId: string, userId: string, dto: UpdateTaskDto) {
    try {
      const result = await this.convexService
        .getClient()
        .mutation(anyApi.tasks.updateTask as any, {
          taskId,
          userId,
          ...dto,
        });

      return {
        success: true,
        message: 'Tarea actualizada exitosamente',
        data: result,
      };
    } catch (error: any) {
      if (error.message?.includes('no encontrada')) {
        throw new NotFoundException(
          'La tarea no existe o no pertenece al usuario',
        );
      }
      throw new InternalServerErrorException(
        `Error al actualizar la tarea: ${error.message}`,
      );
    }
  }
}