// Time Tourist — prompt-assembly helpers + single server-side pipeline
// (`produceTimeTouristVideo`) that mirrors the World Cup 2026 backend shape:
//   Phase 1: GPT Image 2 /edit  (selfie + destination → 9:16 opening frame)
//   Phase 2: Seedance 2.0 reference-to-video (Phase 1 image → vlog clip)
// Both fal calls run server-side in one server function so the client makes
// one request, tracks a single `render_jobs` row, and gets both assets back.

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export type TimeTouristDestinationId =
  | "ancient_rome"
  | "viking_village"
  | "shanghai_1920s"
  | "edo_japan"
  | "wild_west"
  | "victorian_london";

export type TimeTouristDestination = {
  id: TimeTouristDestinationId;
  label: string;
  /** Injected into the [HISTORICAL SETTING] slot of Phase 1's prompt. */
  setting: string;
  /** Injected into the [PERIOD-ACCURATE ENVIRONMENT] slot of Phase 1's prompt. */
  environment: string;
  /** Full 4-shot arc used verbatim in Phase 2's prompt body. */
  shots: [string, string, string, string];
};

export const TIME_TOURIST_DESTINATIONS: ReadonlyArray<TimeTouristDestination> = [
  {
    id: "ancient_rome",
    label: "Ancient Rome",
    setting: "Ancient Rome, at the edge of the Forum",
    environment:
      "toga-clad citizens haggling at market stalls, marble columns, banners, an ox-cart rolling past, dust in the golden sunlight, the Colosseum looming in the distance",
    shots: [
      'Selfie walking into the Forum, wide-eyed. "I don\'t think we\'re supposed to be here."',
      'Pan right past the market, points off-camera. "Look at the size of that thing."',
      'Dodges an ox-cart, stumbles. "I almost got run over by an ox!"',
      "Zoom out toward the Colosseum, golden hour, awe.",
    ],
  },
  {
    id: "viking_village",
    label: "Viking Village",
    setting: "a Viking coastal village on a grey morning",
    environment:
      "longhouses with turf roofs, smoke rising from firepits, bearded warriors sharpening axes, a longship being dragged onto pebble beach, sea spray, ravens overhead",
    shots: [
      'Selfie between two longhouses, breath fogging. "I think I just time-traveled into a Viking raid."',
      'Pan to warriors loading a longship. "They are actually going raiding right now."',
      'A raven divebombs the phone, ducks and laughs. "That bird just tried to end me."',
      "Wide shot: longship pushing out to sea, waves crashing, low sun.",
    ],
  },
  {
    id: "shanghai_1920s",
    label: "1920s Shanghai",
    setting: "1920s Shanghai on the Bund at night",
    environment:
      "neon signs in Chinese and English, rickshaws, art-deco facades, jazz spilling from a nightclub doorway, flappers and men in tailored suits, cigarette smoke, rain on cobblestones",
    shots: [
      'Selfie under a neon sign, rain hitting the phone. "Shanghai, 1927. Somehow."',
      "Pan across the Bund, jazz swells, points at a nightclub. \"That's where we're going.\"",
      'A rickshaw nearly clips them, spins around. "He did NOT see me."',
      "Push in through the club doorway, warm light, a saxophone hitting a high note.",
    ],
  },
  {
    id: "edo_japan",
    label: "Edo Japan",
    setting: "an Edo-period Japanese town at dusk",
    environment:
      "wooden shopfronts with paper lanterns, samurai walking past with two swords, merchants folding cloth, a tea master pouring in an open doorway, cherry blossoms drifting, distant taiko drums",
    shots: [
      'Selfie in a lantern-lit alley, whispering. "I\'m in Edo. Like, actual Edo."',
      'Pan as two samurai walk past, bows to them. "Nope nope nope, be cool."',
      "A cat streaks across a rooftop, laughs. \"Even the cats look samurai here.\"",
      "Wide push in on a tea master serving tea, steam rising, dusk light.",
    ],
  },
  {
    id: "wild_west",
    label: "Wild West",
    setting: "a dusty Wild West frontier town at high noon",
    environment:
      "false-front saloons, hitching posts with horses, cowboys leaning on porches, a tumbleweed rolling through, cracked earth, blazing sun, distant piano from the saloon",
    shots: [
      'Selfie squinting down main street, dust in the air. "I think a shootout is about to happen."',
      'Pan to two men squaring off outside the saloon. "Yeah. Yeah, that\'s a shootout."',
      'Ducks behind a barrel, whispers. "I did not sign up for this vacation package."',
      "Wide shot: swinging saloon doors, piano cuts out, tumbleweed rolls past.",
    ],
  },
  {
    id: "victorian_london",
    label: "Victorian London",
    setting: "foggy Victorian London on a gaslit street",
    environment:
      "gas lamps glowing in thick fog, horse-drawn hansom cabs clopping past, top hats and long coats, newsboys shouting headlines, cobblestones slick with rain, the silhouette of Big Ben",
    shots: [
      'Selfie under a gas lamp, fog swirling. "This is 100% Victorian London and I am scared."',
      "Pan to a hansom cab clattering past, dodges. \"That horse is booking it.\"",
      'A newsboy shouts a headline, buys a paper, reads it. "There\'s been a murder. Oh no."',
      "Wide shot: Big Ben rising out of the fog, church bells tolling.",
    ],
  },
];

