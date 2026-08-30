import { z } from 'zod';

const dependencySchema = z.object({
  dependsOnTaskId: z.string().min(1),
  confidence: z.number().min(0).max(1),
});

export const taskAnalysisBatchSchema = z.object({
  batchAnalysis: z.object({
    workloadRisk: z.string(),
    summary: z.string(),
  }),
  tasks: z.array(
    z.object({
      taskId: z.string().min(1),
      importanceIA: z.number().min(1).max(100),
      complexityScore: z.number().min(1).max(5),
      estimatedMinutes: z.number().int().min(1),
      priorityIA: z.enum(['low', 'medium', 'high']),
      reasoning: z.string().max(600),
      suggestedAction: z.string().max(300),
      possibleDependencies: z.array(dependencySchema),
      confidence: z.number().min(0).max(1),
      requiresMoreInformation: z.boolean(),
      missingInformation: z.array(z.string()),
    }),
  ),
});

export type TaskAnalysisBatch = z.infer<typeof taskAnalysisBatchSchema>;
