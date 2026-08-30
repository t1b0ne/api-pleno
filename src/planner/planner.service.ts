import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { anyApi } from 'convex/server';
import { ConvexService } from '../convex/convex.service';
import { calculateCriticalPath } from './critical-path.service';
import { buildWeeklyPlan } from './planning.service';

@Injectable()
export class PlannerService {
  constructor(private readonly convexService: ConvexService) {}

  async criticalPath(userId: string) {
    try {
      const graph = await this.convexService.getClient().query(anyApi.tasks.getUserTaskGraph as any, { userId, now: Date.now(), limit: 200 });
      const result = calculateCriticalPath(
        graph.tasks.filter((task: any) => task.status !== 'completed').map((task: any) => ({
          taskId: task._id,
          title: task.title,
          estimatedMinutes: task.aiEstimatedMinutes ?? 30,
          dueDate: task.dueDate,
          priority: task.priority,
          priorityIA: task.priorityIA,
          importance: task.importance,
          importanceIA: task.importanceIA,
        })),
        graph.dependencies.map((dependency: any) => ({ taskId: dependency.taskId, dependsOnTaskId: dependency.dependsOnTaskId })),
        Date.now(),
      );
      return { success: true, data: result };
    } catch (error: any) {
      throw new InternalServerErrorException(`No se pudo calcular la ruta crítica: ${error.message}`);
    }
  }

  async generateWeeklyPlan(userId: string) {
    try {
      const client = this.convexService.getClient();
      const [graph, profile] = await Promise.all([
        client.query(anyApi.tasks.getUserTaskGraph as any, { userId, now: Date.now(), limit: 200 }),
        client.query(anyApi.profiles.getProfile as any, { userId }),
      ]);
      const tasks = graph.tasks.filter((task: any) => task.status !== 'completed').map((task: any) => ({
        taskId: task._id,
        title: task.title,
        estimatedMinutes: task.aiEstimatedMinutes ?? 30,
        priority: task.priority,
        priorityIA: task.priorityIA,
        importance: task.importance,
        importanceIA: task.importanceIA,
        dueDate: task.dueDate,
      }));
      const dependencies = graph.dependencies.map((item: any) => ({ taskId: item.taskId, dependsOnTaskId: item.dependsOnTaskId }));
      const critical = calculateCriticalPath(tasks, dependencies);
      const start = new Date();
      start.setUTCHours(0, 0, 0, 0);
      const plan = buildWeeklyPlan(tasks, dependencies, critical.criticalTaskIds, profile, start);
      const planId = await client.mutation(anyApi.tasks.saveStudyPlan as any, { userId, generatedAt: Date.now(), ...plan });
      const taskById = new Map(tasks.map((task: any) => [task.taskId, task]));
      const blocks = [...plan.blocks].sort((a, b) =>
        a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime),
      );
      const days = Array.from(new Set(blocks.map((block) => block.date))).map((date) => {
        const dayBlocks = blocks.filter((block) => block.date === date);
        return {
          date,
          totalMinutes: dayBlocks.reduce((sum, block) => sum + block.plannedMinutes, 0),
          blocks: dayBlocks.map((block) => ({
            ...block,
            task: taskById.get(block.taskId) ?? null,
            critical: critical.criticalTaskIds.includes(block.taskId),
          })),
        };
      });
      const warnings = [
        ...(plan.unscheduledTaskIds.length > 0
          ? [`${plan.unscheduledTaskIds.length} tarea(s) no caben antes de su fecha límite.`]
          : []),
        ...(critical.tasks.filter((task) => task.deadlineRisk === 'overdue' || task.deadlineRisk === 'at_risk').length > 0
          ? ['La ruta crítica contiene tareas vencidas o con riesgo de incumplimiento.']
          : []),
        ...(critical.cycleDetected ? ['Existen dependencias cíclicas; no se puede garantizar el orden.'] : []),
      ];
      return {
        success: true,
        data: {
          planId,
          ...plan,
          blocks,
          days,
          warnings,
          criticalPath: critical,
        },
      };
    } catch (error: any) {
      throw new InternalServerErrorException(`No se pudo generar el plan semanal: ${error.message}`);
    }
  }

  async dashboard(userId: string) {
    try {
      const client = this.convexService.getClient();
      const [tasks, graph, latestPlan] = await Promise.all([
        client.query(anyApi.tasks.getTasksForDashboard as any, { userId, limit: 300 }),
        client.query(anyApi.tasks.getUserTaskGraph as any, { userId, now: Date.now(), limit: 200 }),
        client.query(anyApi.tasks.getLatestStudyPlan as any, { userId }),
      ]);
      const critical = calculateCriticalPath(
        graph.tasks.map((task: any) => ({ taskId: task._id, title: task.title, estimatedMinutes: task.aiEstimatedMinutes ?? 30, dueDate: task.dueDate, priority: task.priority, priorityIA: task.priorityIA, importance: task.importance, importanceIA: task.importanceIA })),
        graph.dependencies.map((dependency: any) => ({ taskId: dependency.taskId, dependsOnTaskId: dependency.dependsOnTaskId })),
      );
      const criticalIds = new Set(critical.criticalTaskIds);
      const priorityWeight = { high: 3, medium: 2, low: 1 };
      const orderedTasks = [...tasks].sort((a: any, b: any) => {
        const criticalDelta = Number(criticalIds.has(b._id)) - Number(criticalIds.has(a._id));
        if (criticalDelta) return criticalDelta;
        const dueDelta = (a.dueDate ?? Number.MAX_SAFE_INTEGER) - (b.dueDate ?? Number.MAX_SAFE_INTEGER);
        if (dueDelta) return dueDelta;
        return priorityWeight[b.priority] - priorityWeight[a.priority] || (b.importance ?? 0) - (a.importance ?? 0);
      });
      return {
        success: true,
        data: {
          tasks: orderedTasks,
          columns: {
            todo: orderedTasks.filter((task: any) => task.status === 'todo'),
            in_progress: orderedTasks.filter((task: any) => task.status === 'in_progress'),
            completed: orderedTasks.filter((task: any) => task.status === 'completed'),
          },
          criticalPath: critical,
          latestPlan,
        },
      };
    } catch (error: any) {
      throw new InternalServerErrorException(`No se pudo obtener el tablero: ${error.message}`);
    }
  }
}
