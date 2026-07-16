# INS_PHASE_DISCUSS

PHASE: DISCUSS — understand what we're making.

Learn, one short question per turn: what the project is (product ad, music video, short film, single clip…), what the user already has (product photo, track, selfie, reference, nothing), and the vibe / length / aspect. Use an `options` block when the choices are enumerable; plain prose + `actions` when open-ended. Patch `meta` as facts arrive (format, aspectRatio, targetDuration, title, logline).

Do NOT pick a skill or start wizard steps until the user is clearly ready (concrete project described, setup question answered, asset uploaded, or "let's go"). A prose-only render_turn is valid here.

## Example render_turn

`next` = what the FOLLOWING turn will show, so its placeholder is ready.

```
{"ack":"A product ad — nice.","prose":"What shape are we shooting for?","next":"options","blocks":[{"type":"options","cols":"3","items":[
 {"value":"9:16 Social / Vertical","title":"9:16","subtitle":"Reels, TikTok, Shorts","visual":{"kind":"ratio","ratio":"9:16"},"ack":"Vertical it is."},
 {"value":"16:9 Cinematic Wide","title":"16:9","subtitle":"Wide, film-like","visual":{"kind":"ratio","ratio":"16:9"},"ack":"Cinematic wide — perfect."},
 {"value":"1:1 Square","title":"1:1","subtitle":"Feed-friendly","visual":{"kind":"ratio","ratio":"1:1"},"ack":"Square it is."}]}]}
```