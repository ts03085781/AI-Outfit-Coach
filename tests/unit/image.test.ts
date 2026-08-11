import { afterEach, describe, expect, it, vi } from "vitest";

import { prepareImage } from "@/features/outfit/image";

const MAX_INPUT_BYTES = 15 * 1024 * 1024;

type BitmapMock = ImageBitmap & { close: ReturnType<typeof vi.fn> };

function createBitmap(width = 3200, height = 1600): BitmapMock {
  return { width, height, close: vi.fn() } as unknown as BitmapMock;
}

function mockImageBitmap(bitmap: BitmapMock) {
  vi.stubGlobal("createImageBitmap", vi.fn().mockResolvedValue(bitmap));
}

function mockCanvas(blob: Blob | null) {
  const createElement = document.createElement.bind(document);
  const context = { drawImage: vi.fn() } as unknown as CanvasRenderingContext2D;
  const canvas = {
    width: 0,
    height: 0,
    getContext: vi.fn().mockReturnValue(context),
    toBlob: vi.fn((callback: BlobCallback, type?: string, quality?: unknown) => {
      expect(type).toBe("image/webp");
      expect(quality).toBe(0.82);
      callback(blob);
    }),
  } as unknown as HTMLCanvasElement;

  vi.spyOn(document, "createElement").mockImplementation((tagName) => {
    if (tagName === "canvas") return canvas;
    return createElement(tagName);
  });

  return { canvas, context };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("prepareImage", () => {
  it("returns a stable code instead of a localized unsupported-format error", async () => {
    const decoder = vi.fn();
    vi.stubGlobal("createImageBitmap", decoder);

    await expect(
      prepareImage(new File(["x"], "outfit.gif", { type: "image/gif" })),
    ).rejects.toMatchObject({ code: "UNSUPPORTED_FORMAT" });
    expect(decoder).not.toHaveBeenCalled();
  });

  it("rejects unsupported image formats before decoding", async () => {
    const decoder = vi.fn();
    vi.stubGlobal("createImageBitmap", decoder);

    await expect(
      prepareImage(new File(["x"], "outfit.gif", { type: "image/gif" })),
    ).rejects.toMatchObject({ code: "UNSUPPORTED_FORMAT" });
    expect(decoder).not.toHaveBeenCalled();
  });

  it("rejects files larger than 15 MB before decoding", async () => {
    const decoder = vi.fn();
    vi.stubGlobal("createImageBitmap", decoder);
    const tooLarge = new File(
      [new Uint8Array(MAX_INPUT_BYTES + 1)],
      "outfit.jpg",
      { type: "image/jpeg" },
    );

    await expect(prepareImage(tooLarge)).rejects.toMatchObject({ code: "TOO_LARGE" });
    expect(decoder).not.toHaveBeenCalled();
  });

  it("scales the longest edge to 1600px and exports WebP", async () => {
    const bitmap = createBitmap();
    mockImageBitmap(bitmap);
    const output = new Blob(["webp"], { type: "image/webp" });
    const { canvas, context } = mockCanvas(output);

    await expect(
      prepareImage(new File(["photo"], "outfit.png", { type: "image/png" })),
    ).resolves.toBe(output);
    expect(canvas.width).toBe(1600);
    expect(canvas.height).toBe(800);
    expect(context.drawImage).toHaveBeenCalledWith(bitmap, 0, 0, 1600, 800);
    expect(bitmap.close).toHaveBeenCalledOnce();
  });

  it("reports an unreadable image when decoding fails", async () => {
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn().mockRejectedValue(new Error("decode failed")),
    );

    await expect(
      prepareImage(new File(["photo"], "outfit.webp", { type: "image/webp" })),
    ).rejects.toMatchObject({ code: "UNREADABLE" });
  });

  it("closes the bitmap when canvas encoding fails", async () => {
    const bitmap = createBitmap(100, 100);
    mockImageBitmap(bitmap);
    mockCanvas(null);

    await expect(
      prepareImage(new File(["photo"], "outfit.jpg", { type: "image/jpeg" })),
    ).rejects.toMatchObject({ code: "PROCESSING_FAILED" });
    expect(bitmap.close).toHaveBeenCalledOnce();
  });

  it("rejects WebP output larger than 4 MB", async () => {
    const bitmap = createBitmap(100, 100);
    mockImageBitmap(bitmap);
    mockCanvas(new Blob([new Uint8Array(4 * 1024 * 1024 + 1)]));

    await expect(
      prepareImage(new File(["photo"], "outfit.jpg", { type: "image/jpeg" })),
    ).rejects.toMatchObject({ code: "OUTPUT_TOO_LARGE" });
    expect(bitmap.close).toHaveBeenCalledOnce();
  });
});
