const SUPPORTED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_INPUT_BYTES = 15 * 1024 * 1024;
const MAX_OUTPUT_BYTES = 4 * 1024 * 1024;
const MAX_EDGE = 1600;

function toWebp(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
          return;
        }
        reject(new Error("照片處理失敗，請重新選擇"));
      },
      "image/webp",
      0.82,
    );
  });
}

export async function prepareImage(file: File): Promise<Blob> {
  if (!SUPPORTED_IMAGE_TYPES.has(file.type)) {
    throw new Error("請使用 JPEG、PNG 或 WebP");
  }

  if (file.size > MAX_INPUT_BYTES) {
    throw new Error("照片檔案過大，請選擇小於 15 MB 的照片");
  }

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error("照片無法讀取，請重新選擇");
  }

  try {
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");

    if (!context) {
      throw new Error("照片處理失敗，請重新選擇");
    }

    context.drawImage(bitmap, 0, 0, width, height);
    const image = await toWebp(canvas);

    if (image.size > MAX_OUTPUT_BYTES) {
      throw new Error("照片內容過大，請重新拍攝");
    }

    return image;
  } finally {
    bitmap.close();
  }
}
