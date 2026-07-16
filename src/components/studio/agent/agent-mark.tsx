// Small "agent" glyph — rotated squircle with a matching cutout.
// Approximates the mark in the design (a 4-petal rotated diamond).
export function AgentMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 100 100"
      className={className}
      aria-hidden
      focusable="false"
    >
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        fill="currentColor"
        d="
          M50 2
          C58 22 78 42 98 50
          C78 58 58 78 50 98
          C42 78 22 58 2 50
          C22 42 42 22 50 2
          Z
          M50 30
          C46 40 40 46 30 50
          C40 54 46 60 50 70
          C54 60 60 54 70 50
          C60 46 54 40 50 30
          Z
        "
      />
    </svg>
  );
}
