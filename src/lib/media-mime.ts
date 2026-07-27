/**
 * Detect image types from their bytes instead of trusting the filename or
 * browser-provided File.type. Both can be wrong (for example, a PNG renamed
 * to .jpg), and model providers reject that MIME/payload mismatch.
 */
export function detectImageMimeFromBytes(bytes: Uint8Array): string | null {
  const startsWith = (signature: readonly number[], offset = 0) =>
    bytes.length >= offset + signature.length &&
    signature.every((byte, index) => bytes[offset + index] === byte);

  if (startsWith([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return "image/png";
  }
  if (startsWith([0xff, 0xd8, 0xff])) return "image/jpeg";
  if (
    startsWith([0x47, 0x49, 0x46, 0x38, 0x37, 0x61]) ||
    startsWith([0x47, 0x49, 0x46, 0x38, 0x39, 0x61])
  ) {
    return "image/gif";
  }
  if (startsWith([0x52, 0x49, 0x46, 0x46]) && startsWith([0x57, 0x45, 0x42, 0x50], 8)) {
    return "image/webp";
  }
  if (startsWith([0x42, 0x4d])) return "image/bmp";
  if (startsWith([0x49, 0x49, 0x2a, 0x00]) || startsWith([0x4d, 0x4d, 0x00, 0x2a])) {
    return "image/tiff";
  }
  if (startsWith([0x00, 0x00, 0x01, 0x00]) || startsWith([0x00, 0x00, 0x02, 0x00])) {
    return "image/x-icon";
  }
  if (
    startsWith([0xff, 0x0a]) ||
    startsWith([0x00, 0x00, 0x00, 0x0c, 0x4a, 0x58, 0x4c, 0x20, 0x0d, 0x0a, 0x87, 0x0a])
  ) {
    return "image/jxl";
  }

  // AVIF and HEIF/HEIC are ISO Base Media File Format containers. Inspect
  // the major and compatible brands instead of relying on one fixed box size.
  if (startsWith([0x66, 0x74, 0x79, 0x70], 4) && bytes.length >= 12) {
    const brands: string[] = [];
    for (let offset = 8; offset + 4 <= Math.min(bytes.length, 64); offset += 4) {
      if (offset === 12) continue; // minor_version, not a brand
      brands.push(String.fromCharCode(...bytes.subarray(offset, offset + 4)));
    }
    if (brands.some((brand) => brand === "avif" || brand === "avis")) {
      return "image/avif";
    }
    if (brands.some((brand) => ["heic", "heix", "hevc", "hevx", "heim", "heis"].includes(brand))) {
      return "image/heic";
    }
    if (brands.some((brand) => brand === "mif1" || brand === "msf1")) {
      return "image/heif";
    }
  }

  // SVG has no binary magic number. Keep this intentionally strict and only
  // inspect the beginning of the document to avoid classifying arbitrary XML.
  if (bytes.length) {
    const text = new TextDecoder()
      .decode(bytes.subarray(0, Math.min(bytes.length, 4096)))
      .replace(/^\uFEFF/, "")
      .trimStart();
    if (/^<svg(?:\s|>)/i.test(text) || /^<\?xml[\s\S]{0,1000}<svg(?:\s|>)/i.test(text)) {
      return "image/svg+xml";
    }
  }

  return null;
}

export function normalizeMimeType(mime: string | null | undefined): string {
  return mime?.split(";")[0]?.trim().toLowerCase() || "application/octet-stream";
}
