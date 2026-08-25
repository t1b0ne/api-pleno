import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';

export default defineSchema({
  users: defineTable({
    googleId: v.string(),
    name: v.string(),
    email: v.string(),
    picture: v.optional(v.string()),
    refreshToken: v.optional(v.string()),
    createdAt: v.number(),
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
  })
    .index('by_user', ['userId'])
    .index('by_user_coursework', ['userId', 'courseWorkId']),
});