import { v } from 'convex/values';
import { mutation, query } from './_generated/server';

function calculateImportance(
  priority: 'low' | 'medium' | 'high',
  dueDate?: number,
  createdAt: number = Date.now(),
): number {
  let score = 0;

  const priorityScores = { high: 40, medium: 20, low: 10 };
  score += priorityScores[priority] || 10;

  if (dueDate) {
    const now = Date.now();
    const msInDay = 1000 * 60 * 60 * 24;
    const daysUntilDue = (dueDate - now) / msInDay;

    if (daysUntilDue <= 0) {
      score += 50;
    } else if (daysUntilDue <= 1) {
      score += 45;
    } else if (daysUntilDue <= 3) {
      score += 35;
    } else if (daysUntilDue <= 7) {
      score += 20;
    } else if (daysUntilDue <= 14) {
      score += 10;
    } else {
      score += 5;
    }
  }

  const ageInDays = (Date.now() - createdAt) / (1000 * 60 * 60 * 24);
  const ageBonus = Math.min(10, ageInDays * 0.5);
  score += ageBonus;

  return Number(Math.min(100, Math.max(0, score)).toFixed(2));
}

export const getTasksByUser = query({
  args: { userId: v.string() },
  handler: async (ctx, args) => {
    const tasks = await ctx.db
      .query('tasks')
      .withIndex('by_user', (q) => q.eq('userId', args.userId))
      .collect();

    return tasks.sort((a, b) => (b.importanceScore ?? 0) - (a.importanceScore ?? 0));
  },
});

export const getTaskById = query({
  args: { taskId: v.id('tasks'), userId: v.string() },
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.taskId);
    if (!task || task.userId !== args.userId) {
      return null;
    }
    return task;
  },
});

export const upsertTask = mutation({
  args: {
    userId: v.string(),
    externalId: v.string(),
    title: v.string(),
    description: v.optional(v.string()),
    dueDate: v.optional(v.number()),
    courseName: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query('tasks')
      .withIndex('by_user_coursework', (q) =>
        q.eq('userId', args.userId).eq('courseWorkId', args.externalId),
      )
      .unique();

    const priority = existing ? existing.priority : 'medium';
    const createdAt = existing?.createdAt ?? Date.now();
    const importanceScore = calculateImportance(priority, args.dueDate, createdAt);

    if (existing) {
      await ctx.db.patch(existing._id, {
        title: args.title,
        description: args.description ?? '',
        dueDate: args.dueDate,
        courseName: args.courseName ?? 'Sin materia',
        importanceScore,
      });
      return existing._id;
    }

    return await ctx.db.insert('tasks', {
      userId: args.userId,
      courseWorkId: args.externalId,
      title: args.title,
      description: args.description ?? '',
      dueDate: args.dueDate,
      courseName: args.courseName ?? 'Sin materia',
      status: 'todo',
      priority,
      source: 'google_classroom',
      createdAt,
      importanceScore,
    });
  },
});

export const updateTask = mutation({
  args: {
    taskId: v.id('tasks'),
    userId: v.string(),
    status: v.optional(
      v.union(v.literal('todo'), v.literal('in_progress'), v.literal('completed')),
    ),
    priority: v.optional(v.union(v.literal('low'), v.literal('medium'), v.literal('high'))),
    dueDate: v.optional(v.number()),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.taskId);
    if (!existing || existing.userId !== args.userId) {
      throw new Error('Tarea no encontrada o no autorizada');
    }

    const updatedPriority = args.priority ?? existing.priority;
    const updatedDueDate = args.dueDate !== undefined ? args.dueDate : existing.dueDate;
    const createdAt = existing.createdAt ?? Date.now();

    const importanceScore = calculateImportance(
      updatedPriority,
      updatedDueDate,
      createdAt,
    );

    const updates: Record<string, any> = { importanceScore };
    if (args.status !== undefined) updates.status = args.status;
    if (args.priority !== undefined) updates.priority = args.priority;
    if (args.dueDate !== undefined) updates.dueDate = args.dueDate;
    if (args.title !== undefined) updates.title = args.title;
    if (args.description !== undefined) updates.description = args.description;

    await ctx.db.patch(args.taskId, updates);

    return {
      success: true,
      taskId: args.taskId,
      updatedImportanceScore: importanceScore,
    };
  },
});

export const deleteTask = mutation({
  args: {
    taskId: v.id('tasks'),
    userId: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.taskId);
    if (!existing || existing.userId !== args.userId) {
      throw new Error('Tarea no encontrada o no autorizada');
    }

    await ctx.db.delete(args.taskId);
    return { success: true, taskId: args.taskId };
  }, 
});

export const createManualTask = mutation({
  args: {
    userId: v.string(),
    title: v.string(),
    description: v.optional(v.string()),
    dueDate: v.optional(v.number()),
    courseName: v.optional(v.string()),
    priority: v.optional(
      v.union(v.literal('low'), v.literal('medium'), v.literal('high'))
    ),
  },
  handler: async (ctx, args) => {
    const priority = args.priority ?? 'medium';
    const createdAt = Date.now();
    const importanceScore = calculateImportance(priority, args.dueDate, createdAt);

    const taskId = await ctx.db.insert('tasks', {
      userId: args.userId,
      title: args.title,
      description: args.description ?? '',
      dueDate: args.dueDate,
      courseName: args.courseName ?? 'General',
      status: 'todo',
      priority,
      source: 'manual', // Diferencia las tareas creadas a mano de las de Classroom
      createdAt,
      importanceScore,
    });

    return {
      success: true,
      taskId,
      importanceScore,
    };
  },
});