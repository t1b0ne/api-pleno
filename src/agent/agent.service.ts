import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { anyApi } from 'convex/server';
import { ConvexService } from '../convex/convex.service';
import { analyzeTaskBySystem } from '../analysis/task-analysis.algorithms';
import { toProfileContext, UserProfileLike } from '../profile/profile-context';

type TaskAnalysis = {
  complexity: 'easy' | 'medium' | 'hard';
  priorityIA: 'low' | 'medium' | 'high';
  importanceIA?: number;
  recommendedStatus?: 'todo' | 'in_progress' | 'completed';
  estimatedMinutes?: number;
  confidence?: number;
  reasoning: string;
  [key: string]: unknown;
};

@Injectable()
export class AgentService {
  constructor(private readonly convexService: ConvexService) {}

  async getTask(taskId: string, userId: string) {
    try {
      const task = await this.convexService.getClient().query(
        anyApi.tasks.getTaskById as any,
        { taskId, userId },
      );

      if (!task) {
        throw new NotFoundException('La tarea no existe o no pertenece al usuario');
      }

      return { success: true, data: task };
    } catch (error: any) {
      if (error instanceof NotFoundException) throw error;
      throw new InternalServerErrorException(`Error al obtener la tarea: ${error.message}`);
    }
  }

  async analyzeTask(taskId: string, userId: string) {
    try {
      const profile = await this.convexService.getClient().query(
        anyApi.profiles.getProfile as any,
        { userId },
      );

      const task = await this.convexService.getClient().query(
        anyApi.tasks.getTaskById as any,
        { taskId, userId },
      );

      if (!task) {
        throw new NotFoundException('La tarea no existe o no pertenece al usuario');
      }

      const profileContext = toProfileContext(profile as UserProfileLike | null);
      const prompt = `Analiza la siguiente tarea académica usando la herramienta analyze_task y el skill task-analysis.
No guardes memoria ni modifiques Convex. Devuelve únicamente JSON válido con estas propiedades:
complexity, urgency, priorityIA, recommendedStatus, importanceIA, estimatedMinutes, confidence, reasoning y questions.
questions debe ser un arreglo de preguntas concretas para el usuario, por ejemplo cuánto sabe del tema, cuánto tiempo tiene y cuál es su objetivo.

TAREA:
${JSON.stringify(task)}

PERFIL DEL USUARIO:
${JSON.stringify(profileContext)}

ANÁLISIS DEL SISTEMA (NO MODIFICAR):
${JSON.stringify(analyzeTaskBySystem(task, Date.now()))}

No incluyas la propiedad questions ni hagas preguntas al usuario. Si falta informaciÃ³n, reduce confidence y explica la limitaciÃ³n en reasoning.


Evalúa complejidad, urgencia, priorityIA, estado recomendado e importanceIA.
Incluye preguntas concretas para conocer cuánto sabe el usuario del tema o qué información falta.
No marques completed salvo que el usuario lo haya confirmado.
No incluyas la propiedad questions ni hagas preguntas al usuario. Si falta informaciÃƒÂ³n, reduce confidence y explica la limitaciÃƒÂ³n en reasoning.`;

      const eveResponse = await this.sendToEve(prompt, taskId);
      const analysis = this.parseEveAnalysis(eveResponse);

      if (this.isTaskAnalysis(analysis)) {
        await this.convexService.getClient().mutation(
          anyApi.tasks.saveTaskAnalysis as any,
          {
            taskId,
            userId,
            complexity: analysis.complexity,
            recommendedPriority: analysis.priorityIA,
            priorityIA: analysis.priorityIA,
            importanceIA: analysis.importanceIA,
            reasoning: analysis.reasoning,
            ...(analysis.estimatedMinutes !== undefined && {
              estimatedMinutes: analysis.estimatedMinutes,
            }),
            ...(analysis.recommendedStatus !== undefined && {
              recommendedStatus: analysis.recommendedStatus,
            }),
            ...(analysis.confidence !== undefined && {
              confidence: analysis.confidence,
            }),
          },
        );
      }

      return {
        success: true,
        applied: false,
        data: {
          task,
          profile,
          analysis,
          eveResponse,
        },
      };
    } catch (error: any) {
      if (error instanceof NotFoundException) throw error;
      throw new BadRequestException(`No se pudo analizar la tarea: ${error.message}`);
    }
  }

