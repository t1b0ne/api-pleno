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

  tasks: defineTable({
    userId: v.string(),
    courseWorkId: v.optional(v.string()),
    externalId: v.optional(v.string()), // Soporte para compatibilidad con documentos preexistentes
    title: v.string(),
    description: v.string(),
    dueDate: v.optional(v.number()),
    courseName: v.string(),
    status: v.union(v.literal('todo'), v.literal('in_progress'), v.literal('completed')),
    priority: v.union(v.literal('low'), v.literal('medium'), v.literal('high')),
    source: v.optional(v.string()),
    createdAt: v.number(),
    importanceScore: v.number(),
    aiComplexity: v.optional(
      v.union(v.literal('easy'), v.literal('medium'), v.literal('hard')),
    ),
    aiEstimatedMinutes: v.optional(v.number()),
    aiRecommendedPriority: v.optional(
      v.union(v.literal('low'), v.literal('medium'), v.literal('high')),
    ),
    aiRecommendedStatus: v.optional(
      v.union(v.literal('todo'), v.literal('in_progress'), v.literal('completed')),
    ),
    aiReasoning: v.optional(v.string()),
    aiConfidence: v.optional(v.number()),
    aiAnalyzedAt: v.optional(v.number()),
  })
    .index('by_user', ['userId'])
    .index('by_user_coursework', ['userId', 'courseWorkId']),
});
