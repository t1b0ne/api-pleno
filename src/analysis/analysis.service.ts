import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { anyApi } from 'convex/server';
import { ConvexService } from '../convex/convex.service';
import { preprocessTasks, PreprocessedTask } from './task-preprocessor';
import { taskAnalysisBatchSchema, TaskAnalysisBatch } from './task-analysis.schema';
import { SummaryService } from '../summary/summary.service';
import { filterEligibleTasks } from './task-analysis.algorithms';
import { toProfileContext, UserProfileLike } from '../profile/profile-context';

@Injectable()
export class AnalysisService {
  constructor(
    private readonly convexService: ConvexService,
    private readonly summaryService: SummaryService,
  ) {}

  async analyzeSummary(userId: string, force = false) {
    const summary = await this.summaryService.getSummary(userId, Date.now(), force);
    const client = this.convexService.getClient();
    const summaryData = summary.data;
    const analysisTasks = summaryData.tasksForAnalysis;
    if (!analysisTasks.length) {
      return { summary: summaryData, batchAnalysis: { workloadRisk: 'low', summary: 'No hay tareas pendientes.' }, analyzedTasks: 0, reusedTasks: 0, tasks: [] };
    }
    const analysisSummary = { ...summaryData, tasks: analysisTasks };
    const prompt = [
      'Cada tarea debe incluir exactamente taskId, importanceIA, complexityScore, estimatedMinutes, priorityIA, reasoning, suggestedAction, possibleDependencies, confidence, requiresMoreInformation y missingInformation.',
      'batchAnalysis debe incluir workloadRisk y summary como textos.',
      'Analiza las tareas usando exclusivamente el resumen determinista proporcionado.',
      'Devuelve únicamente JSON válido con batchAnalysis y tasks. No agregues markdown ni texto adicional.',
      'importanceIA debe ser un número decimal de 1 a 100. complexityScore debe estar entre 1.0 y 5.0.',
      'No cambies priority ni importance: son los valores calculados por el sistema. Devuelve solo priorityIA e importanceIA como tu evaluación independiente.',
      'No inventes datos; si falta información usa requiresMoreInformation y missingInformation.',
      `RESUMEN: ${JSON.stringify(analysisSummary)}`,
    ].join('\n');
    let parsed: ReturnType<typeof taskAnalysisBatchSchema.safeParse> | null = null;
    let lastError = 'Eve no devolvió una respuesta válida';
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const response = await this.sendToEve(
          attempt === 0 ? prompt : `${prompt}\nREINTENTO: responde solo JSON válido y compacto.`,
          `summary-analysis-${userId}-${Date.now()}-${attempt + 1}`,
        );
        parsed = taskAnalysisBatchSchema.safeParse(
          this.normalizeBatchResponse(this.parseJsonRobust(response)),
        );
        if (parsed.success) break;
        lastError = this.formatValidationError(parsed.error.issues[0]);
      } catch (error: any) {
        lastError = error.message;
      }
    }
    if (!parsed) throw new InternalServerErrorException(`Respuesta de Eve inválida: ${lastError}`);
    if (!parsed.success) throw new InternalServerErrorException(`Respuesta de Eve inválida: ${lastError}`);
    if (!parsed.success) {
      const detail = 'estructura no válida';
      throw new InternalServerErrorException(`Respuesta de Eve inválida: ${detail}`);
    }
    const validIds = new Set(analysisTasks.map((task: any) => task.taskId));
    const safeResults = parsed.data.tasks.filter((task) => validIds.has(task.taskId));
    await client.mutation(anyApi.tasks.saveBatchTaskAnalysis as any, {
      userId,
      model: process.env.EVE_MODEL ?? 'eve',
      analyses: safeResults,
    });
    return {
      summary: summaryData,
      batchAnalysis: parsed.data.batchAnalysis,
      analyzedTasks: safeResults.length,
      reusedTasks: analysisTasks.length - safeResults.length,
      tasks: safeResults,
    };
  }

  async analyzeTaskBatch(userId: string, force = false, now = Date.now()): Promise<{
    batchAnalysis: TaskAnalysisBatch['batchAnalysis'];
    analyzedTasks: number;
    reusedTasks: number;
    tasks: TaskAnalysisBatch['tasks'];
  }> {
    try {
      const client = this.convexService.getClient();
      const [tasks, profile] = await Promise.all([
        client.query(anyApi.tasks.getTasksForAnalysis as any, { userId, now, limit: 100, force }),
        client.query(anyApi.profiles.getProfile as any, { userId }),
      ]);

      const eligibleTasks = filterEligibleTasks(tasks, now);
      if (!eligibleTasks.length) {
        return { batchAnalysis: { workloadRisk: 'low', summary: 'No hay tareas pendientes.' }, analyzedTasks: 0, reusedTasks: 0, tasks: [] };
      }

      const profileContext = toProfileContext(profile as UserProfileLike | null);
      const prepared = preprocessTasks(eligibleTasks, {
        now,
        availableHoursPerDay: profile?.availableHoursPerDay,
        availableSchedule: profile?.availableSchedule,
        historicalMinutesByTaskType: profile?.averageMinutesByTaskType,
      });
      const prompt = this.buildBatchPrompt(prepared, profileContext);
      let parsed: ReturnType<typeof taskAnalysisBatchSchema.safeParse> | null = null;
      let lastError = 'Eve no devolvió una respuesta válida';
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const response = await this.sendToEve(
            attempt === 0
              ? prompt
              : `${prompt}\nREINTENTO: responde solo un objeto JSON válido, sin markdown, comas finales ni texto adicional.`,
            `batch-${userId}-${now}-${attempt + 1}`,
          );
          parsed = taskAnalysisBatchSchema.safeParse(
            this.normalizeBatchResponse(this.parseJsonRobust(response)),
          );
          if (parsed.success) break;
          lastError = this.formatValidationError(parsed.error.issues[0]);
        } catch (error: any) {
          lastError = error.message;
        }
      }

      if (!parsed) throw new Error(lastError);
      if (!parsed.success) {
        await client.mutation(anyApi.tasks.markAnalysisFailed as any, {
          userId,
          taskIds: eligibleTasks.map((task: { _id: string }) => task._id),
          error: 'La respuesta del agente no cumple el esquema esperado',
        });
        throw new Error(`Respuesta de Eve inválida: ${this.formatValidationError(parsed.error.issues[0])}`);
      }

      const validTaskIds = new Set(eligibleTasks.map((task: { _id: string }) => task._id));
      const safeResults = parsed.data.tasks.filter((result) => validTaskIds.has(result.taskId));
      await client.mutation(anyApi.tasks.saveBatchTaskAnalysis as any, {
        userId,
        model: process.env.EVE_MODEL ?? 'eve',
        analyses: safeResults,
      });

      return {
        batchAnalysis: parsed.data.batchAnalysis,
        analyzedTasks: safeResults.length,
        reusedTasks: eligibleTasks.length - safeResults.length,
        tasks: safeResults,
      };
    } catch (error: any) {
      if (error instanceof InternalServerErrorException) throw error;
      throw new InternalServerErrorException(`No se pudo analizar el lote: ${error.message}`);
    }
  }

  private buildBatchPrompt(tasks: PreprocessedTask[], profile: UserProfileLike | null): string {
    return [
      'Analiza este lote de tareas académicas usando el único agente y devuelve únicamente JSON válido.',
      'No inventes datos. Usa los cálculos deterministas recibidos. No escribas en la base de datos.',
      'importanceIA es un número decimal de 1 a 100. La complejidad es de 1.0 a 5.0.',
      'priority e importance pertenecen al sistema y son inmutables durante este análisis. Devuelve priorityIA e importanceIA como evaluación independiente de Eve.',
      'Prioridad debe considerar urgencia, importancia, complejidad, duración, disponibilidad, carga y dependencias.',
      'Si falta información relevante, reduce confidence, marca requiresMoreInformation=true y enumera missingInformation.',
      'La respuesta raíz debe ser un objeto JSON con batchAnalysis y tasks. batchAnalysis debe ser un objeto JSON con workloadRisk y summary como textos; nunca lo devuelvas como una cadena JSON. tasks debe ser un arreglo. possibleDependencies debe ser un arreglo de objetos {dependsOnTaskId, confidence}; no uses cadenas para las dependencias. Cada tarea debe incluir taskId, importanceIA, complexityScore, estimatedMinutes, priorityIA, reasoning breve, suggestedAction, possibleDependencies, confidence, requiresMoreInformation y missingInformation.',
      `PERFIL: ${JSON.stringify(profile)}`,
      'Si PERFIL es null, indica la falta de perfil en missingInformation y reduce confidence. Si es un objeto, usa todos sus campos disponibles; no inventes los faltantes.',
      `TAREAS PREPROCESADAS: ${JSON.stringify(tasks)}`,
    ].join('\n');
  }

  private async sendToEve(message: string, operationId: string): Promise<string> {
    const eveUrl = (process.env.EVE_AGENT_URL ?? 'http://127.0.0.1:2000').replace(/\/$/, '');
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (process.env.EVE_AGENT_TOKEN) headers.Authorization = `Bearer ${process.env.EVE_AGENT_TOKEN}`;
    const createResponse = await fetch(`${eveUrl}/eve/v1/session`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ message, operationId }),
      signal: AbortSignal.timeout(120000),
    });
    if (!createResponse.ok) throw new Error(`eve no disponible (${createResponse.status})`);
    const created = (await createResponse.json()) as { sessionId?: string };
    if (!created.sessionId) throw new Error('eve no devolvió un sessionId');
    const streamResponse = await fetch(`${eveUrl}/eve/v1/session/${created.sessionId}/stream`, {
      headers,
      signal: AbortSignal.timeout(120000),
    });
    if (!streamResponse.ok || !streamResponse.body) throw new Error(`No se pudo leer la respuesta de eve (${streamResponse.status})`);
    const reader = streamResponse.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let finalMessage = '';
    while (true) {
      const chunk = await reader.read();
      buffer += decoder.decode(chunk.value ?? new Uint8Array(), { stream: !chunk.done });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        if (!line.trim()) continue;
        const event = JSON.parse(line) as { type?: string; data?: { message?: string; finishReason?: string; error?: string } };
        if (event.type === 'message.completed' && event.data?.finishReason !== 'tool-calls') {
          finalMessage = event.data.message ?? finalMessage;
        }
        if (event.type === 'step.failed' || event.type === 'turn.failed' || event.type === 'session.failed') throw new Error(event.data?.message ?? event.data?.error ?? 'eve falló');
        if (event.type === 'turn.completed') return finalMessage;
      }
      if (chunk.done) break;
    }
    return finalMessage || buffer;
  }

  private parseJsonRobust(message: string): unknown {
    const source = message.trim();

    // Eve puede devolver el objeto como una cadena JSON serializada:
    // "{\"batchAnalysis\":...}". Deserializamos esa capa adicional.
    try {
      const direct: unknown = JSON.parse(source);
      if (typeof direct === 'string') return this.parseJsonRobust(direct);
      if (direct && typeof direct === 'object') return direct;
    } catch {
      // Continuamos con la extracción de objetos cuando hay texto adicional.
    }

    const withoutMarkdown = source
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();
    if (withoutMarkdown !== source) {
      try {
        const fenced: unknown = JSON.parse(withoutMarkdown);
        if (typeof fenced === 'string') return this.parseJsonRobust(fenced);
        if (fenced && typeof fenced === 'object') return fenced;
      } catch {
        // La extracción balanceada de abajo cubre texto antes/después del JSON.
      }
    }

    const candidates: string[] = [];
    let start = -1;
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let index = 0; index < message.length; index++) {
      const character = message[index];
      if (inString) {
        if (escaped) escaped = false;
        else if (character === '\\') escaped = true;
        else if (character === '"') inString = false;
        continue;
      }
      if (character === '"') inString = true;
      else if (character === '{') {
        if (depth === 0) start = index;
        depth++;
      } else if (character === '}' && depth > 0) {
        depth--;
        if (depth === 0 && start >= 0) candidates.push(message.slice(start, index + 1));
      }
    }
    for (const candidate of candidates) {
      try {
        const parsed: unknown = JSON.parse(candidate);
        if (typeof parsed === 'string') return this.parseJsonRobust(parsed);
        return parsed;
      } catch {
        // Prueba otro objeto balanceado si Eve incluyó texto adicional.
      }
    }
    throw new Error('Eve no devolvió JSON válido');
  }

  private normalizeBatchResponse(value: unknown): unknown {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return value;

    const response = value as Record<string, unknown>;
    const batchAnalysis = response.batchAnalysis;
    if (typeof batchAnalysis !== 'string') return value;

    try {
      const parsed = this.parseJsonRobust(batchAnalysis);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? { ...response, batchAnalysis: parsed }
        : value;
    } catch {
      return value;
    }
  }

  private formatValidationError(issue: { message?: string; path?: PropertyKey[] } | undefined): string {
    if (!issue) return 'estructura no válida';
    const path = issue.path?.length ? ` en ${issue.path.join('.')}` : '';
    return `${issue.message ?? 'estructura no válida'}${path}`;
  }

  private parseJson(message: string): unknown {
    const candidate = message.match(/\{[\s\S]*\}/)?.[0];
    if (!candidate) throw new Error('Eve no devolvió JSON');
    return JSON.parse(candidate);
  }
}