  private async sendToEve(message: string, taskId: string): Promise<string> {
    const eveUrl = (process.env.EVE_AGENT_URL ?? 'http://127.0.0.1:2000').replace(/\/$/, '');
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (process.env.EVE_AGENT_TOKEN) {
      headers.Authorization = `Bearer ${process.env.EVE_AGENT_TOKEN}`;
    }

    const createResponse = await fetch(`${eveUrl}/eve/v1/session`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ message, operationId: `task-analysis-${taskId}-${Date.now()}` }),
    });

    if (!createResponse.ok) {
      throw new Error(`eve no disponible (${createResponse.status}): ${await createResponse.text()}`);
    }

    const created = (await createResponse.json()) as { sessionId?: string };
    if (!created.sessionId) throw new Error('eve no devolvió un sessionId');

    const streamResponse = await fetch(`${eveUrl}/eve/v1/session/${created.sessionId}/stream`, {
      headers,
    });

    if (!streamResponse.ok || !streamResponse.body) {
      throw new Error(`No se pudo leer la respuesta de eve (${streamResponse.status})`);
    }

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
        const event = JSON.parse(line) as {
          type?: string;
          data?: {
            message?: string;
            finishReason?: string;
            code?: string;
            error?: string;
            details?: unknown;
          };
        };

        if (event.type === 'message.completed' && event.data?.finishReason !== 'tool-calls') {
          finalMessage = event.data.message ?? finalMessage;
        }

        if (
          event.type === 'step.failed' ||
          event.type === 'turn.failed' ||
          event.type === 'session.failed'
        ) {
          const details = event.data?.details
            ? ` - ${JSON.stringify(event.data.details)}`
            : '';
          throw new Error(
            `${event.data?.message ?? event.data?.error ?? event.data?.code ?? 'eve falló al analizar la tarea'}${details}`,
          );
        }

        if (event.type === 'turn.completed') {
          return finalMessage;
        }
      }

      if (chunk.done) break;
    }

    return finalMessage || buffer || 'eve terminó sin devolver un análisis';
  }

  private parseEveAnalysis(message: string): unknown {
    const jsonCandidate = message.match(/\{[\s\S]*\}/)?.[0];
    if (!jsonCandidate) return { raw: message };

    try {
      return JSON.parse(jsonCandidate);
    } catch {
      return { raw: message };
    }
  }

  private isTaskAnalysis(value: unknown): value is TaskAnalysis {
    if (!value || typeof value !== 'object') return false;

    const analysis = value as Record<string, unknown>;
    const validComplexity = ['easy', 'medium', 'hard'].includes(
      analysis.complexity as string,
    );
    const validPriority = ['low', 'medium', 'high'].includes(
      analysis.priorityIA as string,
    );
    const validStatus =
      analysis.recommendedStatus === undefined ||
      ['todo', 'in_progress', 'completed'].includes(analysis.recommendedStatus as string);

    return (
      validComplexity &&
      validPriority &&
      validStatus &&
      typeof analysis.reasoning === 'string'
    );
  }

  async applyAnalysis(
    taskId: string,
    userId: string,
    confirmed: boolean,
    priority: 'low' | 'medium' | 'high',
    status: 'todo' | 'in_progress' | 'completed',
    importanceScore: number,
  ) {
    try {
      const task = await this.convexService.getClient().mutation(
        anyApi.tasks.applyTaskDecision as any,
        { taskId, userId, confirmed, priority, status, importanceScore },
      );

      return { success: true, applied: true, data: task };
    } catch (error: any) {
      if (error.message?.includes('no encontrada')) {
        throw new NotFoundException('La tarea no existe o no pertenece al usuario');
      }
      throw new BadRequestException(`No se pudo aplicar el análisis: ${error.message}`);
    }
  }
}
