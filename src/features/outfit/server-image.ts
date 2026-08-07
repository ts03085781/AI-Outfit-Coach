import sharp from "sharp";

const MAX_DIMENSION = 8_000;
const MAX_INPUT_PIXELS = MAX_DIMENSION * MAX_DIMENSION;

const MIME_FORMATS = {
  "image/jpeg": "jpeg",
  "image/png": "png",
  "image/webp": "webp",
} as const;

function hasExpectedMagic(bytes: Uint8Array, mime: keyof typeof MIME_FORMATS): boolean {
  if (mime === "image/jpeg") {
    return bytes.length >= 3
      && bytes[0] === 0xff
      && bytes[1] === 0xd8
      && bytes[2] === 0xff;
  }
  if (mime === "image/png") {
    const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    return bytes.length >= signature.length
      && signature.every((byte, index) => bytes[index] === byte);
  }
  return bytes.length >= 12
    && new TextDecoder().decode(bytes.subarray(0, 4)) === "RIFF"
    && new TextDecoder().decode(bytes.subarray(8, 12)) === "WEBP";
}

export async function isDecodableSupportedImage(image: Blob): Promise<boolean> {
  if (!(image.type in MIME_FORMATS)) return false;

  try {
    const bytes = new Uint8Array(await image.arrayBuffer());
    const mime = image.type as keyof typeof MIME_FORMATS;
    if (!hasExpectedMagic(bytes, mime)) return false;

    const metadata = await sharp(Buffer.from(bytes), {
      failOn: "error",
      limitInputPixels: MAX_INPUT_PIXELS,
    }).metadata();

    return metadata.format === MIME_FORMATS[mime]
      && typeof metadata.width === "number"
      && typeof metadata.height === "number"
      && metadata.width > 0
      && metadata.height > 0
      && metadata.width <= MAX_DIMENSION
      && metadata.height <= MAX_DIMENSION;
  } catch {
    return false;
  }
}
