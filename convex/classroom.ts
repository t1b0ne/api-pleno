import { v } from 'convex/values';
import { action } from './_generated/server';
import { api } from './_generated/api';

export const syncClassroomTasks = action({
  args: {
    userId: v.string(),
    accessToken: v.string(),
  },
  handler: async (ctx, args) => {
    // 1. Obtener los cursos activos del usuario desde Google Classroom
    const coursesResponse = await fetch(
      'https://classroom.googleapis.com/v1/courses?courseStates=ACTIVE',
      {
        headers: { Authorization: `Bearer ${args.accessToken}` },
      },
    );

    if (!coursesResponse.ok) {
      const errorData = await coursesResponse.text();
      throw new Error(`Error de Google Classroom (${coursesResponse.status}): ${errorData}`);
    }

    const coursesData = await coursesResponse.json();
    const courses = coursesData.courses || [];

    let totalSynced = 0;

    // 2. Recorrer cada curso para extraer las tareas (courseWork)
    for (const course of courses) {
      const workResponse = await fetch(
        `https://classroom.googleapis.com/v1/courses/${course.id}/courseWork`,
        {
          headers: { Authorization: `Bearer ${args.accessToken}` },
        },
      );

      if (!workResponse.ok) continue;

      const workData = await workResponse.json();
      const courseWorkList = workData.courseWork || [];

      // 3. Guardar o actualizar cada tarea usando tu mutación upsertTask
      for (const work of courseWorkList) {
        let dueDate: number | undefined = undefined;
        if (work.dueDate) {
          const { year, month, day } = work.dueDate;
          const { hours = 23, minutes = 59 } = work.dueTime || {};
          dueDate = new Date(Date.UTC(year, month - 1, day, hours, minutes)).getTime();
        }

        await ctx.runMutation(api.tasks.upsertTask, {
          userId: args.userId,
          externalId: work.id,
          title: work.title,
          description: work.description,
          dueDate,
          courseName: course.name,
        });

        totalSynced++;
      }
    }

    return { success: true, totalSynced };
  },
});