export type TimeTouristTone = "funny" | "cinematic" | "adventure";

export const TIME_TOURIST_TONES: ReadonlyArray<{
  id: TimeTouristTone;
  label: string;
  frameEmotion: string;
  motionModifier: string;
}> = [
  {
    id: "funny",
    label: "Funny",
    frameEmotion: "amused, wide-eyed",
    motionModifier: "Comedic timing on every reaction. Play the absurdity of the situation for laughs.",
  },
  {
    id: "cinematic",
    label: "Cinematic",
    frameEmotion: "awestruck, quiet",
    motionModifier: "Golden-hour cinematic grade. Slower reactions. Let the moment breathe.",
  },
  {
    id: "adventure",
    label: "Adventure",
    frameEmotion: "excited, alert",
    motionModifier: "Fast-paced, high-energy vlog. Quick reactions and physical motion.",
  },
];

export type TimeTouristDuration = "5" | "6" | "7" | "8" | "9" | "10" | "11" | "12" | "13" | "14" | "15";

export type CustomDestination = {
  label: string;
  setting: string;
  environment: string;
};

function resolveDestination(
  destination: TimeTouristDestinationId | "custom",
  custom?: CustomDestination | null,
): { label: string; setting: string; environment: string; shots: [string, string, string, string] } {
  if (destination === "custom" && custom) {
    return {
      label: custom.label || "Custom destination",
      setting: custom.setting,
      environment: custom.environment,
      shots: [
        `Selfie stepping into the scene, reacting. "I can't believe I'm actually here."`,
        `Pan across the environment, points off-camera. "Look at that."`,
        `Something in the scene surprises them, laughs or ducks. "Did you see that?!"`,
        `Wide push in on the most iconic element of the setting, awe.`,
      ],
    };
  }
  const dest =
    TIME_TOURIST_DESTINATIONS.find((d) => d.id === destination) ??
    TIME_TOURIST_DESTINATIONS[0];
  return { label: dest.label, setting: dest.setting, environment: dest.environment, shots: dest.shots };
}

/** Phase 1 opening-frame prompt for openai/gpt-image-2/edit at 9:16. */
export function buildTimeTouristImagePrompt(args: {
  destination: TimeTouristDestinationId | "custom";
  tone: TimeTouristTone;
  custom?: CustomDestination | null;
}): string {
  const dest = resolveDestination(args.destination, args.custom);
  const where = [dest.setting, dest.environment].filter((s) => s && s.trim().length > 0).join(", ");
  return `A screenshot of a vlog featuring the person in the attached reference image. POV Selfie camera shot on iphone. They are in ${where}.`;

}

