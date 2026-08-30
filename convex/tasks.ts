import { v } from 'convex/values';
import { mutation, query } from './_generated/server';
import { Id, Doc } from './_generated/dataModel';
import schema from './schema';

const priorityValidator = v.union(
  v.literal('low'),
  v.literal('medium'),
  v.literal('high'),
);

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

type TaskAiFields = Omit<Doc<'taskAiResults'>, '_id' | '_creationTime' | 'taskId' | 'userId' | 'updatedAt'>;

async function getTaskAi(ctx: { db: any }, taskId: Id<'tasks'>) {
  return await ctx.db
    .query('taskAiResults')
    .withIndex('by_task', (q: any) => q.eq('taskId', taskId))
    .unique() as Doc<'taskAiResults'> | null;
}

function mergeTask(task: Doc<'tasks'>, ai: Doc<'taskAiResults'> | null) {
  if (!ai) return task;
  const { _id, _creationTime, taskId, userId, updatedAt, ...analysis } = ai;
  return { ...task, ...analysis };
}

async function upsertTaskAi(
  ctx: { db: any },
  taskId: Id<'tasks'>,
  userId: string,
  fields: Partial<TaskAiFields>,
) {
  const existing = await getTaskAi(ctx, taskId);
  if (existing) {
    await ctx.db.patch(existing._id, { ...fields, updatedAt: Date.now() });
    return existing._id;
  }
  return await ctx.db.insert('taskAiResults', {
    taskId,
    userId,
    updatedAt: Date.now(),
    ...fields,
  });
}

export const getTasksByUser = query({
  args: { userId: v.string() },
  handler: async (ctx, args) => {
    const tasks = await ctx.db
      .query('tasks')
      .withIndex('by_user', (q) => q.eq('userId', args.userId))
      .collect();

    const enriched = await Promise.all(tasks.map(async (task) => mergeTask(task, await getTaskAi(ctx, task._id))));
    return enriched.sort((a, b) => (b.importance ?? 0) - (a.importance ?? 0));
  },
});

export const getTaskById = query({
  args: { taskId: v.id('tasks'), userId: v.string() },
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.taskId);
    if (!task || task.userId !== args.userId) {
      return null;
    }
    return mergeTask(task, await getTaskAi(ctx, task._id));
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
    const importance = calculateImportance(priority, args.dueDate, createdAt);

    const cleanTitle = sanitizeText(args.title);
    const cleanDescription = sanitizeText(args.description);
    const cleanCourseName = sanitizeText(args.courseName) || 'Sin materia';

    if (existing) {
      const sourceChanged =
        existing.title !== cleanTitle ||
        existing.description !== cleanDescription ||
        existing.dueDate !== args.dueDate ||
        existing.courseName !== cleanCourseName;
      await ctx.db.patch(existing._id, {
        title: cleanTitle,
        description: cleanDescription,
        dueDate: args.dueDate,
        courseName: cleanCourseName,
        importance,
      });
      if (sourceChanged) {
        await upsertTaskAi(ctx, existing._id, args.userId, {
          analysisStatus: 'stale',
          analysisVersion: ((await getTaskAi(ctx, existing._id))?.analysisVersion ?? 0) + 1,
        });
      }
      return existing._id;
    }

    return await ctx.db.insert('tasks', {
      userId: args.userId,
      courseWorkId: args.externalId,
      title: cleanTitle,
      description: cleanDescription,
      dueDate: args.dueDate,
      courseName: cleanCourseName,
      status: 'todo',
      priority,
      source: 'google_classroom',
      createdAt,
      importance,
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

    const importance = calculateImportance(
      updatedPriority,
      updatedDueDate,
      createdAt,
    );

    const updates: Record<string, any> = { importance };
    if (args.status !== undefined) updates.status = args.status;
    if (args.priority !== undefined) updates.priority = args.priority;
    if (args.dueDate !== undefined) updates.dueDate = args.dueDate;
    if (args.title !== undefined) updates.title = sanitizeText(args.title);
    if (args.description !== undefined) updates.description = sanitizeText(args.description);

    await ctx.db.patch(args.taskId, updates);

    return {
      success: true,
      taskId: args.taskId,
      updatedImportance: importance,
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
    const ai = await getTaskAi(ctx, args.taskId);
    if (ai) await ctx.db.delete(ai._id);
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
    const importance = calculateImportance(priority, args.dueDate, createdAt);

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
      importance,
    });

    return {
      success: true,
      taskId,
      importance,
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
    priorityIA: v.optional(priorityValidator),
    importanceIA: v.optional(v.number()),
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

    const complexityScore = args.complexity === 'easy' ? 1 : args.complexity === 'hard' ? 5 : 3;
    await ctx.db.patch(args.taskId, {
      priorityIA: args.priorityIA ?? args.recommendedPriority,
      importanceIA: args.importanceIA,
    });
    await upsertTaskAi(ctx, args.taskId, args.userId, {
      complexityScore,
      aiEstimatedMinutes: args.estimatedMinutes,
      aiRecommendedPriority: args.recommendedPriority,
      aiReasoning: args.reasoning,
      aiConfidence: args.confidence,
      aiAnalyzedAt: Date.now(),
    });

    const task = await ctx.db.get(args.taskId);
    return task ? mergeTask(task, await getTaskAi(ctx, args.taskId)) : null;
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

    const ai = await getTaskAi(ctx, args.taskId);
    if (!ai?.aiRecommendedPriority) {
      throw new Error('La tarea todavía no tiene un análisis para aplicar');
    }

    const priority = ai.aiRecommendedPriority;
    const dueDate = existing.dueDate;
    const createdAt = existing.createdAt ?? Date.now();
    const importance = calculateImportance(priority, dueDate, createdAt);

    await ctx.db.patch(args.taskId, {
      priority,
      status: ai.aiRecommendedStatus ?? existing.status,
      importance,
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
      importance: args.importanceScore,
    });

    return await ctx.db.get(args.taskId);
  },
});

