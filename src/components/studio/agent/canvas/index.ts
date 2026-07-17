// Public surface of the canvas renderer — the only symbols agent-shell
// imports. Everything Pixi-flavored stays behind StageCanvasMount's lazy
// boundary.

export { StageCanvasMount } from "./StageCanvasMount";
export { isCanvasRenderableTurn } from "./support";
export { useCanvasRenderer, toggleRenderer } from "./renderer-flag";