/** Phase 2 Seedance 2.0 motion prompt using the Phase 1 image as reference. */
export function buildTimeTouristVideoPrompt(args: {
  destination: TimeTouristDestinationId | "custom";
  tone: TimeTouristTone;
  duration: TimeTouristDuration;
  custom?: CustomDestination | null;
}): string {
  const dest = resolveDestination(args.destination, args.custom);
  const tone =
    TIME_TOURIST_TONES.find((t) => t.id === args.tone) ?? TIME_TOURIST_TONES[0];

  // Beat count and per-shot budget scale from the 4-shot template (15s) so
  // shorter durations still feel arced.
  const secs = Number(args.duration);
  const beat = Math.max(1, Math.round(secs / 4));
  const shotHeader = [
    `SHOT 1 (0–${beat}s) — ${dest.shots[0]}`,
    `SHOT 2 (${beat}–${beat * 2}s) — ${dest.shots[1]}`,
    `SHOT 3 (${beat * 2}–${beat * 3}s) — ${dest.shots[2]}`,
    `SHOT 4 (${beat * 3}–${secs}s) — ${dest.shots[3]}`,
  ].join("\n");

  return [
    `9:16 vertical. ${secs}s. Handheld front-facing selfie POV.`,
    `Modern time traveler in ${dest.setting}. Natural handheld shake. Photo-realistic.`,
    "Hardlock: preserve the exact face, hair, and likeness from the reference image; do not alter facial structure.",
    tone.motionModifier,
    "",
    shotHeader,
    "",
    "Motion everywhere: crowds, animals, vehicles, weather. Never static. One short sentence of dialogue per shot — reactions, not facts. Camera stays front-facing selfie POV throughout — never tripod, never drone.",
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Server pipeline — mirrors `produceWorldCup2026Video` in shape.
// ---------------------------------------------------------------------------

const Input = z.object({
  projectId: z.string().uuid(),
  refImageUrl: z.string().url(),
  destination: z.union([
    z.enum([
      "ancient_rome",
      "viking_village",
      "shanghai_1920s",
      "edo_japan",
      "wild_west",
      "victorian_london",
    ]),
    z.literal("custom"),
  ]),
  tone: z.enum(["funny", "cinematic", "adventure"]).default("funny"),
  duration: z
    .enum(["5", "6", "7", "8", "9", "10", "11", "12", "13", "14", "15"])
    .default("15"),
  custom: z
    .object({
      label: z.string().min(1).max(80),
      setting: z.string().min(1).max(400),
      environment: z.string().max(1200),
    })
    .nullable()
    .optional(),
});

export type TimeTouristSuccess = {
  ok: true;
  image: { assetId: string; assetUrl: string; mime: string };
  video: { assetId: string; assetUrl: string; mime: string };
  imagePrompt: string;
  videoPrompt: string;
};

export type TimeTouristFailure = {
  ok: false;
  stage: "image" | "video" | "store" | "unknown";
  message: string;
};

export type TimeTouristResult = TimeTouristSuccess | TimeTouristFailure;

export const produceTimeTouristVideo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => Input.parse(d))
  .handler(async ({ data, context }): Promise<TimeTouristResult> => {
    const { falRun, falPickImageUrl, falPickVideoUrl } = await import(
      "@/lib/fal.server"
    );
    const { downloadAndStoreUrl } = await import("@/lib/project-assets.server");

    const destLabel =
      data.destination === "custom"
        ? data.custom?.label ?? "Custom destination"
        : TIME_TOURIST_DESTINATIONS.find((d) => d.id === data.destination)
            ?.label ?? data.destination;

    // Track in render_jobs like other multi-step renders.
    const { data: jobRow } = await context.supabase
      .from("render_jobs")
      .insert({
        project_id: data.projectId,
        status: "running",
        started_at: new Date().toISOString(),
      })
      .select("id")
      .single();
    const renderJobId = (jobRow?.id as string | undefined) ?? null;

    const markFailed = async (msg: string) => {
      if (!renderJobId) return;
      await context.supabase
        .from("render_jobs")
        .update({
          status: "failed",
          error: msg,
          finished_at: new Date().toISOString(),
        })
        .eq("id", renderJobId);
    };

    const fail = async (
      stage: TimeTouristFailure["stage"],
      err: unknown,
    ): Promise<TimeTouristFailure> => {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[time-tourist] ${stage} failed:`, message);
      await markFailed(`${stage}: ${message}`);
      return { ok: false, stage, message };
    };

    // Phase 1 — opening selfie frame (9:16). fal's ImageSize enum names
    // portrait sizes with the flipped ratio, so 9:16 vertical = portrait_16_9.
    const imagePrompt = buildTimeTouristImagePrompt({
      destination: data.destination,
      tone: data.tone,
      custom: data.custom ?? null,
    });
    let imageUrl: string | null = null;
    let storedImg: { id: string; url: string; mime: string };
    const runImage = (prompt: string) =>
      falRun(
        "openai/gpt-image-2/edit",
        {
          prompt,
          image_urls: [data.refImageUrl],
          image_size: "portrait_16_9",
          quality: "high",
          num_images: 1,
          output_format: "png",
        },
        { label: "gpt-image-2/edit", timeoutMs: 10 * 60_000 },
      );
    try {
      let imgOut: unknown;
      try {
        imgOut = await runImage(imagePrompt);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (
          /content_policy_violation|partner_validation_failed|sensitive content|content checker/i.test(
            msg,
          )
        ) {
          console.warn(
            "[time-tourist] retrying image with sanitized prompt after content flag",
          );
          const dest = resolveDestination(data.destination, data.custom ?? null);
          const safeImg = `A screenshot of a vlog featuring a traveler. POV selfie camera shot on iphone. They are in ${dest.setting}.`;
          imgOut = await runImage(safeImg);
        } else {
          throw err;
        }
      }
      imageUrl = falPickImageUrl(imgOut);
      if (!imageUrl) {
        return fail(
          "image",
          new Error(
            `gpt-image-2 returned no image URL. Raw: ${JSON.stringify(imgOut).slice(0, 400)}`,
          ),
        );
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (
        /content_policy_violation|partner_validation_failed|sensitive content|content checker/i.test(
          msg,
        )
      ) {
        return fail(
          "image",
          new Error(
            "The image model flagged this frame as sensitive content (often a false positive on selfies). Try a different destination, tone, or selfie photo.",
          ),
        );
      }
      return fail("image", err);
    }


    try {
      storedImg = await downloadAndStoreUrl({
        projectId: data.projectId,
        userId: context.userId,
        sourceUrl: imageUrl,
        kind: "reference",
        label: `Time Tourist opening — ${destLabel}`,
        fallbackMime: "image/png",
      });
    } catch (err) {
      return fail("store", err);
    }

    // Phase 2 — Seedance 2.0 reference-to-video using the Phase 1 image.
    const videoPrompt = buildTimeTouristVideoPrompt({
      destination: data.destination,
      tone: data.tone,
      duration: data.duration,
      custom: data.custom ?? null,
    });
    let videoUrl: string | null = null;
    const runSeedance = async (prompt: string) =>
      falRun(
        "bytedance/seedance-2.0/reference-to-video",
        {
          prompt,
          image_urls: [imageUrl],
          aspect_ratio: "9:16",
          resolution: "1080p",
          duration: data.duration,
          generate_audio: true,
        },
        { label: "seedance-2.0-r2v", timeoutMs: 20 * 60_000 },
      );

    try {
      let vidOut: unknown;
      try {
        vidOut = await runSeedance(videoPrompt);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        // Retry once with a sanitized prompt if the partner flagged content.
        if (
          /content_policy_violation|partner_validation_failed|sensitive content/i.test(
            msg,
          )
        ) {
          console.warn(
            "[time-tourist] retrying with sanitized prompt after content flag",
          );
          const safePrompt = [
            `Wholesome first-person selfie vlog, ${data.duration}s, 9:16 vertical.`,
            `A modern traveler holds up their phone in ${
              data.destination === "custom"
                ? data.custom?.setting ?? "a historical setting"
                : TIME_TOURIST_DESTINATIONS.find(
                    (d) => d.id === data.destination,
                  )?.setting ?? "a historical setting"
            }.`,
            `They smile at the camera, point off-camera at the environment, and mouth "look at this" — family friendly, no contact, no chaos, no removed clothing.`,
            `Preserve the exact face, hair, and likeness from the reference image; do not alter facial structure.`,
          ].join(" ");
          vidOut = await runSeedance(safePrompt);
        } else {
          throw err;
        }
      }
      videoUrl = falPickVideoUrl(vidOut);
      if (!videoUrl) {
        return fail(
          "video",
          new Error(
            `seedance returned no video URL. Raw: ${JSON.stringify(vidOut).slice(0, 400)}`,
          ),
        );
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (
        /content_policy_violation|partner_validation_failed|sensitive content/i.test(
          msg,
        )
      ) {
        return fail(
          "video",
          new Error(
            "The video model flagged this clip as sensitive content (often a false positive). Try a different destination, tone, or selfie.",
          ),
        );
      }
      return fail("video", err);
    }

    let storedVid: { id: string; url: string; mime: string };
    try {
      storedVid = await downloadAndStoreUrl({
        projectId: data.projectId,
        userId: context.userId,
        sourceUrl: videoUrl,
        kind: "video",
        label: `Time Tourist — ${destLabel}`,
        fallbackMime: "video/mp4",
        duration: Number(data.duration),
      });
    } catch (err) {
      return fail("store", err);
    }

    if (renderJobId) {
      await context.supabase
        .from("render_jobs")
        .update({
          status: "done",
          final_asset_id: storedVid.id,
          finished_at: new Date().toISOString(),
        })
        .eq("id", renderJobId);
    }

    return {
      ok: true,
      image: {
        assetId: storedImg.id,
        assetUrl: storedImg.url,
        mime: storedImg.mime,
      },
      video: {
        assetId: storedVid.id,
        assetUrl: storedVid.url,
        mime: storedVid.mime,
      },
      imagePrompt,
      videoPrompt,
    };
  });