export const recordTaskAnalysisHistory = mutation({
  args: {
    taskId: v.id('tasks'),
    userId: v.string(),
    importance: v.number(),
    priority: priorityValidator,
    complexityScore: v.number(),
    estimatedMinutes: v.number(),
    actualMinutes: v.optional(v.number()),
    reasoning: v.string(),
    confidence: v.optional(v.number()),
    model: v.string(),
  },
  returns: v.id('taskAnalysisHistory'),
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.taskId);
    if (!task || task.userId !== args.userId) {
      throw new Error('Tarea no encontrada o no autorizada');
    }

    return await ctx.db.insert('taskAnalysisHistory', {
      ...args,
      createdAt: Date.now(),
    });
  },
});

export const getTaskAnalysisHistory = query({
  args: {
    taskId: v.id('tasks'),
    userId: v.string(),
    limit: v.optional(v.number()),
  },
  returns: v.array(schema.doc('taskAnalysisHistory')),
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.taskId);
    if (!task || task.userId !== args.userId) {
      return [];
    }

    const limit = Math.min(Math.max(Math.floor(args.limit ?? 50), 1), 100);
    return await ctx.db
      .query('taskAnalysisHistory')
      .withIndex('by_task_and_created_at', (q) => q.eq('taskId', args.taskId))
      .order('desc')
      .take(limit);
  },
});

const batchAnalysisValidator = v.object({
  taskId: v.string(),
  importanceIA: v.number(),
  complexityScore: v.number(),
  estimatedMinutes: v.number(),
  priorityIA: priorityValidator,
  reasoning: v.string(),
  suggestedAction: v.string(),
  possibleDependencies: v.array(v.object({
    dependsOnTaskId: v.string(),
    confidence: v.number(),
  })),
  confidence: v.number(),
  requiresMoreInformation: v.boolean(),
  missingInformation: v.array(v.string()),
});

