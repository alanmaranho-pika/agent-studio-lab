// Compatibility exports for older callers. The media generation backend is
// now Pika; keeping these names avoids a risky, cross-feature rename while
// existing projects and server functions continue to work.

import {
  normalizeAspect,
  normalizePikaInput,
  normalizePikaModelPath,
  pikaAnimateImage,
  pikaApiBaseUrl,
  pikaGenerateImage,
  pikaGenerateMusic,
  pikaGenerateVoiceover,
  pikaPickAudioUrl,
  pikaPickImageUrl,
  pikaPickVideoUrl,
  pikaPollOnce,
  pikaRun,
  pikaSubmit,
  requirePikaApiKey,
  type PikaPollResult,
  type PikaRunOptions,
  type PikaSubmitResult,
} from "@/lib/pika-media.server";

export type FalRunOptions = PikaRunOptions;
export type FalSubmitResult = PikaSubmitResult;
export type FalPollResult = PikaPollResult;

export const falApiBaseUrl = pikaApiBaseUrl;
export const falAuthHeader = () => ({ "X-API-Key": requirePikaApiKey() });
export const normalizeFalModelPath = normalizePikaModelPath;
export const falNormalizeInput = normalizePikaInput;
export const falSubmit = pikaSubmit;
export const falPollOnce = pikaPollOnce;
export const falRun = pikaRun;
export const falPickImageUrl = pikaPickImageUrl;
export const falPickVideoUrl = pikaPickVideoUrl;
export const falPickAudioUrl = pikaPickAudioUrl;
export { normalizeAspect };

export const falGenerateImage = pikaGenerateImage;
export const falAnimateImage = pikaAnimateImage;
export const falGenerateMusic = pikaGenerateMusic;
export const falGenerateVoiceover = pikaGenerateVoiceover;

// A small legacy escape hatch for non-generation utilities that Pika does not
// catalog (currently PySceneDetect). It is intentionally not used by any
// image, video, audio, speech, or agent generation path.
export async function legacyFalRun<T = unknown>(
  model: string,
  input: Record<string, unknown>,
  opts: { timeoutMs?: number; intervalMs?: number; label?: string } = {},
): Promise<T> {
  void input;
  void opts;
  throw new Error(`[legacy-fal] Fal provider retired; ${model} was called after phase-out`);
}

/**
 * Pika does not expose a timeline/ffmpeg composition endpoint. This is kept
 * as a compatibility seam for the final-film renderer. Generation itself is
 * fully Pika-backed. FAL_KEY is intentionally retired, so this path fails
 * loudly until a dedicated compositor is selected.
 */
export async function falStitchFilm(args: {
  clips: Array<{ url: string; durationSeconds: number }>;
  musicUrl?: string;
  voiceovers?: Array<{ url: string; startSeconds: number; durationSeconds: number }>;
}): Promise<string> {
  void args;
  throw new Error("[legacy-fal] Fal provider retired; final-film composition was called after phase-out");
}
