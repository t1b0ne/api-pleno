type PlanTask = {
  taskId: string;
  title: string;
  estimatedMinutes: number;
  priority: 'low' | 'medium' | 'high';
  priorityIA?: 'low' | 'medium' | 'high';
  importance?: number;
  importanceIA?: number;
  dueDate?: number;
};

type PlanProfile = {
  availableHoursPerDay?: number;
  studyHoursPerDay?: number;
  actualWorkloadTolerance?: number;
  workloadTolerance?: number;
  availableSchedule?: Array<{ day: string; start: string; end: string }>;
};

export type PlannedBlock = {
  date: string;
  taskId: string;
  startTime: string;
  endTime: string;
  plannedMinutes: number;
  reason: string;
};

const priorityWeight = { high: 3, medium: 2, low: 1 };
const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

function dateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function timeToMinutes(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const [hours, minutes] = value.split(':').map(Number);
  return Number.isFinite(hours) && Number.isFinite(minutes) ? hours * 60 + minutes : fallback;
}

export function buildWeeklyPlan(
  tasks: PlanTask[],
  dependencies: Array<{ taskId: string; dependsOnTaskId: string }>,
  criticalTaskIds: string[],
  profile: PlanProfile | null,
  weekStart: Date,
): { weekStart: string; weekEnd: string; blocks: PlannedBlock[]; totalAvailableMinutes: number; totalPlannedMinutes: number; marginMinutes: number; unscheduledMinutes: number; unscheduledTaskIds: string[] } {
  const critical = new Set(criticalTaskIds);
  const predecessors = new Map<string, string[]>();
  for (const task of tasks) predecessors.set(task.taskId, []);
  for (const dependency of dependencies) predecessors.get(dependency.taskId)?.push(dependency.dependsOnTaskId);
  const ordered = [...tasks].sort((a, b) => {
    const criticalDelta = Number(critical.has(b.taskId)) - Number(critical.has(a.taskId));
    if (criticalDelta) return criticalDelta;
    const priorityDelta = Math.max(priorityWeight[b.priority], priorityWeight[b.priorityIA ?? 'low']) - Math.max(priorityWeight[a.priority], priorityWeight[a.priorityIA ?? 'low']);
    if (priorityDelta) return priorityDelta;
    const importanceDelta = Math.max(b.importance ?? 0, b.importanceIA ?? 0) - Math.max(a.importance ?? 0, a.importanceIA ?? 0);
    if (importanceDelta) return importanceDelta;
    const dueDelta = (a.dueDate ?? Number.MAX_SAFE_INTEGER) - (b.dueDate ?? Number.MAX_SAFE_INTEGER);
    return dueDelta || (b.estimatedMinutes ?? 0) - (a.estimatedMinutes ?? 0);
  });
  const tolerance = profile?.actualWorkloadTolerance ?? profile?.workloadTolerance ?? 80;
  const dailyCapacity = Math.max(30, Math.floor((profile?.studyHoursPerDay ?? profile?.availableHoursPerDay ?? 2) * 60 * Math.min(0.8, Math.max(0.4, tolerance / 100))));
  const used = new Map<string, number>();
  const completedOnDay = new Map<string, number>();
  const blocks: PlannedBlock[] = [];
  const unscheduledTaskIds: string[] = [];
  let totalAvailableMinutes = 0;
  for (let offset = 0; offset < 7; offset++) totalAvailableMinutes += dailyCapacity;

  for (const task of ordered) {
    let remaining = Math.max(1, Math.round(task.estimatedMinutes));
    const predecessorDay = Math.max(...(predecessors.get(task.taskId) ?? []).map((id) => completedOnDay.get(id) ?? 0), 0);
    for (let offset = predecessorDay; offset < 7 && remaining > 0; offset++) {
      const date = new Date(weekStart.getTime() + offset * 86400000);
      const key = dateKey(date);
      const capacityLeft = dailyCapacity - (used.get(key) ?? 0);
      if (capacityLeft <= 0) continue;
      const schedule = profile?.availableSchedule?.find((item) => item.day.toLowerCase() === dayNames[date.getUTCDay()]);
      const start = timeToMinutes(schedule?.start, 9 * 60) + (used.get(key) ?? 0);
      const dueDay = task.dueDate === undefined
        ? 6
        : Math.floor((Date.UTC(new Date(task.dueDate).getUTCFullYear(), new Date(task.dueDate).getUTCMonth(), new Date(task.dueDate).getUTCDate()) - weekStart.getTime()) / 86400000);
      if (offset > dueDay) continue;
      const dueMinute = task.dueDate === undefined
        ? 24 * 60
        : new Date(task.dueDate).getUTCHours() * 60 + new Date(task.dueDate).getUTCMinutes();
      const deadlineCapacity = offset === dueDay ? Math.max(0, dueMinute - start) : capacityLeft;
      const minutes = Math.min(remaining, capacityLeft, deadlineCapacity, 90);
      if (minutes <= 0) continue;
      const end = start + minutes;
      blocks.push({
        date: key,
        taskId: task.taskId,
        startTime: `${String(Math.floor(start / 60)).padStart(2, '0')}:${String(start % 60).padStart(2, '0')}`,
        endTime: `${String(Math.floor(end / 60)).padStart(2, '0')}:${String(end % 60).padStart(2, '0')}`,
        plannedMinutes: minutes,
        reason: critical.has(task.taskId) ? 'Tarea en ruta crítica' : 'Prioridad, deadline y disponibilidad',
      });
      used.set(key, (used.get(key) ?? 0) + minutes);
      remaining -= minutes;
      if (remaining === 0) completedOnDay.set(task.taskId, offset);
    }
    if (remaining > 0) unscheduledTaskIds.push(task.taskId);
  }
  const totalPlannedMinutes = blocks.reduce((sum, block) => sum + block.plannedMinutes, 0);
  const totalEstimatedMinutes = tasks.reduce((sum, task) => sum + Math.max(1, Math.round(task.estimatedMinutes)), 0);
  return { weekStart: dateKey(weekStart), weekEnd: dateKey(new Date(weekStart.getTime() + 6 * 86400000)), blocks, totalAvailableMinutes, totalPlannedMinutes, marginMinutes: totalAvailableMinutes - totalPlannedMinutes, unscheduledMinutes: Math.max(0, totalEstimatedMinutes - totalPlannedMinutes), unscheduledTaskIds };
}
