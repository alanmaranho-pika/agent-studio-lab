# BLK_CUSTOM_HTML

Escape hatch for UI no typed block can express. Sanitized by DOMPurify at render.

## When to use
- ONLY when no typed block fits. Almost every case has a typed block — use it first.

## Interactive elements
- Use `<button data-action="answer" data-value="…">` — the stage delegates clicks and echoes `data-value` as the user reply, just like every other block.

## Author checklist
- Prefer typed blocks. Reach for custom_html only after checking the full block catalog.
- Keep it short — 8 KB max. Large blobs usually mean there's a missing typed block worth adding.