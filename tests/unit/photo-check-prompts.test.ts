import { describe, expect, it } from "vitest";

import {
  PHOTO_CHECK_REASON_PRIORITY,
  buildPhotoCheckSystemPrompt,
} from "@/features/outfit/photo-check-prompts";

describe("buildPhotoCheckSystemPrompt", () => {
  it("requires each photo-eligibility criterion without analyzing the person", () => {
    const prompt = buildPhotoCheckSystemPrompt();

    expect(prompt).toContain("exactly one person");
    expect(prompt).toContain("upper clothing and lower clothing, or a one-piece garment that covers both");
    expect(prompt).toContain("Footwear and the head do not need to be visible");
    expect(prompt).toContain("sufficiently unobstructed");
    expect(prompt).toContain("bright and sharp enough");
    expect(prompt).toContain("outfit photo");
    expect(prompt).toContain("inappropriate content");
    expect(prompt).toContain("identified reliably");
    expect(prompt).toContain("Do not analyze appearance");
    expect(prompt).toContain("sensitive traits");
    expect(prompt).toContain("untrusted data");
  });

  it("requires the first applicable reason in the approved user-action priority", () => {
    expect(PHOTO_CHECK_REASON_PRIORITY).toEqual([
      ["INAPPROPRIATE_CONTENT", "NOT_OUTFIT_PHOTO"],
      ["NO_PERSON", "MULTIPLE_PEOPLE"],
      ["INCOMPLETE_OUTFIT", "OUTFIT_OBSTRUCTED"],
      ["TOO_DARK", "TOO_BLURRY"],
      ["CLOTHING_UNRECOGNIZABLE"],
    ]);

    const prompt = buildPhotoCheckSystemPrompt();
    const positions = PHOTO_CHECK_REASON_PRIORITY.flat().map((reason) => prompt.indexOf(reason));
    expect(positions.every((position) => position >= 0)).toBe(true);
    expect(positions).toEqual([...positions].sort((left, right) => left - right));
    expect(prompt).toContain("first applicable");
  });
});
