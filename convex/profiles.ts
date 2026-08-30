import { v } from 'convex/values';
import { mutation, query } from './_generated/server';
import schema from './schema';

const scheduleBlock = v.object({
  day: v.string(),
  start: v.string(),
  end: v.string(),
});

const profileFields = {
  role: v.optional(v.string()),
  age: v.optional(v.number()),
  occupation: v.optional(v.string()),
  availableHoursPerDay: v.optional(v.number()),
  availableSchedule: v.optional(v.array(scheduleBlock)),
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
  declaredFieldNames: v.optional(v.array(v.string())),
  averageMinutesByTaskType: v.optional(v.record(v.string(), v.number())),
  averageEstimationErrorMinutes: v.optional(v.number()),
  onTimeCompletionRate: v.optional(v.number()),
  averageActualMinutes: v.optional(v.number()),
  actualWorkloadTolerance: v.optional(v.number()),
  lastBehaviorObservedAt: v.optional(v.number()),
};

export const getProfile = query({
  args: { userId: v.string() },
  returns: v.union(schema.doc('userProfiles'), v.null()),
  handler: async (ctx, args) => {
    const profile = await ctx.db
      .query('userProfiles')
      .withIndex('by_user_id', (q) => q.eq('userId', args.userId))
      .unique();

    return profile;
  },
});

export const saveProfile = mutation({
  args: {
    userId: v.string(),
    ...profileFields,
  },
  returns: v.id('userProfiles'),
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query('userProfiles')
      .withIndex('by_user_id', (q) => q.eq('userId', args.userId))
      .unique();

    const { userId, ...profile } = args;
    const now = Date.now();

    if (existing) {
      await ctx.db.patch(existing._id, { ...profile, updatedAt: now });
      return existing._id;
    }

    return await ctx.db.insert('userProfiles', {
      userId,
      ...profile,
      updatedAt: now,
    });
  },
});
