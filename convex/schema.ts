import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';

export default defineSchema({
  users: defineTable({
    googleId: v.string(),
    name: v.string(),
    email: v.string(),
    picture: v.optional(v.string()),
    refreshToken: v.optional(v.string()),
    tokenExpiresAt: v.optional(v.number()),
    createdAt: v.number(),
    classroomEnabled: v.optional(v.boolean()),
    classroomConnectedAt: v.optional(v.number()),
  })
    .index('by_google_id', ['googleId'])
    .index('by_email', ['email']),

  userProfiles: defineTable({
    userId: v.string(),
    role: v.optional(v.string()),
    age: v.optional(v.number()),
    occupation: v.optional(v.string()),
    availableHoursPerDay: v.optional(v.number()),
    availableSchedule: v.optional(
      v.array(
        v.object({
          day: v.string(),
          start: v.string(),
          end: v.string(),
        }),
      ),
    ),
    workHoursPerDay: v.optional(v.number()),
    studyHoursPerDay: v.optional(v.number()),
    energyMorning: v.optional(v.number()),
    energyAfternoon: v.optional(v.number()),
    energyNight: v.optional(v.number()),
    preferredActivities: v.optional(v.array(v.string())),
    distractions: v.optional(v.array(v.string())),
    workMethod: v.optional(v.string()),
    personalGoals: v.optional(v.array(v.string())),
    learningStyle: v.optional(v.string()),
    workloadTolerance: v.optional(v.number()),
    // Permite distinguir preferencias declaradas de métricas inferidas.
    declaredFieldNames: v.optional(v.array(v.string())),
    averageMinutesByTaskType: v.optional(v.record(v.string(), v.number())),
    averageEstimationErrorMinutes: v.optional(v.number()),
    onTimeCompletionRate: v.optional(v.number()),
    averageActualMinutes: v.optional(v.number()),
    actualWorkloadTolerance: v.optional(v.number()),
    lastBehaviorObservedAt: v.optional(v.number()),
    updatedAt: v.number(),
  }).index('by_user_id', ['userId']),

  tasks: defineTable({
    userId: v.string(),
    externalId: v.optional(v.string()),
    courseWorkId: v.optional(v.string()),
    title: v.string(),
    description: v.string(),
    dueDate: v.optional(v.number()),
    courseName: v.string(),
    status: v.union(v.literal('todo'), v.literal('in_progress'), v.literal('completed')),
    priority: v.union(v.literal('low'), v.literal('medium'), v.literal('high')),
    source: v.optional(v.string()),
    createdAt: v.number(),
    importance: v.optional(v.number()),
    priorityIA: v.optional(
      v.union(v.literal('low'), v.literal('medium'), v.literal('high')),
    ),
    importanceIA: v.optional(v.number()),
  })
    .index('by_user', ['userId'])
    .index('by_user_coursework', ['userId', 'courseWorkId'])
    .index('by_user_due_date', ['userId', 'dueDate']),

  taskAiResults: defineTable({
    taskId: v.id('tasks'),
    userId: v.string(),
    complexityScore: v.optional(v.number()),
    aiEstimatedMinutes: v.optional(v.number()),
    aiRecommendedStatus: v.optional(
      v.union(v.literal('todo'), v.literal('in_progress'), v.literal('completed')),
    ),
    aiRecommendedPriority: v.optional(
      v.union(v.literal('low'), v.literal('medium'), v.literal('high')),
    ),
    aiReasoning: v.optional(v.string()),
    aiConfidence: v.optional(v.number()),
    aiSuggestedAction: v.optional(v.string()),
    aiModel: v.optional(v.string()),
    aiAnalyzedAt: v.optional(v.number()),
    analysisStatus: v.optional(
      v.union(v.literal('pending'), v.literal('analyzed'), v.literal('needs_review'), v.literal('stale'), v.literal('failed')),
    ),
    analysisVersion: v.optional(v.number()),
    analysisError: v.optional(v.string()),
    updatedAt: v.number(),
  })
    .index('by_task', ['taskId'])
    .index('by_user_and_status', ['userId', 'analysisStatus']),

  taskAnalysisHistory: defineTable({
    taskId: v.id('tasks'),
    userId: v.string(),
    importance: v.number(),
    priority: v.union(v.literal('low'), v.literal('medium'), v.literal('high')),
    complexityScore: v.number(),
    estimatedMinutes: v.number(),
    actualMinutes: v.optional(v.number()),
    reasoning: v.string(),
    confidence: v.optional(v.number()),
    model: v.string(),
    createdAt: v.number(),
  })
    .index('by_task_and_created_at', ['taskId', 'createdAt'])
    .index('by_user_and_created_at', ['userId', 'createdAt']),

  taskDependencies: defineTable({
    taskId: v.id('tasks'),
    dependsOnTaskId: v.id('tasks'),
    userId: v.string(),
    source: v.union(v.literal('user'), v.literal('system'), v.literal('agent')),
    confidence: v.number(),
    createdAt: v.number(),
  })
    .index('by_task_and_depends_on', ['taskId', 'dependsOnTaskId'])
    .index('by_user_and_task', ['userId', 'taskId']),

  studyPlans: defineTable({
    userId: v.string(),
    weekStart: v.string(),
    weekEnd: v.string(),
    generatedAt: v.number(),
    totalPlannedMinutes: v.number(),
    totalAvailableMinutes: v.number(),
    marginMinutes: v.number(),
    unscheduledMinutes: v.optional(v.number()),
    unscheduledTaskIds: v.optional(v.array(v.id('tasks'))),
  }).index('by_user_and_generated_at', ['userId', 'generatedAt']),

  studyPlanBlocks: defineTable({
    planId: v.id('studyPlans'),
    userId: v.string(),
    date: v.string(),
    taskId: v.id('tasks'),
    startTime: v.string(),
    endTime: v.string(),
    plannedMinutes: v.number(),
    reason: v.string(),
  })
    .index('by_plan_and_date', ['planId', 'date'])
    .index('by_user_and_date', ['userId', 'date']),
});
