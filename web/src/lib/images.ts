/* Client-side image preparation for listing uploads.
   Files from the device are downscaled to 1600px and re-encoded so they fit
   the server's 700 KB decoded cap (D1 stores bytes; the API takes a data URL).
   WebP first — unsupported browsers fall back to the returned PNG/JPEG, which
   the server sniffs anyway. */

const MAX_DATA_URL_CHARS = 900_000; // base64 of ~675 KB — under the server's 700 KB
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
export const GALLERY_MAX = 12;

export async function fileToDataUrl(file: File, maxDim = 1600): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('Choose an image file (JPG, PNG or WebP)');
  if (file.size > MAX_UPLOAD_BYTES) throw new Error('That photo is over 10 MB — pick a smaller one');

  let source: ImageBitmap;
  try {
    source = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    source = await createImageBitmap(file); // browsers without orientation support
  }
  try {
    const scale = Math.min(1, maxDim / Math.max(source.width, source.height));
    const w = Math.max(1, Math.round(source.width * scale));
    const h = Math.max(1, Math.round(source.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas is unavailable in this browser');
    ctx.fillStyle = '#fff'; // matte behind transparency for JPEG fallbacks
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(source, 0, 0, w, h);

    const attempts = [
      ['image/webp', 0.85],
      ['image/jpeg', 0.85],
      ['image/jpeg', 0.7],
    ] as const;
    for (const [mime, quality] of attempts) {
      const url = canvas.toDataURL(mime, quality);
      if (url.length <= MAX_DATA_URL_CHARS) return url;
    }
    throw new Error('That photo is too heavy even after resizing — try a smaller one');
  } finally {
    source.close();
  }
}
