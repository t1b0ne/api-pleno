// convex/crons.ts
import { cronJobs } from 'convex/server';
import { internalMutation, internalAction } from './_generated/server';
import { internal, api } from './_generated/api';

const crons = cronJobs();

// Ejecuta el proceso cada 2 horas
crons.interval(
  'sync-active-classroom-users',
  { hours: 2 },
  internal.crons.syncPendingUsersBatch,
);

export default crons;

/**
 * Acción interna que procesa a los usuarios en lotes pequeños
 */
export const syncPendingUsersBatch = internalAction({
  args: {},
  handler: async (ctx) => {
    // 1. Obtener una lista reducida de usuarios desactualizados
    const usersToSync: Array<{ googleId: string; accessToken?: string }> = 
      await ctx.runQuery(internal.users.getUsersNeedingSync, { limit: 10 });

    for (const user of usersToSync) {
      if (!user.accessToken) continue;

      try {
        // Ejecutar la sincronización existente
        await ctx.runAction(api.classroom.syncClassroomTasks, {
          userId: user.googleId,
          accessToken: user.accessToken,
        });

        // Marcar última sincronización exitosa
        await ctx.runMutation(internal.users.updateLastSyncedAt, {
          userId: user.googleId,
        });
      } catch (error) {
        console.error(`Fallo de sync para usuario ${user.googleId}:`, error);
      }
    }
  },
});