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

const preparedTaskSchema = taskSchema.extend({
  taskId: z.string(),
  daysRemaining: z.number().nullable(),
  hoursRemaining: z.number().nullable(),
  overdue: z.boolean(),
  urgency: z.enum(['low', 'medium', 'high', 'overdue']),
  hasDescription: z.boolean(),
  descriptionLength: z.number(),
  nearbyTaskCount: z.number(),
  dailyWorkloadMinutes: z.number(),
  weeklyWorkloadMinutes: z.number(),
  availableMinutesPerDay: z.number(),
  systemPriority: z.enum(['low', 'medium', 'high']),
  systemImportance: z.number(),
});

const profileSchema = z.object({
  occupation: z.string().optional(),
  experienceLevel: z.string().optional(),
  skills: z.string().optional(),
  interests: z.string().optional(),
  goals: z.string().optional(),
});

// Normaliza el caso en que el modelo envía los argumentos como JSON serializado.
const toolInputSchema = z.preprocess((value) => {
  if (typeof value !== "string") return value;
  try {
    const parsed: unknown = JSON.parse(value);
    return parsed && typeof parsed === "object" ? parsed : value;
  } catch {
    return value;
  }
}, z.object({
  task: taskSchema.optional(),
  tasks: z.array(preparedTaskSchema).optional(),
  profile: profileSchema.optional(),
}));

export default defineTool({
  description:
    "Prepara la tarea y el perfil para analizar complejidad, urgencia, priorityIA e importanceIA sin alterar priority ni importance del sistema. Es solo lectura.",
  inputSchema: toolInputSchema,
  outputSchema: z.object({
    task: taskSchema.optional(),
    tasks: z.array(preparedTaskSchema).optional(),
    profile: profileSchema.optional(),
    missingInformation: z.array(z.string()),
    analysisInstructions: z.string(),
  }),
  execute({ task, tasks, profile }) {
    const missingInformation: string[] = [];

    const inputTasks = tasks ?? (task ? [task] : []);

    if (inputTasks.some((item) => !item.description.trim())) {
      missingInformation.push("descripción o criterios de la tarea");
    }

    if (inputTasks.some((item) => !item.dueDate)) {
      missingInformation.push("fecha de entrega");
    }

    if (!profile?.experienceLevel) {
      missingInformation.push("nivel de experiencia del usuario en este tema");
    }

    return {
      task,
      tasks,
      profile,
      missingInformation,
      analysisInstructions:
        "Usa el skill task-analysis. No cambies datos: devuelve una recomendación y explica la evidencia utilizada.",
    };
  },
});
