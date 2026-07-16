// Core product-URL scraping logic, callable from anywhere on the server.
// Shared by the Product Ad app's createServerFn wrapper and the agent's
// `scrape_product_url` chat tool.

import { generateText } from "ai";
import { z } from "zod";
import { createLovableAiGatewayProvider } from "@/lib/ai-gateway.server";
import { downloadAndStoreUrl } from "@/lib/project-assets.server";
import type { ProjectAsset } from "@/lib/project-state";

const LOOKS = [
  "Cinematic",
  "Clean studio",
  "Lifestyle",
  "Editorial",
  "Neon / nightlife",
  "Outdoor / golden hour",
] as const;

export type ScrapedProductCore = {
  productName: string;
  brief: string;
  look: (typeof LOOKS)[number];
  image: ProjectAsset | null;
  imageCandidates: string[];
  sourceUrl: string;
  imageError?: string;
};

const Extracted = z.object({
  productName: z.string().min(1).max(120),
  brief: z.string().min(1).max(600),
  look: z.enum(LOOKS),
  bestImageUrl: z.string().url().optional().nullable(),
});

function absolutize(base: string, candidate: string): string | null {
  try {
    return new URL(candidate, base).toString();
  } catch {
    return null;
  }
}

export async function scrapeProductCore(args: {
  url: string;
  projectId: string;
  userId: string;
}): Promise<ScrapedProductCore> {
  const fcKey = process.env.FIRECRAWL_API_KEY;
  if (!fcKey) throw new Error("Missing FIRECRAWL_API_KEY");
  const aiKey = process.env.LOVABLE_API_KEY;
  if (!aiKey) throw new Error("Missing LOVABLE_API_KEY");

  const scrape = (withBranding: boolean) =>
    fetch("https://api.firecrawl.dev/v2/scrape", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${fcKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        url: args.url,
        formats: withBranding
          ? ["markdown", "links", "branding"]
          : ["markdown", "links"],
        onlyMainContent: true,
      }),
    });
  let fcRes = await scrape(true);
  if (!fcRes.ok) {
    const txt = await fcRes.text().catch(() => "");
    const retryable =
      /SCRAPE_ACTION_ERROR|Javascript execution failed|SCRAPE_ALL_ENGINES_FAILED/i.test(
        txt,
      );
    if (retryable) fcRes = await scrape(false);
    if (!fcRes.ok) {
      const txt2 = await fcRes.text().catch(() => txt);
      if (/SCRAPE_ALL_ENGINES_FAILED/i.test(txt2)) {
        throw new Error(
          "This site blocks automated scraping. Try a different product URL, or fill in the product details manually.",
        );
      }
      throw new Error(`Firecrawl ${fcRes.status}: ${txt2.slice(0, 200)}`);
    }
  }
  const fcJson = (await fcRes.json()) as {
    data?: {
      markdown?: string;
      links?: string[];
      branding?: { images?: { logo?: string; ogImage?: string; favicon?: string } };
      metadata?: { title?: string; description?: string; ogImage?: string };
    };
  };
  const payload = fcJson.data ?? {};
  const markdown = (payload.markdown ?? "").slice(0, 12000);

  const imgRe = /!\[[^\]]*\]\(([^)\s]+)/g;
  const imgs = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = imgRe.exec(markdown)) !== null) {
    const abs = absolutize(args.url, m[1]);
    if (abs) imgs.add(abs);
  }
  for (const l of payload.links ?? []) {
    if (/\.(png|jpe?g|webp|avif)(\?|$)/i.test(l)) {
      const abs = absolutize(args.url, l);
      if (abs) imgs.add(abs);
    }
  }
  const og = payload.metadata?.ogImage ?? payload.branding?.images?.ogImage;
  if (og) {
    const abs = absolutize(args.url, og);
    if (abs) imgs.add(abs);
  }
  const candidates = Array.from(imgs).filter(
    (u) =>
      !/sprite|icon|logo|favicon|tracking|pixel|placeholder/i.test(u) &&
      !u.endsWith(".svg"),
  );

  const gateway = createLovableAiGatewayProvider(aiKey);
  const system =
    "You are extracting product info from a scraped product page for an ad-creative tool. " +
    "Return ONLY valid JSON with keys: productName, brief (1-3 sentences), " +
    `look (one of: ${LOOKS.join(", ")}), bestImageUrl (best hero product photo URL or null). ` +
    "No markdown, no code fences.";
  const userPrompt =
    `URL: ${args.url}\nTitle: ${payload.metadata?.title ?? ""}\n` +
    `Description: ${payload.metadata?.description ?? ""}\n\n` +
    `Image candidates:\n${candidates.slice(0, 20).join("\n") || "(none)"}\n\n` +
    `Page content:\n${markdown}`;

  let extracted: z.infer<typeof Extracted>;
  try {
    const { text } = await generateText({
      model: gateway("google/gemini-3-flash-preview"),
      system,
      prompt: userPrompt,
    });
    const cleaned = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    const jsonStr = start >= 0 && end > start ? cleaned.slice(start, end + 1) : cleaned;
    extracted = Extracted.parse(JSON.parse(jsonStr));
  } catch (err) {
    console.error("[product-scrape] extract failed", err);
    extracted = {
      productName: payload.metadata?.title?.slice(0, 120) ?? "Product",
      brief:
        payload.metadata?.description?.slice(0, 600) ??
        "An ad for this product. Edit to add audience, vibe, and key message.",
      look: "Cinematic",
      bestImageUrl: candidates[0] ?? null,
    };
  }

  let image: ProjectAsset | null = null;
  let imageError: string | undefined;
  const ordered = Array.from(
    new Set([extracted.bestImageUrl, ...candidates].filter((u): u is string => !!u)),
  ).slice(0, 6);
  for (const src of ordered) {
    try {
      const stored = await downloadAndStoreUrl({
        projectId: args.projectId,
        userId: args.userId,
        sourceUrl: src,
        kind: "reference",
        label: extracted.productName,
      });
      image = {
        id: stored.id,
        kind: "reference",
        mime: stored.mime,
        name: extracted.productName,
        url: stored.url,
      };
      imageError = undefined;
      break;
    } catch (err) {
      imageError = err instanceof Error ? err.message : String(err);
      console.warn("[product-scrape] image download failed", src, imageError);
    }
  }

  return {
    productName: extracted.productName,
    brief: extracted.brief,
    look: extracted.look,
    image,
    imageCandidates: candidates.slice(0, 12),
    sourceUrl: args.url,
    imageError: image ? undefined : imageError,
  };
}
