import { google } from "@ai-sdk/google";

export const MODELS = {
  primary: google("gemini-3.5-flash-lite"),
  fallback: google("gemini-3.1-flash-lite"),
} as const;

const FALLBACK_MODELS = [MODELS.primary, MODELS.fallback] as const;
const MODEL_COOLDOWN_MS = 60_000;

const unavailableModels = new Map<string, number>();

function modelId(model: { modelId?: string }, index: number): string {
  return model.modelId ?? `model-${index}`;
}

function errorDetails(error: unknown) {
  if (!error || typeof error !== "object") return {};

  const value = error as Record<string, unknown>;
  const response = value.response as Record<string, unknown> | undefined;

  return {
    code: value.code,
    status: value.status ?? value.statusCode ?? response?.status,
    body: value.responseBody ?? response?.body,
    message: value.message,
  };
}

function isQuotaError(error: unknown): boolean {
  const details = errorDetails(error);
  const code = String(details.code ?? "").toUpperCase();
  const text = JSON.stringify({
    ...details,
    cause: error instanceof Error ? error.cause : undefined,
    error,
  }).toLowerCase();
  const status = Number(details.status);

  return (
    status === 429 ||
    status === 500 ||
    status === 502 ||
    status === 503 ||
    status === 504 ||
    code === "RESOURCE_EXHAUSTED" ||
    code === "UNAVAILABLE" ||
    text.includes("resource_exhausted") ||
    text.includes("quotaexceeded") ||
    text.includes("ratelimitexceeded") ||
    text.includes("rate limit") ||
    text.includes("too many requests") ||
    text.includes("high demand") ||
    text.includes("temporarily unavailable") ||
    text.includes("service unavailable")
  );
}

function errorSummary(error: unknown): string {
  const details = errorDetails(error);
  return JSON.stringify({
    code: details.code,
    status: details.status,
    body: details.body,
    message: details.message,
  });
}

type ModelOperation = "doGenerate" | "doStream";

async function callWithFallback<T>(
  operation: ModelOperation,
  options: unknown,
): Promise<T> {
  let lastError: unknown;
  let attemptedModel = false;

  for (let index = 0; index < FALLBACK_MODELS.length; index += 1) {
    const model = FALLBACK_MODELS[index];
    const id = modelId(model, index);
    const unavailableUntil = unavailableModels.get(id) ?? 0;

    if (Date.now() < unavailableUntil) continue;
    unavailableModels.delete(id);
    attemptedModel = true;

    try {
      return await (model as unknown as Record<ModelOperation, (input: unknown) => Promise<T>>)[
        operation
      ](options);
    } catch (error) {
      lastError = error;
      console.warn(`[Nova] Falló ${id}: ${errorSummary(error)}`);

      if (!isQuotaError(error)) throw error;

      unavailableModels.set(id, Date.now() + MODEL_COOLDOWN_MS);
      console.warn(`[Nova] ${id} estará en cooldown durante 60 segundos.`);
    }
  }

  if (!attemptedModel) {
    throw new Error(
      "Los modelos están temporalmente en cooldown. Intenta nuevamente en unos segundos.",
    );
  }

  throw lastError ?? new Error("No fue posible ejecutar ningún modelo.");
}

export const novaModel = new Proxy(MODELS.primary, {
  get(target, property, receiver) {
    if (property === "doGenerate") {
      return (options: unknown) => callWithFallback("doGenerate", options);
    }

    if (property === "doStream") {
      return (options: unknown) => callWithFallback("doStream", options);
    }

    return Reflect.get(target, property, receiver);
  },
});
