import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { anyApi } from 'convex/server';
import { ConvexService } from '../convex/convex.service';
import { AnalyzeTaskDto } from './dto/analyze-task.dto';

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

  async analyzeTask(taskId: string, userId: string, dto: AnalyzeTaskDto) {
    try {
      const task = await this.convexService.getClient().query(
        anyApi.tasks.getTaskById as any,
        { taskId, userId },
      );

      if (!task) {
        throw new NotFoundException('La tarea no existe o no pertenece al usuario');
      }

      const prompt = `Analiza la siguiente tarea académica usando la herramienta analyze_task y el skill task-analysis.
No guardes memoria ni modifiques Convex. Devuelve únicamente JSON válido con estas propiedades:
complexity, urgency, recommendedPriority, recommendedStatus, importanceScore, estimatedMinutes, confidence, reasoning y questions.
questions debe ser un arreglo de preguntas concretas para el usuario, por ejemplo cuánto sabe del tema, cuánto tiempo tiene y cuál es su objetivo.

TAREA:
${JSON.stringify(task)}

RESPUESTAS DEL USUARIO:
${JSON.stringify(dto.answers ?? {})}

Evalúa complejidad, urgencia, prioridad recomendada, estado recomendado e importanceScore.
Incluye preguntas concretas para conocer cuánto sabe el usuario del tema o qué información falta.
No marques completed salvo que el usuario lo haya confirmado.`;

      const eveResponse = await this.sendToEve(prompt, taskId);
      return {
        success: true,
        applied: false,
        data: {
          task,
          analysis: this.parseEveAnalysis(eveResponse),
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
