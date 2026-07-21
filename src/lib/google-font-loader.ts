// Live Google Fonts loader for agent-chosen typefaces (pitch-card titles).
// The agent picks a family name per option by mood ("Playfair Display",
// "Bebas Neue", …); this injects that family's stylesheet on demand, once
// per family, and returns the CSS-safe family string to use in font-family.
//
// Safety: family names are validated against a strict charset before they
// ever touch a URL or a style attribute, so a malformed/hostile value can't
// break out into markup or fetch an arbitrary origin (the host is always
// fonts.googleapis.com).

const loaded = new Set<string>();

/** Valid Google Fonts family: letters, digits, spaces only (matches schema). */
function isValidFamily(name: string): boolean {
  return /^[A-Za-z0-9 ]{1,48}$/.test(name);
}

/**
 * Ensure a Google Font family is loaded. Returns the sanitized family name
 * (quotable in a font-family declaration) or null if the name is invalid.
 * No-op on the server or for already-loaded families.
 */
export function loadGoogleFont(family: string): string | null {
  const name = family.trim();
  if (!isValidFamily(name)) return null;
  if (typeof document === "undefined") return name; // SSR: skip inject, still return name
  if (loaded.has(name)) return name;
  loaded.add(name);

  const param = name.replace(/ +/g, "+");
  const href = `https://fonts.googleapis.com/css2?family=${param}:wght@400;500;700&display=swap`;
  // Guard against a duplicate link already in the document (e.g. HMR).
  if (document.querySelector(`link[data-google-font="${name}"]`)) return name;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = href;
  link.setAttribute("data-google-font", name);
  document.head.appendChild(link);
  return name;
}
