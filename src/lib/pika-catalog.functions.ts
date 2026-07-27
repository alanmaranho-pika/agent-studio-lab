import { createServerFn } from "@tanstack/react-start";

const PIKA_API_BASE_URL = "https://api.dev.pika.art";
const CACHE_TTL_MS = 5 * 60_000;

type RawPikaCatalogItem = {
  api_id?: string;
  vendor?: string;
  function?: string | null;
  category?: string;
  name?: string;
  description?: string;
  display_pricing?: {
    unit?: {
      type?: string;
      quantity?: number;
    };
    default_quote?: {
      sell_usd?: string;
    };
  };
  call?: {
    method?: string;
    path?: string;
  };
};

export type PikaApiCatalogItem = {
  apiId: string;
  vendor: string;
  function: string | null;
  category: "video" | "image" | "audio" | "llm";
  name: string;
  description: string;
  method: string;
  path: string;
  priceUsd: string | null;
  priceUnit: string | null;
};

let cachedCatalog:
  | {
      expiresAt: number;
      apis: PikaApiCatalogItem[];
    }
  | undefined;

function isCatalogCategory(value: string): value is PikaApiCatalogItem["category"] {
  return value === "video" || value === "image" || value === "audio" || value === "llm";
}

function normalizeCatalogItem(item: RawPikaCatalogItem): PikaApiCatalogItem | null {
  const apiId = item.api_id?.trim();
  const category = item.category?.trim().toLowerCase();
  if (!apiId || !category || !isCatalogCategory(category)) return null;

  const vendor = item.vendor?.trim() || apiId.split("/")[0] || "unknown";
  const apiFunction = item.function?.trim() || null;

  return {
    apiId,
    vendor,
    function: apiFunction,
    category,
    name: item.name?.trim() || apiId,
    description:
      item.description?.trim() ||
      (apiFunction ? `${apiFunction.replaceAll("-", " ")} through the Pika API.` : "LLM through the Pika API."),
    method: item.call?.method?.trim().toUpperCase() || "POST",
    path: item.call?.path?.trim() || `/v1/media/${apiId}`,
    priceUsd: item.display_pricing?.default_quote?.sell_usd ?? null,
    priceUnit: item.display_pricing?.unit?.type ?? null,
  };
}

export const listPikaApis = createServerFn({ method: "GET" }).handler(
  async (): Promise<{ apis: PikaApiCatalogItem[]; total: number }> => {
    if (cachedCatalog && cachedCatalog.expiresAt > Date.now()) {
      return { apis: cachedCatalog.apis, total: cachedCatalog.apis.length };
    }

    const response = await fetch(`${PIKA_API_BASE_URL}/catalog/apis`, {
      headers: { Accept: "application/json" },
    });
    if (!response.ok) {
      throw new Error(`Could not load the Pika API catalog (${response.status}).`);
    }

    const payload = (await response.json()) as { apis?: RawPikaCatalogItem[] };
    const apis = (payload.apis ?? [])
      .map(normalizeCatalogItem)
      .filter((item): item is PikaApiCatalogItem => item !== null)
      .sort((a, b) => {
        const categoryOrder = { video: 0, image: 1, audio: 2, llm: 3 };
        return (
          categoryOrder[a.category] - categoryOrder[b.category] ||
          a.vendor.localeCompare(b.vendor) ||
          a.name.localeCompare(b.name)
        );
      });

    cachedCatalog = {
      expiresAt: Date.now() + CACHE_TTL_MS,
      apis,
    };

    return { apis, total: apis.length };
  },
);
