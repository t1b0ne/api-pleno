import { Injectable, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { google } from 'googleapis';
import { UpdateTaskDto } from './dto/update-task.dto';
import { ConvexService } from '../convex/convex.service';
import { anyApi } from 'convex/server';

@Injectable()
export class ClassroomService {
  constructor(private readonly convexService: ConvexService) {}

  async syncClassroomTasks(accessToken: string, userId: string) {
    try {
      const auth = new google.auth.OAuth2();
      auth.setCredentials({ access_token: accessToken });

      const classroom = google.classroom({ version: 'v1', auth });

      const coursesResponse = await classroom.courses.list({
        studentId: 'me',
        courseStates: ['ACTIVE'],
      });

      const courses = coursesResponse.data.courses || [];
      let totalSynced = 0;

      for (const course of courses) {
        if (!course.id) continue;

        const workResponse = await classroom.courses.courseWork.list({
          courseId: course.id,
        });

        const courseWorks = workResponse.data.courseWork || [];

        for (const work of courseWorks) {
          if (!work.id) continue;

          let dueTimestamp: number | undefined = undefined;
          if (work.dueDate) {
            const { year, month, day } = work.dueDate;
            dueTimestamp = new Date(year || 2026, (month || 1) - 1, day || 1).getTime();
          }

          await this.convexService.getClient().mutation(anyApi.tasks.upsertTask as any, {
            userId,
            externalId: work.id,
            title: work.title || 'Tarea de Classroom',
            description: work.description || '',
            dueDate: dueTimestamp,
            courseName: course.name || 'Sin materia',
          });

          totalSynced++;
        }
      }

      return {
        success: true,
        message: 'Sincronización completada exitosamente',
        syncedCount: totalSynced,
      };
    } catch (error: any) {
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
      const result = await this.convexService.getClient().mutation(
        anyApi.tasks.updateTask as any,
        {
          taskId,
          userId,
          ...dto,
        },
      );

      return {
        success: true,
        message: 'Tarea actualizada exitosamente',
        data: result,
      };
    } catch (error: any) {
      if (error.message?.includes('no encontrada')) {
        throw new NotFoundException('La tarea no existe o no pertenece al usuario');
      }
      throw new InternalServerErrorException(
        `Error al actualizar la tarea: ${error.message}`,
      );
    }
  }
}