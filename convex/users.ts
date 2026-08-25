import { v } from 'convex/values';
import { mutation, query } from './_generated/server';

export const storeUser = mutation({
  args: {
    googleId: v.string(),
    name: v.string(),
    email: v.string(),
    picture: v.optional(v.string()),
    refreshToken: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existingUser = await ctx.db
      .query('users')
      .withIndex('by_google_id', (q) => q.eq('googleId', args.googleId))
      .unique();

    if (existingUser) {
      await ctx.db.patch(existingUser._id, {
        name: args.name,
        email: args.email,
        picture: args.picture,
        ...(args.refreshToken && { refreshToken: args.refreshToken }),
      });
      return existingUser._id;
    }

    return await ctx.db.insert('users', {
      googleId: args.googleId,
      name: args.name,
      email: args.email,
      picture: args.picture,
      refreshToken: args.refreshToken,
      createdAt: Date.now(),
    });
  },
});

export const getUserByGoogleId = query({
  args: { googleId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query('users')
      .withIndex('by_google_id', (q) => q.eq('googleId', args.googleId))
      .unique();
  },
});