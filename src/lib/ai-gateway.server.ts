import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

const DEFAULT_PIKA_API_BASE_URL = "https://api.dev.pika.art";

export const createLovableAiGatewayProvider = (lovableApiKey: string) =>
  createOpenAICompatible({
    name: "lovable",
    baseURL: "https://ai.gateway.lovable.dev/v1",
    headers: {
      "Lovable-API-Key": lovableApiKey,
      "X-Lovable-AIG-SDK": "vercel-ai-sdk",
    },
  });

export function requirePikaApiKey(): string {
  const key = process.env.PIKA_API_KEY?.trim();
  if (!key) throw new Error("Missing PIKA_API_KEY");
  return key;
}

export function pikaApiBaseUrl(): string {
  return (process.env.PIKA_API_BASE_URL?.trim() || DEFAULT_PIKA_API_BASE_URL).replace(
    /\/+$/,
    "",
  );
}

export const createPikaAiProvider = (pikaApiKey = requirePikaApiKey()) =>
  createOpenAICompatible({
    name: "pika",
    baseURL: `${pikaApiBaseUrl()}/v1`,
    apiKey: pikaApiKey,
    headers: {
      "X-API-Key": pikaApiKey,
    },
  });
