const SUPPORTED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_INPUT_BYTES = 15 * 1024 * 1024;
const MAX_OUTPUT_BYTES = 4 * 1024 * 1024;
const MAX_EDGE = 1600;

export type ImagePreparationErrorCode =
  | "UNSUPPORTED_FORMAT"
  | "TOO_LARGE"
  | "UNREADABLE"
  | "PROCESSING_FAILED"
  | "OUTPUT_TOO_LARGE";

export class ImagePreparationError extends Error {
  constructor(readonly code: ImagePreparationErrorCode) {
    super(code);
  }
}

function toWebp(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
          return;
        }
        reject(new ImagePreparationError("PROCESSING_FAILED"));
      },
      "image/webp",
      0.82,
    );
  });
}

export async function prepareImage(file: File): Promise<Blob> {
  if (!SUPPORTED_IMAGE_TYPES.has(file.type)) {
    throw new ImagePreparationError("UNSUPPORTED_FORMAT");
  }

  if (file.size > MAX_INPUT_BYTES) {
    throw new ImagePreparationError("TOO_LARGE");
  }

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new ImagePreparationError("UNREADABLE");
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
      throw new ImagePreparationError("PROCESSING_FAILED");
    }

    context.drawImage(bitmap, 0, 0, width, height);
    const image = await toWebp(canvas);

    if (image.size > MAX_OUTPUT_BYTES) {
      throw new ImagePreparationError("OUTPUT_TOO_LARGE");
    }

    return image;
  } finally {
    bitmap.close();
  }
}
