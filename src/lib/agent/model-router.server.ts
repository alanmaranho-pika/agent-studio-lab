import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { wrapLanguageModel, type LanguageModelMiddleware } from "ai";
import { createPikaAiProvider, pikaApiBaseUrl, requirePikaApiKey } from "@/lib/ai-gateway.server";
import { AGENT_MODEL_IDS, type AgentModelId, type AgentModelRoute } from "./model-router";

function createPikaGeminiProvider(pikaApiKey: string) {
  return createGoogleGenerativeAI({
    name: "pika-gemini",
    baseURL: `${pikaApiBaseUrl()}/genai/v1beta`,
    // The Google adapter requires an apiKey and sends x-goog-api-key. Pika
    // authenticates the same request with X-API-Key.
    apiKey: pikaApiKey,
    headers: {
      "X-API-Key": pikaApiKey,
    },
  });
}

function createPikaAgentModel(modelId: AgentModelId, pikaApiKey: string) {
  if (modelId === AGENT_MODEL_IDS.multimodal) {
    return createPikaGeminiProvider(pikaApiKey)("gemini-3.1-pro");
  }
  return createPikaAiProvider(pikaApiKey)(modelId);
}

function fallbackMiddleware(
  primaryId: AgentModelId,
  fallbackId: AgentModelId,
  fallbackModel: ReturnType<typeof createPikaAgentModel>,
): LanguageModelMiddleware {
  const warn = (operation: "generate" | "stream", error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(
      `[agent-router] ${operation} startup failed for ${primaryId}; falling back to ${fallbackId}: ${message}`,
    );
  };

  return {
    specificationVersion: "v3",
    wrapGenerate: async ({ doGenerate, params }) => {
      try {
        return await doGenerate();
      } catch (error) {
        warn("generate", error);
        return fallbackModel.doGenerate(params);
      }
    },
    wrapStream: async ({ doStream, params }) => {
      try {
        return await doStream();
      } catch (error) {
        warn("stream", error);
        return fallbackModel.doStream(params);
      }
    },
  };
}

/**
 * Build the selected model with an initial-request fallback chain. A provider
 * error before streaming begins can fall through to the next model without
 * forcing the user to retry. Mid-stream failures are intentionally not replayed
 * because that could duplicate tool calls or visible UI.
 */
export function createRoutedAgentModel(
  decision: AgentModelRoute,
  pikaApiKey = requirePikaApiKey(),
) {
  const chain = [decision.modelId, ...decision.fallbackModelIds];
  let model = createPikaAgentModel(chain[chain.length - 1], pikaApiKey);

  for (let index = chain.length - 2; index >= 0; index -= 1) {
    const primaryId = chain[index];
    const fallbackId = chain[index + 1];
    const primary = createPikaAgentModel(primaryId, pikaApiKey);
    model = wrapLanguageModel({
      model: primary,
      modelId: primary.modelId,
      providerId: primary.provider,
      middleware: fallbackMiddleware(primaryId, fallbackId, model),
    });
  }

  return model;
}
