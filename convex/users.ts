import { v } from 'convex/values';
import { mutation, query, internalQuery, internalMutation } from './_generated/server';

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

// Añadir al final de convex/users.ts

export const setClassroomEnabled = mutation({
  args: {
    userId: v.string(), // googleId del usuario
    enabled: v.boolean(),
  },
  handler: async (ctx, args) => {
    // Buscar al usuario por su googleId
    const user = await ctx.db
      .query('users')
      .withIndex('by_google_id', (q) => q.eq('googleId', args.userId))
      .first();

    if (!user) {
      throw new Error('Usuario no encontrado');
    }

    const updates: Record<string, any> = {
      classroomEnabled: args.enabled,
    };

    // Si el usuario acaba de activar la integración, guardamos la marca de tiempo
    if (args.enabled) {
      updates.classroomConnectedAt = Date.now();
    }

    await ctx.db.patch(user._id, updates);

    return {
      success: true,
      userId: args.userId,
      classroomEnabled: args.enabled,
    };
  },
});

// convex/users.ts (fragmento de getUsersNeedingSync)

export const getUsersNeedingSync = internalQuery({
  args: { limit: v.number() },
  handler: async (ctx, args) => {
    const SIX_HOURS_MS = 6 * 60 * 60 * 1000;
    const cutoff = Date.now() - SIX_HOURS_MS;

    const allUsers = await ctx.db.query('users').collect();

    return allUsers
      .filter((u) => {
        const isEnabled = u.classroomEnabled === true;
        const hasToken = typeof u.accessToken === 'string' && u.accessToken.length > 0;
        const isOutdated = !u.lastSyncedAt || u.lastSyncedAt < cutoff;

        return isEnabled && hasToken && isOutdated;
      })
      .slice(0, args.limit)
      .map((u) => ({
        googleId: u.googleId,
        accessToken: u.accessToken!, // '!' le confirma a TypeScript que el token no es undefined tras el filtro
      }));
  },
});

export const updateLastSyncedAt = internalMutation({
  args: { userId: v.string() },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query('users')
      .withIndex('by_google_id', (q) => q.eq('googleId', args.userId))
      .first();

    if (user) {
      await ctx.db.patch(user._id, { lastSyncedAt: Date.now() });
    }
  },
});