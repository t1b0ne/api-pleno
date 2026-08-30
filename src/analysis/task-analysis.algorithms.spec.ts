import {
  analyzeTaskBySystem,
  filterEligibleTasks,
  systemImportance,
  systemPriority,
} from './task-analysis.algorithms';
import type { AnalysisTask } from './task-analysis.algorithms';

const now = Date.UTC(2026, 7, 29, 12);

function task(overrides: Partial<AnalysisTask> = {}): AnalysisTask {
  return {
    _id: 'task-1',
    title: 'Tarea',
    description: 'Descripción',
    courseName: 'General',
    priority: 'medium' as const,
    status: 'todo' as const,
    createdAt: now - 2 * 24 * 60 * 60 * 1000,
    ...overrides,
  };
}

describe('task analysis algorithms', () => {
  it('excludes completed and overdue tasks but keeps undated tasks', () => {
    expect(filterEligibleTasks([
      task({ _id: 'completed', status: 'completed' }),
      task({ _id: 'overdue', dueDate: now - 24 * 60 * 60 * 1000 }),
      task({ _id: 'undated' }),
      task({ _id: 'future', dueDate: now + 24 * 60 * 60 * 1000 }),
    ], now).map((item) => item._id)).toEqual(['undated', 'future']);
  });

  it('assigns system priority from deadline proximity', () => {
    expect(systemPriority(now + 12 * 60 * 60 * 1000, now)).toBe('high');
    expect(systemPriority(now + 4 * 24 * 60 * 60 * 1000, now)).toBe('medium');
    expect(systemPriority(undefined, now)).toBe('low');
  });

  it('returns a bounded decimal system importance', () => {
    const result = systemImportance(task({ dueDate: now + 12 * 60 * 60 * 1000 }), now);
    expect(result).toBeGreaterThanOrEqual(1);
    expect(result).toBeLessThanOrEqual(100);
    expect(Number.isInteger(result)).toBe(false);
  });

  it('returns the complete deterministic system analysis', () => {
    expect(analyzeTaskBySystem(task({ dueDate: now + 2 * 24 * 60 * 60 * 1000 }), now)).toMatchObject({
      taskId: 'task-1',
      priority: 'medium',
      daysRemaining: 2,
      urgency: 'high',
    });
  });
});
