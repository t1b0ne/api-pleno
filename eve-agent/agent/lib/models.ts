import { google } from "@ai-sdk/google";

export const MODELS = {
  primary: google("gemini-3.5-flash-lite"),
  fallback1: google("gemini-3.5-flash-lite"),
  fallback2: google("gemini-3.1-flash-lite"),
} as const;

const FALLBACK_MODELS = [
  MODELS.primary,
  MODELS.fallback1,
  MODELS.fallback2,
] as const;

// Se conserva durante la vida del proceso. Si un modelo agotó su cuota,
// no se vuelve a intentar en cada turno y se evita latencia innecesaria.
const unavailableModels = new Set<string>();

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
    details.code === "RESOURCE_EXHAUSTED" ||
    details.code === "UNAVAILABLE" ||
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

    if (unavailableModels.has(id)) continue;
    attemptedModel = true;

    try {
      return await (model as unknown as Record<ModelOperation, (input: unknown) => Promise<T>>)[
        operation
      ](options);
    } catch (error) {
      lastError = error;

      if (!isQuotaError(error)) throw error;

      unavailableModels.add(id);
      console.warn(`[Nova] ${id} agotó su cuota; pasando al siguiente modelo.`);
    }
  }

  if (!attemptedModel) {
    throw new Error("Todos los modelos configurados están sin cuota o disponibilidad.");
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
