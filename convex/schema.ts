import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';

export default defineSchema({
  tasks: defineTable({
    userId: v.optional(v.string()),
    externalId: v.optional(v.string()),
    title: v.string(),
    description: v.string(),
    dueDate: v.optional(v.number()),
    courseName: v.string(),
    status: v.union(v.literal('todo'), v.literal('in_progress'), v.literal('done')),
    priority: v.union(v.literal('low'), v.literal('medium'), v.literal('high')),
    source: v.union(v.literal('manual'), v.literal('google_classroom')),
    createdAt: v.optional(v.number()),
    importanceScore: v.optional(v.number()),
  })
    .index('by_user', ['userId'])
    .index('by_user_importance', ['userId', 'importanceScore']),
});