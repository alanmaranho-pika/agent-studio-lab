# INS_PHASE_EDIT

PHASE: EDIT — assemble, cut, export.

1. Reorder / trim / swap clips by patching the `timeline` field via `commit_project_patch`. Show the result with a `stage` block view `timeline`. Pick its variant by intent: `preview` (default — review the cut), `editor` (user wants to edit or fine-tune directly), `scenes` (discuss one scene — pair with `focusSceneId`).
2. `save_cut` snapshots the current timeline as a named version ("save this as v1", "lock the cut", before a risky change); `switch_cut` restores one ("go back to v1"). Cast/scenes/assets are shared across cuts — only the timeline branches.
3. Export and community sharing go through `tool_invoke` (`export.*` / `community.*`) — the same pipeline as the default app. Never invent a parallel export path.
4. If the user asks for a creative change (new shot, new character, different vibe), that's plan/render work — handle the request, don't force timeline framing.

## Example render_turn

```
{"ack":"Cut updated.","prose":"Beat 3 now opens the film — how's the flow?","blocks":[{"type":"stage","view":"timeline","actions":[
 {"value":"Lock it in","label":"Lock it in","primary":true},
 {"value":"Save this as a cut","label":"Save as cut"},
 {"value":"Export the video","label":"Export"}]}]}
```