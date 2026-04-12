'use strict';
/**
 * Off-main-thread image resize worker.
 * Receives: { id, blob } — an ImageBlob to shrink to 64×64.
 * Posts back: { id, blob } on success, or { id, error } on failure.
 * Uses OffscreenCanvas so the resize never blocks the UI thread.
 */
self.addEventListener('message', async (e) => {
  const { id, blob } = e.data;
  try {
    const bmp = await createImageBitmap(blob);
    const canvas = new OffscreenCanvas(64, 64);
    canvas.getContext('2d').drawImage(bmp, 0, 0, 64, 64);
    bmp.close();

    let resized;
    try {
      resized = await canvas.convertToBlob({ type: 'image/webp', quality: 0.80 });
    } catch {
      resized = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.80 });
    }
    self.postMessage({ id, blob: resized });
  } catch (err) {
    self.postMessage({ id, error: err.message });
  }
});
