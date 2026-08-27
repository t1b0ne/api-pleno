import { v } from 'convex/values';
import { mutation, query } from './_generated/server';

/**
 * Sanitiza textos eliminando HTML y normalizando espacios
 * para optimizar el contexto enviado al agente de IA.
 */
function sanitizeText(text?: string): string {
  if (!text) return '';
  return text
    .replace(/<[^>]*>?/gm, '') // Elimina etiquetas HTML
    .replace(/\s+/g, ' ')       // Convierte múltiples saltos/espacios en un solo espacio
    .trim();
}

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

    const cleanTitle = sanitizeText(args.title);
    const cleanDescription = sanitizeText(args.description);
    const cleanCourseName = sanitizeText(args.courseName) || 'Sin materia';

    if (existing) {
      await ctx.db.patch(existing._id, {
        title: cleanTitle,
        description: cleanDescription,
        dueDate: args.dueDate,
        courseName: cleanCourseName,
        importanceScore,
      });
      return existing._id;
    }

    return await ctx.db.insert('tasks', {
      userId: args.userId,
      courseWorkId: args.externalId,
      externalId: args.externalId, // 💡 Guardado para mantener consistencia con el esquema
      title: cleanTitle,
      description: cleanDescription,
      dueDate: args.dueDate,
      courseName: cleanCourseName,
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
    if (args.title !== undefined) updates.title = sanitizeText(args.title);
    if (args.description !== undefined) updates.description = sanitizeText(args.description);

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
      v.union(v.literal('low'), v.literal('medium'), v.literal('high')),
    ),
  },
  handler: async (ctx, args) => {
    const priority = args.priority ?? 'medium';
    const createdAt = Date.now();
    const importanceScore = calculateImportance(priority, args.dueDate, createdAt);

    const taskId = await ctx.db.insert('tasks', {
      userId: args.userId,
      title: sanitizeText(args.title),
      description: sanitizeText(args.description),
      dueDate: args.dueDate,
      courseName: sanitizeText(args.courseName) || 'General',
      status: 'todo',
      priority,
      source: 'manual',
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

export const saveTaskAnalysis = mutation({
  args: {
    taskId: v.id('tasks'),
    userId: v.string(),
    complexity: v.union(v.literal('easy'), v.literal('medium'), v.literal('hard')),
    estimatedMinutes: v.optional(v.number()),
    recommendedPriority: v.union(v.literal('low'), v.literal('medium'), v.literal('high')),
    recommendedStatus: v.optional(
      v.union(v.literal('todo'), v.literal('in_progress'), v.literal('completed')),
    ),
    reasoning: v.string(),
    confidence: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.taskId);
    if (!existing || existing.userId !== args.userId) {
      throw new Error('Tarea no encontrada o no autorizada');
    }

    await ctx.db.patch(args.taskId, {
      aiComplexity: args.complexity,
      aiEstimatedMinutes: args.estimatedMinutes,
      aiRecommendedPriority: args.recommendedPriority,
      aiRecommendedStatus: args.recommendedStatus,
      aiReasoning: args.reasoning,
      aiConfidence: args.confidence,
      aiAnalyzedAt: Date.now(),
    });

    return await ctx.db.get(args.taskId);
  },
});

export const applyTaskAnalysis = mutation({
  args: {
    taskId: v.id('tasks'),
    userId: v.string(),
    confirmed: v.boolean(),
  },
  handler: async (ctx, args) => {
    if (!args.confirmed) {
      throw new Error('Se requiere confirmación para aplicar el análisis');
    }

    const existing = await ctx.db.get(args.taskId);
    if (!existing || existing.userId !== args.userId) {
      throw new Error('Tarea no encontrada o no autorizada');
    }

    if (!existing.aiRecommendedPriority) {
      throw new Error('La tarea todavía no tiene un análisis para aplicar');
    }

    const priority = existing.aiRecommendedPriority;
    const dueDate = existing.dueDate;
    const createdAt = existing.createdAt ?? Date.now();
    const importanceScore = calculateImportance(priority, dueDate, createdAt);

    await ctx.db.patch(args.taskId, {
      priority,
      status: existing.aiRecommendedStatus ?? existing.status,
      importanceScore,
    });

    return await ctx.db.get(args.taskId);
  },
});

export const applyTaskDecision = mutation({
  args: {
    taskId: v.id('tasks'),
    userId: v.string(),
    confirmed: v.boolean(),
    priority: v.union(v.literal('low'), v.literal('medium'), v.literal('high')),
    status: v.union(v.literal('todo'), v.literal('in_progress'), v.literal('completed')),
    importanceScore: v.number(),
  },
  handler: async (ctx, args) => {
    if (!args.confirmed) {
      throw new Error('Se requiere confirmación para aplicar el análisis');
    }

    const existing = await ctx.db.get(args.taskId);
    if (!existing || existing.userId !== args.userId) {
      throw new Error('Tarea no encontrada o no autorizada');
    }

    await ctx.db.patch(args.taskId, {
      priority: args.priority,
      status: args.status,
      importanceScore: args.importanceScore,
    });

    return await ctx.db.get(args.taskId);
  },
});