export const getTasksForAnalysis = query({
  args: {
    userId: v.string(),
    now: v.number(),
    limit: v.optional(v.number()),
    force: v.optional(v.boolean()),
  },
  returns: v.array(v.any()),
  handler: async (ctx, args) => {
    const limit = Math.min(Math.max(Math.floor(args.limit ?? 100), 1), 100);
    const futureTasks = await ctx.db
      .query('tasks')
      .withIndex('by_user_due_date', (q) => q.eq('userId', args.userId).gte('dueDate', args.now))
      .order('asc')
      .take(limit);
    const undatedTasks = await ctx.db
      .query('tasks')
      .withIndex('by_user', (q) => q.eq('userId', args.userId))
      .take(limit);
    const tasks = [...futureTasks, ...undatedTasks.filter((task) => task.dueDate === undefined)];
    const uniqueTasks = Array.from(new Map(tasks.map((task) => [task._id, task])).values());
    const enriched = await Promise.all(uniqueTasks.map(async (task) => ({
      task,
      ai: await getTaskAi(ctx, task._id),
    })));
    return enriched
      .filter(({ task, ai }) =>
        task.status !== 'completed' &&
        (args.force === true ||
          ai?.analysisStatus === 'pending' ||
          ai?.analysisStatus === 'stale' ||
          ai?.analysisStatus === 'failed' ||
          (ai?.analysisStatus === undefined && ai?.aiAnalyzedAt === undefined)),
      )
      .map(({ task, ai }) => mergeTask(task, ai))
      .slice(0, limit);
  },
});

export const markAnalysisFailed = mutation({
  args: { userId: v.string(), taskIds: v.array(v.id('tasks')), error: v.string() },
  returns: v.number(),
  handler: async (ctx, args) => {
    let updated = 0;
    for (const taskId of args.taskIds) {
      const task = await ctx.db.get(taskId);
      if (task?.userId === args.userId) {
        await upsertTaskAi(ctx, taskId, args.userId, {
          analysisStatus: 'failed',
          analysisError: args.error,
        });
        updated++;
      }
    }
    return updated;
  },
});

export const saveBatchTaskAnalysis = mutation({
  args: {
    userId: v.string(),
    model: v.string(),
    analyses: v.array(batchAnalysisValidator),
  },
  returns: v.number(),
  handler: async (ctx, args) => {
    const existingEdges = await ctx.db
      .query('taskDependencies')
      .withIndex('by_user_and_task', (q) => q.eq('userId', args.userId))
      .take(1000);
    const outgoing = new Map<string, string[]>();
    for (const edge of existingEdges) {
      outgoing.set(edge.taskId, [...(outgoing.get(edge.taskId) ?? []), edge.dependsOnTaskId]);
    }
    for (const analysis of args.analyses) {
      const taskId = analysis.taskId as Id<'tasks'>;
      const task = await ctx.db.get(taskId);
      if (!task || task.userId !== args.userId) continue;
      for (const dependency of analysis.possibleDependencies) {
        const dependsOnTaskId = dependency.dependsOnTaskId as Id<'tasks'>;
        if (dependsOnTaskId === taskId) continue;
        const dependencyTask = await ctx.db.get(dependsOnTaskId);
        if (!dependencyTask || dependencyTask.userId !== args.userId) continue;
        outgoing.set(taskId, [...(outgoing.get(taskId) ?? []), dependsOnTaskId]);
      }
    }
    const visiting = new Set<string>();
    const visited = new Set<string>();
    const hasCycle = (node: string): boolean => {
      if (visiting.has(node)) return true;
      if (visited.has(node)) return false;
      visiting.add(node);
      for (const next of outgoing.get(node) ?? []) if (hasCycle(next)) return true;
      visiting.delete(node);
      visited.add(node);
      return false;
    };
    if ([...outgoing.keys()].some(hasCycle)) throw new Error('Las dependencias del lote crearían un ciclo');

    let saved = 0;
    for (const analysis of args.analyses) {
      if (analysis.importanceIA < 1 || analysis.importanceIA > 100) {
        throw new Error('La importancia debe estar entre 1 y 100');
      }
      const taskId = analysis.taskId as Id<'tasks'>;
      const task = await ctx.db.get(taskId);
      if (!task || task.userId !== args.userId || task.status === 'completed') continue;
      const needsReview = analysis.requiresMoreInformation || analysis.confidence < 0.6;
      await ctx.db.patch(taskId, {
        importanceIA: analysis.importanceIA,
        priorityIA: analysis.priorityIA,
      });
      await upsertTaskAi(ctx, taskId, args.userId, {
        complexityScore: analysis.complexityScore,
        aiEstimatedMinutes: analysis.estimatedMinutes,
        aiRecommendedPriority: analysis.priorityIA,
        aiReasoning: analysis.reasoning,
        aiSuggestedAction: analysis.suggestedAction,
        aiConfidence: analysis.confidence,
        aiModel: args.model,
        aiAnalyzedAt: Date.now(),
        analysisStatus: needsReview ? 'needs_review' : 'analyzed',
      });
      await ctx.db.insert('taskAnalysisHistory', {
        taskId,
        userId: args.userId,
        importance: analysis.importanceIA,
        priority: analysis.priorityIA,
        complexityScore: analysis.complexityScore,
        estimatedMinutes: analysis.estimatedMinutes,
        reasoning: analysis.reasoning,
        confidence: analysis.confidence,
        model: args.model,
        createdAt: Date.now(),
      });

      for (const dependency of analysis.possibleDependencies) {
        const dependsOnTaskId = dependency.dependsOnTaskId as Id<'tasks'>;
        if (dependsOnTaskId === taskId) continue;
        const dependencyTask = await ctx.db.get(dependsOnTaskId);
        if (!dependencyTask || dependencyTask.userId !== args.userId) continue;

        const existingDependency = await ctx.db
          .query('taskDependencies')
          .withIndex('by_task_and_depends_on', (q) =>
            q.eq('taskId', taskId).eq('dependsOnTaskId', dependsOnTaskId),
          )
          .unique();
        if (!existingDependency) {
          await ctx.db.insert('taskDependencies', {
            taskId,
            dependsOnTaskId,
            userId: args.userId,
            source: 'agent',
            confidence: dependency.confidence,
            createdAt: Date.now(),
          });
        }
      }
      saved++;
    }
    return saved;
  },
});

