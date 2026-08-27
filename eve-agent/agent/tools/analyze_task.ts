import { defineTool } from "eve/tools";
import { z } from "zod";

const taskSchema = z.object({
  taskId: z.string().optional(),
  title: z.string().min(1),
  description: z.string().default(""),
  courseName: z.string().default("General"),
  dueDate: z.number().optional(),
  priority: z.enum(["low", "medium", "high"]).default("medium"),
  status: z.enum(["todo", "in_progress", "completed"]).default("todo"),
});

const profileSchema = z.object({
  occupation: z.string().optional(),
  experienceLevel: z.string().optional(),
  skills: z.string().optional(),
  interests: z.string().optional(),
  goals: z.string().optional(),
});

export default defineTool({
  description:
    "Prepara la tarea seleccionada y el perfil del usuario para que el agente analice complejidad, urgencia, prioridad y estado recomendado. Es una herramienta de solo lectura.",
  inputSchema: z.object({
    task: taskSchema,
    profile: profileSchema.optional(),
  }),
  outputSchema: z.object({
    task: taskSchema,
    profile: profileSchema.optional(),
    missingInformation: z.array(z.string()),
    analysisInstructions: z.string(),
  }),
  execute({ task, profile }) {
    const missingInformation: string[] = [];

    if (!task.description.trim()) {
      missingInformation.push("descripción o criterios de la tarea");
    }

    if (!task.dueDate) {
      missingInformation.push("fecha de entrega");
    }

    if (!profile?.experienceLevel) {
      missingInformation.push("nivel de experiencia del usuario en este tema");
    }

    return {
      task,
      profile,
      missingInformation,
      analysisInstructions:
        "Usa el skill task-analysis. No cambies datos: devuelve una recomendación y explica la evidencia utilizada.",
    };
  },
});
