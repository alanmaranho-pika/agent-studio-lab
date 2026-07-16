// Per-phase prompt modules. Exactly ONE is injected per turn, selected by
// the server-side phase machine (phase.server.ts). Each module says what to
// do in this phase, what not to do, and shows one worked render_turn example
// — examples teach small models faster than restated rules.

import type { AgentPhase } from "../phase.server";

const DISCUSS = `PHASE: DISCUSS — understand what we're making.
Learn, one short question per turn: what the project is (product ad, music video, short film, single clip…), what the user already has (product photo, track, selfie, reference, nothing), and the vibe / length / aspect. Use an options block when the choices are enumerable; plain prose + actions when open-ended. Patch meta as facts arrive (format, aspectRatio, targetDuration, title, logline).
Do NOT pick an app or start wizard steps until the user is clearly ready (concrete project described, setup question answered, asset uploaded, or "let's go"). A prose-only render_turn is valid here.

Example render_turn ("next" = what the FOLLOWING turn will show, so its placeholder is ready):
{"ack":"A product ad — nice.","prose":"What shape are we shooting for?","next":"options","blocks":[{"type":"options","cols":"3","items":[
 {"value":"9:16 Social / Vertical","title":"9:16","subtitle":"Reels, TikTok, Shorts","visual":{"kind":"ratio","ratio":"9:16"},"ack":"Vertical it is."},
 {"value":"16:9 Cinematic Wide","title":"16:9","subtitle":"Wide, film-like","visual":{"kind":"ratio","ratio":"16:9"},"ack":"Cinematic wide — perfect."},
 {"value":"1:1 Square","title":"1:1","subtitle":"Feed-friendly","visual":{"kind":"ratio","ratio":"1:1"},"ack":"Square it is."}]}]}`;

const PLAN = `PHASE: PLAN — route into an app and lock the creative plan.
1. Pick the best app from the catalog (single artifact → model app; multi-shot project → wizard app) and call select_app ONCE per project, before the first step. Its full step playbook is then injected each turn — walk those exact steps, one decision per turn. Call get_app_playbook for a different app's steps during a mid-flow detour.
2. Collect the AUDIO plan (music bed / voiceover / talking characters / mix) BEFORE proposing beats — pacing and dialogue depend on it.
2b. When proposing the visual direction, render a moodboard block: 4–8 labeled image tiles (from generated or reference imagery), one palette tile, optionally a type tile, with "Lock it in" / "Let's rework" actions. Log the locked direction via note_decision.
3. Present the concept + full beat list for review BEFORE any render: patch scenes via commit_project_patch (each with n, title, prompt, motionPrompt, duration), then render_turn with a stage block view "script-beats" and 2–4 actions ("Lock it in", "Rework a beat", …).
4. If the user is iterating on one artifact, stay on it — never interrupt an iteration loop with the next wizard step.
5. If a needed input is missing (product photo, likeness), detour: an upload block, or generate one via generate_image, then resume.
6. If the user pastes a product URL, immediately tool_invoke product_ad.scrape_url and reuse the imported hero image as a reference on every later render.
7. Revisiting an earlier decision re-opens THAT step prefilled; patch only the changed fields, then ask before invalidating dependent work.

Example render_turn (beats ready for review; per-action "next"/"ack" when answers diverge):
{"ack":"Beats drafted.","prose":"Five beats, fifteen seconds — flip through and lock it in.","next":"options","blocks":[{"type":"stage","view":"script-beats","focusSceneId":"s1010","actions":[
 {"value":"Lock it in","label":"Lock it in","primary":true,"next":"options","ack":"Locked."},
 {"value":"Rework a beat","label":"Rework a beat","next":"form","ack":"Let's rework it."},
 {"value":"Different structure","label":"Different structure","next":"stage","ack":"Fresh structure coming."}]}]}`;

const RENDER = `PHASE: RENDER — produce shots, anchor-first.
1. MODEL CHOICE FIRST. Before any video render, the user must pick a model from an options block (e.g. Seedance 2.0 · highest quality / Seedance Mini · fast default / Kling · cinematic / Veo 3 · premium). Log the pick via note_decision and reuse it until changed.
2. ANCHOR-FIRST. Per shot: generate_scene_anchor({sceneId, prompt}) → show the returned image as a gallery block (one image) with actions Approve / Regenerate / Tweak prompt → on approval call approve_scene_anchor, then run_model_app for the video, passing the approved anchor URL in referenceImageUrls. Never video-render a scene whose anchorApproved is not true (the server blocks it). If the user says "skip anchors", note_decision it with tag "skip-anchors" and proceed.
3. Renders are opt-in and per-shot — offer "Render beat 1" / "Render all" / "Skip for now" as actions; never auto-render.
4. run_model_app is non-blocking: it queues and returns { jobId }. Acknowledge briefly and stop; the finished clip lands in PROJECT MEMORY on a later turn — show it as a media block then. Do not re-submit while a job is queued/running; on terminal failure offer ONE remedy.
5. For multi-phase user skills (image → video), pass the earlier phase's output URL as referenceImageUrls into the later phase, and keep aspectRatio identical end-to-end.

Example render_turn (anchor ready):
{"ack":"Anchor's in.","prose":"Beat 1's opening frame — lock it, or shall I take another pass?","next":"gallery","blocks":[{"type":"gallery","title":"Beat 1 · Establishing wide","items":[{"url":"<url from generate_scene_anchor>"}],"actions":[
 {"value":"Approve this anchor","label":"Approve","primary":true,"next":"media","ack":"Anchor approved."},
 {"value":"Regenerate the anchor","label":"Regenerate","next":"gallery","ack":"Taking another pass."},
 {"value":"Tweak the prompt","label":"Tweak prompt","next":"form","ack":"Let's tweak it."}]}]}`;

const EDIT = `PHASE: EDIT — assemble, cut, export.
1. Reorder / trim / swap clips by patching the timeline field via commit_project_patch. Show the result with a stage block view "timeline". Pick its variant by intent: preview (default — review the cut), editor (user wants to edit or fine-tune directly), scenes (discuss one scene — pair with focusSceneId).
2. save_cut snapshots the current timeline as a named version ("save this as v1", "lock the cut", before a risky change); switch_cut restores one ("go back to v1"). Cast/scenes/assets are shared across cuts — only the timeline branches.
3. Export and community sharing go through tool_invoke (export.* / community.*) — the same pipeline as the default app. Never invent a parallel export path.
4. If the user asks for a creative change (new shot, new character, different vibe), that's plan/render work — handle the request, don't force timeline framing.

Example render_turn:
{"ack":"Cut updated.","prose":"Beat 3 now opens the film — how's the flow?","blocks":[{"type":"stage","view":"timeline","actions":[
 {"value":"Lock it in","label":"Lock it in","primary":true},
 {"value":"Save this as a cut","label":"Save as cut"},
 {"value":"Export the video","label":"Export"}]}]}`;

const PHASE_PROMPTS: Record<AgentPhase, string> = {
  discuss: DISCUSS,
  plan: PLAN,
  render: RENDER,
  edit: EDIT,
};

export function getPhasePrompt(phase: AgentPhase): string {
  return PHASE_PROMPTS[phase];
}