export const getUserTaskGraph = query({
  args: { userId: v.string(), now: v.number(), limit: v.optional(v.number()) },
  returns: v.object({ tasks: v.array(v.any()), dependencies: v.array(schema.doc('taskDependencies')) }),
  handler: async (ctx, args) => {
    const limit = Math.min(Math.max(Math.floor(args.limit ?? 200), 1), 200);
    const futureTasks = await ctx.db
      .query('tasks')
      .withIndex('by_user_due_date', (q) => q.eq('userId', args.userId).gte('dueDate', args.now))
      .take(limit);
    const undatedTasks = await ctx.db
      .query('tasks')
      .withIndex('by_user', (q) => q.eq('userId', args.userId))
      .take(limit);
    const tasks = Array.from(
      new Map(
        [...futureTasks, ...undatedTasks.filter((task) => task.dueDate === undefined)]
          .filter((task) => task.status !== 'completed')
          .map((task) => [task._id, task]),
      ).values(),
    ).slice(0, limit);
    const taskIds = new Set(tasks.map((task) => task._id));
    const dependencies = await ctx.db
      .query('taskDependencies')
      .withIndex('by_user_and_task', (q) => q.eq('userId', args.userId))
      .take(limit * 4);
    const enrichedTasks = await Promise.all(tasks.map(async (task) =>
      mergeTask(task, await getTaskAi(ctx, task._id)),
    ));
    return {
      tasks: enrichedTasks,
      dependencies: dependencies.filter(
        (dependency) => taskIds.has(dependency.taskId) && taskIds.has(dependency.dependsOnTaskId),
      ),
    };
  },
});

