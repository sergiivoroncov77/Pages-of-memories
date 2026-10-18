/** Photos smaller than this are shown as they are. */
const MIN_BYTES = 400 * 1024;
const MAX_SIDE = 1600;

/**
 * A lighter copy of a photo for viewing from the cloud: up to 1600 px on the
 * long side, JPEG. Null when the photo is small already, when the browser
 * cannot draw it (HEIC in Chrome, say), or when the copy saves little.
 */
export async function makePhotoPreview(photo: Blob): Promise<Blob | null> {
  if (photo.size < MIN_BYTES || typeof createImageBitmap !== 'function' || typeof document === 'undefined') return null;
  let bitmap: ImageBitmap | undefined;
  try {
    bitmap = await createImageBitmap(photo, { imageOrientation: 'from-image' });
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext('2d');
    if (!context) return null;
    // JPEG has no transparency: a white sheet under PNG cut-outs.
    context.fillStyle = '#fff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const preview = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.82));
    return preview && preview.size < photo.size * 0.7 ? preview : null;
  } catch {
    return null;
  } finally {
    bitmap?.close();
  }
}
