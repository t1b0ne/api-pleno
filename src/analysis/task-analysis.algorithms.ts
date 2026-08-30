export type TaskPriority = 'low' | 'medium' | 'high';
export type TaskStatus = 'todo' | 'in_progress' | 'completed';

export type AnalysisTask = {
  _id: string;
  title: string;
  description: string;
  courseName: string;
  dueDate?: number;
  priority: TaskPriority;
  status: TaskStatus;
  importance?: number;
  createdAt?: number;
  aiEstimatedMinutes?: number;
};

export type SystemTaskAnalysis = {
  taskId: string;
  priority: TaskPriority;
  importance: number;
  daysRemaining: number | null;
  hoursRemaining: number | null;
  urgency: 'undated' | 'overdue' | 'critical' | 'high' | 'medium' | 'normal';
};

const DAY_MS = 24 * 60 * 60 * 1000;

function dayStart(timestamp: number): number {
  const date = new Date(timestamp);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

export function filterEligibleTasks<T extends AnalysisTask>(tasks: T[], now: number): T[] {
  const today = dayStart(now);
  return tasks.filter((task) =>
    task.status !== 'completed' &&
    (task.dueDate === undefined || dayStart(task.dueDate) >= today),
  );
}

export function daysRemaining(dueDate: number | undefined, now: number): number | null {
  return dueDate === undefined ? null : Math.floor((dayStart(dueDate) - dayStart(now)) / DAY_MS);
}

export function urgencyFor(dueDate: number | undefined, now: number): SystemTaskAnalysis['urgency'] {
  const days = daysRemaining(dueDate, now);
  if (days === null) return 'undated';
  if (days < 0) return 'overdue';
  if (days <= 1) return 'critical';
  if (days <= 3) return 'high';
  if (days <= 7) return 'medium';
  return 'normal';
}

export function systemPriority(dueDate: number | undefined, now: number): TaskPriority {
  const urgency = urgencyFor(dueDate, now);
  if (urgency === 'critical') return 'high';
  if (urgency === 'high' || urgency === 'medium') return 'medium';
  return 'low';
}

export function systemImportance(task: AnalysisTask, now: number): number {
  const urgencyPoints: Record<SystemTaskAnalysis['urgency'], number> = {
    overdue: 100,
    critical: 90,
    high: 75,
    medium: 55,
    normal: 25,
    undated: 20,
  };
  const priorityPoints: Record<TaskPriority, number> = { high: 100, medium: 60, low: 25 };
  const urgency = urgencyFor(task.dueDate, now);
  const ageDays = task.createdAt === undefined ? 0 : Math.max(0, (now - task.createdAt) / DAY_MS);
  const score = urgencyPoints[urgency] * 0.55 + priorityPoints[task.priority] * 0.35 + Math.min(10, ageDays * 0.5);
  return Number(Math.min(100, Math.max(1, score)).toFixed(2));
}

export function analyzeTaskBySystem(task: AnalysisTask, now: number): SystemTaskAnalysis {
  return {
    taskId: task._id,
    priority: systemPriority(task.dueDate, now),
    importance: systemImportance(task, now),
    daysRemaining: daysRemaining(task.dueDate, now),
    hoursRemaining: task.dueDate === undefined ? null : Number(((task.dueDate - now) / 3600000).toFixed(2)),
    urgency: urgencyFor(task.dueDate, now),
  };
}

export type CriticalPathTask = {
  taskId: string;
  title: string;
  estimatedMinutes: number;
  dueDate?: number;
  priority?: 'low' | 'medium' | 'high';
  priorityIA?: 'low' | 'medium' | 'high';
  importance?: number;
  importanceIA?: number;
};
export type CriticalPathDependency = { taskId: string; dependsOnTaskId: string };
export type CriticalPathResult = {
  criticalTaskIds: string[];
  orderedTaskIds: string[];
  totalDurationMinutes: number;
  tasks: Array<{
    taskId: string;
    title: string;
    estimatedMinutes: number;
    priority?: 'low' | 'medium' | 'high';
    priorityIA?: 'low' | 'medium' | 'high';
    importance?: number;
    importanceIA?: number;
    dueDate?: number;
    earliestStart: number;
    earliestFinish: number;
    latestStart: number;
    latestFinish: number;
    slackMinutes: number;
    critical: boolean;
    deadlineRisk: 'overdue' | 'at_risk' | 'on_time' | 'undated';
  }>;
  cycleDetected: boolean;
};

export function calculateCriticalPath(tasks: CriticalPathTask[], dependencies: CriticalPathDependency[], now = Date.now()): CriticalPathResult {
  const byId = new Map(tasks.map((task) => [task.taskId, task]));
  const priorityWeight = { high: 3, medium: 2, low: 1 };
  const taskOrder = (left: CriticalPathTask, right: CriticalPathTask) => {
    const leftPriority = Math.max(
      priorityWeight[left.priority ?? 'low'],
      priorityWeight[left.priorityIA ?? 'low'],
    );
    const rightPriority = Math.max(
      priorityWeight[right.priority ?? 'low'],
      priorityWeight[right.priorityIA ?? 'low'],
    );
    if (rightPriority !== leftPriority) return rightPriority - leftPriority;
    const leftImportance = Math.max(left.importance ?? 0, left.importanceIA ?? 0);
    const rightImportance = Math.max(right.importance ?? 0, right.importanceIA ?? 0);
    if (rightImportance !== leftImportance) return rightImportance - leftImportance;
    const leftDue = left.dueDate ?? Number.MAX_SAFE_INTEGER;
    const rightDue = right.dueDate ?? Number.MAX_SAFE_INTEGER;
    return leftDue - rightDue || right.estimatedMinutes - left.estimatedMinutes;
  };
  const predecessors = new Map<string, string[]>();
  const successors = new Map<string, string[]>();
  for (const task of tasks) { predecessors.set(task.taskId, []); successors.set(task.taskId, []); }
  for (const dependency of dependencies) {
    if (!byId.has(dependency.taskId) || !byId.has(dependency.dependsOnTaskId) || dependency.taskId === dependency.dependsOnTaskId) continue;
    predecessors.get(dependency.taskId)?.push(dependency.dependsOnTaskId);
    successors.get(dependency.dependsOnTaskId)?.push(dependency.taskId);
  }
  const indegree = new Map(tasks.map((task) => [task.taskId, predecessors.get(task.taskId)?.length ?? 0]));
  const queue = tasks.filter((task) => indegree.get(task.taskId) === 0).sort(taskOrder).map((task) => task.taskId);
  const orderedTaskIds: string[] = [];
  while (queue.length) {
    const taskId = queue.shift()!; orderedTaskIds.push(taskId);
    for (const successor of successors.get(taskId) ?? []) {
      indegree.set(successor, (indegree.get(successor) ?? 1) - 1);
      if (indegree.get(successor) === 0) queue.push(successor);
    }
    queue.sort((left, right) => taskOrder(byId.get(left)!, byId.get(right)!));
  }
  if (orderedTaskIds.length !== tasks.length) return { criticalTaskIds: [], orderedTaskIds, totalDurationMinutes: 0, tasks: [], cycleDetected: true };
  const earliestStart = new Map<string, number>(); const finish = new Map<string, number>();
  for (const taskId of orderedTaskIds) { const start = Math.max(...(predecessors.get(taskId) ?? []).map((id) => finish.get(id) ?? 0), 0); earliestStart.set(taskId, start); finish.set(taskId, start + Math.max(1, byId.get(taskId)?.estimatedMinutes ?? 1)); }
  const totalDurationMinutes = Math.max(...finish.values(), 0); const latestStart = new Map<string, number>();
  for (const taskId of [...orderedTaskIds].reverse()) { const task = byId.get(taskId)!; const successorStarts = (successors.get(taskId) ?? []).map((id) => latestStart.get(id) ?? totalDurationMinutes); const deadlineOffset = task.dueDate === undefined ? totalDurationMinutes : Math.max(0, Math.floor((task.dueDate - now) / 60000)); const latestFinish = Math.min(deadlineOffset, ...successorStarts, totalDurationMinutes); latestStart.set(taskId, Math.max(0, latestFinish - Math.max(1, task.estimatedMinutes))); }
  const resultTasks = orderedTaskIds.map((taskId) => {
    const task = byId.get(taskId)!;
    const duration = Math.max(1, task.estimatedMinutes ?? 1);
    const start = earliestStart.get(taskId) ?? 0;
    const latest = latestStart.get(taskId) ?? 0;
    const deadlineMinutes = task.dueDate === undefined ? undefined : Math.floor((task.dueDate - now) / 60000);
    const deadlineRisk: 'overdue' | 'at_risk' | 'on_time' | 'undated' = deadlineMinutes === undefined
      ? 'undated'
      : deadlineMinutes < start + duration
        ? deadlineMinutes < 0 ? 'overdue' : 'at_risk'
        : 'on_time';
    const slackMinutes = Math.max(0, latest - start);
    return {
      taskId,
      title: task.title,
      estimatedMinutes: duration,
      ...(task.priority !== undefined && { priority: task.priority }),
      ...(task.priorityIA !== undefined && { priorityIA: task.priorityIA }),
      ...(task.importance !== undefined && { importance: task.importance }),
      ...(task.importanceIA !== undefined && { importanceIA: task.importanceIA }),
      ...(task.dueDate !== undefined && { dueDate: task.dueDate }),
      earliestStart: start,
      earliestFinish: start + duration,
      latestStart: latest,
      latestFinish: latest + duration,
      slackMinutes,
      critical: slackMinutes === 0,
      deadlineRisk,
    };
  });
  return { criticalTaskIds: resultTasks.filter((task) => task.critical).map((task) => task.taskId), orderedTaskIds, totalDurationMinutes, tasks: resultTasks, cycleDetected: false };
}
