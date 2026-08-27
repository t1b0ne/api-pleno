import { v } from 'convex/values';
import { action } from './_generated/server';
import { api } from './_generated/api';

/**
 * Función auxiliar para realizar peticiones a Google Classroom
 * manejando automáticamente la paginación de resultados.
 */
async function fetchAllPages(url: string, accessToken: string, dataKey: string) {
  let items: any[] = [];
  let pageToken: string | undefined = undefined;

  do {
    const fetchUrl: string = pageToken
      ? `${url}${url.includes('?') ? '&' : '?'}pageToken=${pageToken}`
      : url;

    const response = await fetch(fetchUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!response.ok) {
      if (response.status === 404) break; // Si el curso no tiene tareas asignadas
      const errorText = await response.text();
      throw new Error(`Google API Error [${response.status}]: ${errorText}`);
    }

    const data = await response.json();
    if (data[dataKey]) {
      items = items.concat(data[dataKey]);
    }

    pageToken = data.nextPageToken;
  } while (pageToken);

  return items;
}

export const syncClassroomTasks = action({
  args: {
    userId: v.string(),
    accessToken: v.string(),
    refreshToken: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // 1. Obtener TODOS los cursos activos manejando paginación
    const courses = await fetchAllPages(
      'https://classroom.googleapis.com/v1/courses?courseStates=ACTIVE&pageSize=50',
      args.accessToken,
      'courses',
    );

    if (courses.length === 0) {
      return { success: true, totalSynced: 0, coursesFound: 0 };
    }

    // 2. Ejecutar consultas en PARALELO para todos los cursos (Promise.all)
    // En lugar de esperar 1 por 1, se consultan todos a la vez.
    const courseWorkPromises = courses.map(async (course: any) => {
      try {
        const workList = await fetchAllPages(
          `https://classroom.googleapis.com/v1/courses/${course.id}/courseWork?pageSize=50`,
          args.accessToken,
          'courseWork',
        );
        return { courseName: course.name, workList };
      } catch (error) {
        console.error(`Error al obtener tareas del curso ${course.id}:`, error);
        return { courseName: course.name, workList: [] };
      }
    });

    const coursesResults = await Promise.all(courseWorkPromises);

    // 3. Procesar e insertar en la base de datos de Convex
    let totalSynced = 0;

    for (const { courseName, workList } of coursesResults) {
      for (const work of workList) {
        let dueDate: number | undefined = undefined;

        if (work.dueDate && work.dueDate.year && work.dueDate.month && work.dueDate.day) {
          const { year, month, day } = work.dueDate;
          const { hours = 23, minutes = 59 } = work.dueTime || {};
          dueDate = Date.UTC(year, month - 1, day, hours, minutes);
        }

        await ctx.runMutation(api.tasks.upsertTask, {
          userId: args.userId,
          externalId: work.id,
          title: work.title,
          description: work.description,
          dueDate,
          courseName,
        });

        totalSynced++;
      }
    }

    return {
      success: true,
      totalSynced,
      coursesFound: courses.length,
    };
  },
});