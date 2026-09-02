import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { anyApi } from 'convex/server';
import { ConvexService } from '../convex/convex.service';
import { calculateCriticalPath } from '../planner/critical-path.service';
import { toProfileContext, UserProfileLike } from '../profile/profile-context';

const DAY_MS = 24 * 60 * 60 * 1000;

function dayStart(timestamp: number): number {
  const date = new Date(timestamp);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

function titleKey(title: string): string {
  return title
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .trim()
    .split(/\s+/)
    .filter((word) => word.length > 2)
    .slice(0, 6)
    .join(' ');
}

@Injectable()
export class SummaryService {
  constructor(private readonly convexService: ConvexService) {}

  async getSummary(userId: string, now = Date.now(), force = false) {
    try {
      const client = this.convexService.getClient();
      const [graph, profile] = await Promise.all([
        client.query(anyApi.tasks.getUserTaskGraph as any, { userId, now, limit: 200 }),
        client.query(anyApi.profiles.getProfile as any, { userId }),
      ]);
      const tasks = graph.tasks.map((task: any) => ({
        taskId: task._id,
        titleKey: titleKey(task.title),
        title: task.title,
        description: task.description,
        courseName: task.courseName,
        dueDate: task.dueDate ?? null,
        daysRemaining: task.dueDate === undefined ? null : Math.floor((dayStart(task.dueDate) - dayStart(now)) / DAY_MS),
        hoursRemaining: task.dueDate === undefined ? null : Number(((task.dueDate - now) / 3600000).toFixed(2)),
        estimatedMinutes: task.aiEstimatedMinutes ?? 30,
        priority: task.priority,
        importance: task.importance ?? 50,
        complexityScore: task.complexityScore ?? null,
        status: task.status,
        analysisStatus: task.analysisStatus ?? null,
        aiAnalyzedAt: task.aiAnalyzedAt ?? null,
      }));
      const dueCounts = new Map<number, number>();
      for (const task of graph.tasks) {
        if (task.dueDate !== undefined) dueCounts.set(dayStart(task.dueDate), (dueCounts.get(dayStart(task.dueDate)) ?? 0) + 1);
      }
      const criticalPath = calculateCriticalPath(
        graph.tasks.map((task: any) => ({
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
      );
      const criticalIds = new Set(criticalPath.criticalTaskIds);
      const tasksForAnalysis = tasks.filter((task: any) =>
        force ||
        task.analysisStatus === 'pending' ||
        task.analysisStatus === 'stale' ||
        task.analysisStatus === 'failed' ||
        task.analysisStatus === null && task.aiAnalyzedAt === null,
      );
      const priorityWeight = { high: 3, medium: 2, low: 1 };
      tasks.sort((a: any, b: any) => Number(criticalIds.has(b.taskId)) - Number(criticalIds.has(a.taskId)) || (a.dueDate ?? Number.MAX_SAFE_INTEGER) - (b.dueDate ?? Number.MAX_SAFE_INTEGER) || priorityWeight[b.priority] - priorityWeight[a.priority] || b.importance - a.importance);
      return {
        success: true,
        data: {
          generatedAt: now,
          userProfile: toProfileContext(profile as UserProfileLike | null),
          filters: { excludedCompleted: true, excludedOverdue: true, includedUndated: true },
          totals: {
            tasks: tasks.length,
            estimatedMinutes: tasks.reduce((sum: number, task: any) => sum + task.estimatedMinutes, 0),
            criticalTasks: criticalPath.criticalTaskIds.length,
          },
          tasks: tasks.map((task: any) => ({ ...task, nearbyTasksDue: task.dueDate === null ? 0 : (dueCounts.get(dayStart(task.dueDate)) ?? 1) - 1, critical: criticalIds.has(task.taskId) })),
          tasksForAnalysis,
          dependencies: graph.dependencies,
          criticalPath,
        },
      };
    } catch (error: any) {
      throw new InternalServerErrorException(`No se pudo generar el resumen: ${error.message}`);
    }
  }
}