export const saveTaskDependency = mutation({
  args: {
    userId: v.string(),
    taskId: v.id('tasks'),
    dependsOnTaskId: v.id('tasks'),
    source: v.union(v.literal('user'), v.literal('system'), v.literal('agent')),
    confidence: v.number(),
  },
  returns: v.id('taskDependencies'),
  handler: async (ctx, args) => {
    if (args.taskId === args.dependsOnTaskId) throw new Error('Una tarea no puede depender de sí misma');
    const [task, dependencyTask] = await Promise.all([
      ctx.db.get(args.taskId),
      ctx.db.get(args.dependsOnTaskId),
    ]);
    if (!task || !dependencyTask || task.userId !== args.userId || dependencyTask.userId !== args.userId) {
      throw new Error('Las tareas de la dependencia no existen o no pertenecen al usuario');
    }
    const edges = await ctx.db
      .query('taskDependencies')
      .withIndex('by_user_and_task', (q) => q.eq('userId', args.userId))
      .take(1000);
    const outgoing = new Map<string, string[]>();
    for (const edge of edges) {
      outgoing.set(edge.taskId, [...(outgoing.get(edge.taskId) ?? []), edge.dependsOnTaskId]);
    }
    outgoing.set(args.taskId, [...(outgoing.get(args.taskId) ?? []), args.dependsOnTaskId]);
    const visiting = new Set<string>();
    const visited = new Set<string>();
    const hasCycle = (node: string): boolean => {
      if (visiting.has(node)) return true;
      if (visited.has(node)) return false;
      visiting.add(node);
      for (const next of outgoing.get(node) ?? []) if (hasCycle(next)) return true;
      visiting.delete(node);
      visited.add(node);
      return false;
    };
    if ([...outgoing.keys()].some(hasCycle)) throw new Error('La dependencia crearía un ciclo');
    const existing = await ctx.db
      .query('taskDependencies')
      .withIndex('by_task_and_depends_on', (q) => q.eq('taskId', args.taskId).eq('dependsOnTaskId', args.dependsOnTaskId))
      .unique();
    if (existing) return existing._id;
    return await ctx.db.insert('taskDependencies', { ...args, createdAt: Date.now() });
  },
});

export const saveStudyPlan = mutation({
  args: {
    userId: v.string(),
    weekStart: v.string(),
    weekEnd: v.string(),
    generatedAt: v.number(),
    totalPlannedMinutes: v.number(),
    totalAvailableMinutes: v.number(),
    marginMinutes: v.number(),
    unscheduledMinutes: v.optional(v.number()),
    unscheduledTaskIds: v.optional(v.array(v.id('tasks'))),
    blocks: v.array(v.object({
      date: v.string(),
      taskId: v.id('tasks'),
      startTime: v.string(),
      endTime: v.string(),
      plannedMinutes: v.number(),
      reason: v.string(),
    })),
  },
  returns: v.id('studyPlans'),
  handler: async (ctx, args) => {
    const planId = await ctx.db.insert('studyPlans', {
      userId: args.userId,
      weekStart: args.weekStart,
      weekEnd: args.weekEnd,
      generatedAt: args.generatedAt,
      totalPlannedMinutes: args.totalPlannedMinutes,
      totalAvailableMinutes: args.totalAvailableMinutes,
      marginMinutes: args.marginMinutes,
      ...(args.unscheduledMinutes !== undefined && { unscheduledMinutes: args.unscheduledMinutes }),
      ...(args.unscheduledTaskIds !== undefined && { unscheduledTaskIds: args.unscheduledTaskIds }),
    });
    for (const block of args.blocks) {
      const task = await ctx.db.get(block.taskId);
      if (!task || task.userId !== args.userId) continue;
      await ctx.db.insert('studyPlanBlocks', { ...block, planId, userId: args.userId });
    }
    return planId;
  },
});

export const getLatestStudyPlan = query({
  args: { userId: v.string() },
  returns: v.union(
    v.object({
      plan: schema.doc('studyPlans'),
      blocks: v.array(schema.doc('studyPlanBlocks')),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const plan = await ctx.db
      .query('studyPlans')
      .withIndex('by_user_and_generated_at', (q) => q.eq('userId', args.userId))
      .order('desc')
      .take(1);
    const latest = plan[0];
    if (!latest) return null;
    const blocks = await ctx.db
      .query('studyPlanBlocks')
      .withIndex('by_plan_and_date', (q) => q.eq('planId', latest._id))
      .take(200);
    return { plan: latest, blocks };
  },
});

export const getTasksForDashboard = query({
  args: { userId: v.string(), limit: v.optional(v.number()) },
  returns: v.array(v.any()),
  handler: async (ctx, args) => {
    const limit = Math.min(Math.max(Math.floor(args.limit ?? 300), 1), 300);
    const tasks = await ctx.db
      .query('tasks')
      .withIndex('by_user', (q) => q.eq('userId', args.userId))
      .take(limit);
    return await Promise.all(tasks.map(async (task) => mergeTask(task, await getTaskAi(ctx, task._id))));
  },
});
