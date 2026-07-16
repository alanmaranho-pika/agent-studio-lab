// Server function for the Product Ad app: scrape a product URL with
// Firecrawl, then use Gemini to extract product name, brief, suggested
// look, and pick the best product image. Downloads the chosen image into
// the project as a ProjectAsset so the panel can pre-fill every step.
//
// Core logic lives in product-scrape.server.ts so it can also be invoked
// by the agent's `scrape_product_url` chat tool.

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import type { ScrapedProductCore } from "@/lib/product-scrape.server";

const Input = z.object({
  projectId: z.string().min(1),
  url: z.string().trim().url().max(2000),
});

export type ScrapedProduct = ScrapedProductCore;

export const scrapeProductUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => Input.parse(data))
  .handler(async ({ data, context }): Promise<ScrapedProduct> => {
    const { scrapeProductCore } = await import("@/lib/product-scrape.server");
    return scrapeProductCore({
      url: data.url,
      projectId: data.projectId,
      userId: context.userId,
    });
  });
