// "Choose a photo" (CLAUDE.md § H2), all in the browser before upload: shrink to
// at most 2048 px on the long edge and re-encode as JPEG. That keeps files under
// the 5 MB limit and drops EXIF metadata such as location. A photo the browser
// can't decode (often HEIC) returns null, so the person is asked for another.

export const MAX_PHOTO_EDGE = 2048;
const JPEG_QUALITY = 0.85;

/** The size to draw at: never upscaled, long edge at most `MAX_PHOTO_EDGE`. */
export function targetSize(width: number, height: number): { width: number; height: number } {
  const scale = Math.min(1, MAX_PHOTO_EDGE / Math.max(width, height));
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

export async function preparePhoto(file: Blob): Promise<Blob | null> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return null; // can't be opened here — e.g. HEIC on a browser that doesn't decode it
  }
  const { width, height } = targetSize(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), "image/jpeg", JPEG_QUALITY));
}
