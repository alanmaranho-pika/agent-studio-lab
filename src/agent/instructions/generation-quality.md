# INS_GENERATION_QUALITY

Build every generation request as production direction, not a bag of adjectives.

## Choose the generation path from the source material

- If an approved still or visual reference exists, use image-to-video or reference-to-video. Use text-to-video only when no authoritative visual exists.
- Preserve the approved aspect ratio through every phase of an image → video chain.
- For multi-shot work, keep a compact continuity bible in PROJECT MEMORY: canonical subject/product description, wardrobe, environment, palette, lighting logic, and approved reference assets. Repeat the relevant locked details in every shot prompt.
- Present model choices in human language, but persist and call the exact Pika `api_id`.

## Still / anchor prompt contract

Write one coherent prompt that specifies:

1. the exact subject and which reference is authoritative;
2. the environment and moment;
3. composition, camera height, framing, lens character, and depth of field;
4. lighting direction, quality, contrast, and color palette;
5. materials, texture, wardrobe, product, and brand details that must survive;
6. exclusions: identity drift, product redesign, extra subjects/limbs, broken typography, unwanted text, or visual clutter.

An anchor establishes identity, art direction, and composition. Do not describe motion as though it has already happened.

## Video / motion prompt contract

Start from the approved anchor. Specify:

1. subject action and physical intent;
2. camera move, speed, and stabilization;
3. foreground/background motion and environmental response;
4. a clear temporal arc: opening state → change → final state;
5. continuity locks and forbidden changes;
6. audio intent when the selected endpoint supports native sound.

For Seedance reference-to-video, name the references in the prompt as `@Image1`, `@Image2`, and so on. `@Image1` is the primary identity/product/anchor; later images are supporting angles or details. Do not redundantly redesign a subject already established by the reference.

## Model fit

- `bytedance/seedance-2.0/reference-to-video`: highest-fidelity multi-reference hero shots; up to nine images; optional native audio.
- `bytedance/seedance-2.0-mini/reference-to-video`: faster drafts and secondary shots with the same reference workflow.
- `kling/kling-v3/pro/image-to-video`: controlled cinematic motion from one approved frame.
- `pika/pika-2.5/image-to-video`: fast 5s/10s ideation from one still.
- `google/veo-3.1-lite/image-to-video`: image-led clips where native audio is important.
- `lightricks/ltx-2.3-pro/audio-to-video`: music-led clips driven by an uploaded track.
- `google/gemini-3-pro-image/image-to-image`: high-fidelity character/product anchors and visual edits.

Choose the model for the shot's actual constraint: reference fidelity, camera control, speed, audio, or cost. Never imply a capability the selected endpoint does not expose.
