import { readFileSync } from "node:fs";
import path from "node:path";

const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

function readPngIcon(fileName: string) {
  return readFileSync(path.resolve(process.cwd(), "public", fileName));
}

it("ships a valid 192 by 192 PWA icon", () => {
  const icon = readPngIcon("icon-192.png");

  expect(icon.subarray(0, 8)).toEqual(pngSignature);
  expect(icon.readUInt32BE(16)).toBe(192);
  expect(icon.readUInt32BE(20)).toBe(192);
});

it("ships a valid 512 by 512 PWA icon", () => {
  const icon = readPngIcon("icon-512.png");

  expect(icon.subarray(0, 8)).toEqual(pngSignature);
  expect(icon.readUInt32BE(16)).toBe(512);
  expect(icon.readUInt32BE(20)).toBe(512);
});
