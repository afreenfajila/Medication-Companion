export const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB (CLAUDE.md / site-contract §13)
export const ACCEPTED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export type AcceptedImageType = (typeof ACCEPTED_IMAGE_TYPES)[number];

export type ImageCheck =
  | { ok: true; mimeType: AcceptedImageType }
  | { ok: false; error: "empty" | "type" | "size" };

export function isAcceptedImageType(type: string): type is AcceptedImageType {
  return (ACCEPTED_IMAGE_TYPES as readonly string[]).includes(type);
}

/** Cheap checks on declared metadata (client and server). Exactly 5 MB is allowed. */
export function validateImage(file: { type: string; size: number }): ImageCheck {
  if (file.size <= 0) return { ok: false, error: "empty" };
  if (!isAcceptedImageType(file.type)) return { ok: false, error: "type" };
  if (file.size > MAX_IMAGE_BYTES) return { ok: false, error: "size" };
  return { ok: true, mimeType: file.type };
}

/**
 * Server-side: the declared MIME type is client-controlled, so confirm the
 * bytes really are that image format (magic numbers) before forwarding them.
 */
export function sniffImageType(bytes: Uint8Array): AcceptedImageType | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return "image/png";
  }
  if (
    bytes.length >= 12 &&
    String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
    String.fromCharCode(...bytes.slice(8, 12)) === "WEBP"
  ) {
    return "image/webp";
  }
  return null;
}
