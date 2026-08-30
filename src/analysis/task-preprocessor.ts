import { analyzeTaskBySystem } from './task-analysis.algorithms';

export type PreprocessableTask = {
  _id: string;
  title: string;
  description: string;
  courseName: string;
  dueDate?: number;
  priority: 'low' | 'medium' | 'high';
  status: 'todo' | 'in_progress' | 'completed';
  importance?: number;
  aiEstimatedMinutes?: number;
};

export type TaskPreprocessingContext = {
  now: number;
  availableHoursPerDay?: number;
  availableSchedule?: Array<{ day: string; start: string; end: string }>;
  historicalMinutesByTaskType?: Record<string, number>;
};

export type PreprocessedTask = {
  taskId: string;
  title: string;
  description: string;
  courseName: string;
  dueDate: number | null;
  priority: PreprocessableTask['priority'];
  status: PreprocessableTask['status'];
  importance: number | null;
  daysRemaining: number | null;
  hoursRemaining: number | null;
  overdue: boolean;
  urgency: 'low' | 'medium' | 'high' | 'overdue';
  hasDescription: boolean;
  descriptionLength: number;
  nearbyTaskCount: number;
  dailyWorkloadMinutes: number;
  weeklyWorkloadMinutes: number;
  availableMinutesPerDay: number;
  historicalMinutes: number | null;
  previousEstimateMinutes: number | null;
  systemPriority: PreprocessableTask['priority'];
  systemImportance: number;
};

const DAY_MS = 24 * 60 * 60 * 1000;

function dayStart(timestamp: number): number {
  const date = new Date(timestamp);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

function taskTypeKey(task: PreprocessableTask): string {
  return task.courseName.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '_') || 'general';
}

function urgencyFor(daysRemaining: number | null): PreprocessedTask['urgency'] {
  if (daysRemaining === null) return 'low';
  if (daysRemaining < 0) return 'overdue';
  if (daysRemaining <= 1) return 'high';
  if (daysRemaining <= 3) return 'medium';
  return 'low';
}

export function preprocessTasks(
  tasks: PreprocessableTask[],
  context: TaskPreprocessingContext,
): PreprocessedTask[] {
  const currentDay = dayStart(context.now);
  const availableMinutesPerDay = Math.max(
    0,
    Math.round((context.availableHoursPerDay ?? 0) * 60),
  );

  return tasks.map((task) => {
    const system = analyzeTaskBySystem(task, context.now);
    const dueDay = task.dueDate === undefined ? null : dayStart(task.dueDate);
    const daysRemaining = dueDay === null ? null : Math.floor((dueDay - currentDay) / DAY_MS);
    const hoursRemaining =
      task.dueDate === undefined ? null : Number(((task.dueDate - context.now) / 3600000).toFixed(2));
    const nearbyTaskCount = tasks.filter((candidate) => {
      if (candidate._id === task._id || candidate.dueDate === undefined || dueDay === null) return false;
      return Math.abs(dayStart(candidate.dueDate) - dueDay) <= DAY_MS;
    }).length;
    const dailyWorkloadMinutes = tasks
      .filter((candidate) => candidate.dueDate !== undefined && dayStart(candidate.dueDate) === dueDay)
      .reduce((sum, candidate) => sum + (candidate.aiEstimatedMinutes ?? 0), 0);
    const weekEnd = currentDay + 7 * DAY_MS;
    const weeklyWorkloadMinutes = tasks
      .filter((candidate) => candidate.dueDate !== undefined && dayStart(candidate.dueDate) >= currentDay && dayStart(candidate.dueDate) < weekEnd)
      .reduce((sum, candidate) => sum + (candidate.aiEstimatedMinutes ?? 0), 0);

    return {
      taskId: task._id,
      title: task.title,
      description: task.description.trim().slice(0, 1200),
      courseName: task.courseName,
      dueDate: task.dueDate ?? null,
      priority: task.priority,
      status: task.status,
      importance: task.importance ?? null,
      daysRemaining,
      hoursRemaining,
      overdue: daysRemaining !== null && daysRemaining < 0,
      urgency: urgencyFor(daysRemaining),
      hasDescription: task.description.trim().length > 0,
      descriptionLength: task.description.trim().length,
      nearbyTaskCount,
      dailyWorkloadMinutes,
      weeklyWorkloadMinutes,
      availableMinutesPerDay,
      historicalMinutes: context.historicalMinutesByTaskType?.[taskTypeKey(task)] ?? null,
      previousEstimateMinutes: task.aiEstimatedMinutes ?? null,
      systemPriority: system.priority,
      systemImportance: system.importance,
    };
  });
}
