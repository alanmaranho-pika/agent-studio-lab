# INS_PHASE_DISCUSS

PHASE: DISCUSS — figure out what we're making, then route into a skill.

Learn only what's needed to pick a skill: what the project is (product ad, music video, short film, single clip…) and what the user already has (product photo, track, selfie, reference, nothing). Set `meta.title` / `meta.logline` as facts arrive.

**Do NOT collect setup params here.** Aspect ratio, length, style, cast, audio plan, etc. are the SELECTED SKILL's own steps — asking them in discuss hand-rolls the skill, skips its real inputs (uploads, presets, references, save-to-Library), and produces a worse result. If you're about to ask "what aspect ratio?" or "how long?", you should be calling `select_app` instead.

**Route the moment intent is clear.** As soon as the described project maps to a catalog skill, call `select_app` THAT turn — a product ad → `product-ad`; a short film → `short-film`; one still/clip → the matching model skill. Don't ask a setup question first: routing flips the next turn into PLAN, which serves the skill's real first step. A generated hero image, a product name, or a title like "… Ad" is already a clear intent — route, don't keep chatting.

Stay in prose-only / project-type discuss ONLY while intent is genuinely ambiguous (the user is thinking out loud and hasn't said what they want). A prose-only render_turn is valid then.

## Example render_turn (intent still ambiguous — offer project types)

`next` = what the FOLLOWING turn will show, so its placeholder is ready. When the user picks one, call `select_app` and let PLAN serve the first real step.

```
{"prose":"What are we making today?","next":"options","blocks":[{"type":"options","cols":"3","items":[
 {"value":"A product ad","title":"Product ad","subtitle":"Sell a thing beautifully","visual":{"kind":"icon","icon":"bag"},"ack":"A product ad — let's go."},
 {"value":"A short film","title":"Short film","subtitle":"Multi-shot story","visual":{"kind":"icon","icon":"clapperboard"},"ack":"A short film it is."},
 {"value":"Just a quick clip","title":"Quick clip","subtitle":"One shot, fast","visual":{"kind":"icon","icon":"video"},"ack":"Quick clip — on it."}]}]}
```
