// @vitest-environment node

import { describe, expect, it, vi } from "vitest";

import { createAuthCallbackHandler } from "@/app/auth/callback/route";

describe("GET /auth/callback", () => {
  it("exchanges a valid code and redirects to the safe next path", async () => {
    const exchangeCode = vi.fn().mockResolvedValue({ error: null });
    const request = new Request("https://stylecue.example/auth/callback?code=valid&next=/settings");

    const response = await createAuthCallbackHandler(exchangeCode)(request);

    expect(exchangeCode).toHaveBeenCalledWith("valid");
    expect(response.headers.get("location")).toBe("https://stylecue.example/settings?login=success");
  });

  it.each([
    ["missing code", "https://stylecue.example/auth/callback?next=/settings", vi.fn()],
    ["rejected exchange", "https://stylecue.example/auth/callback?code=invalid&next=/settings", vi.fn().mockResolvedValue({ error: new Error("exchange failed") })],
  ])("redirects %s to the localized login error route", async (_case, url, exchangeCode) => {
    const response = await createAuthCallbackHandler(exchangeCode)(new Request(url));

    expect(response.headers.get("location")).toBe("https://stylecue.example/login?error=oauth");
  });

  it("uses the fallback destination for an unsafe next path", async () => {
    const response = await createAuthCallbackHandler(vi.fn().mockResolvedValue({ error: null }))(
      new Request("https://stylecue.example/auth/callback?code=valid&next=//evil.example"),
    );

    expect(response.headers.get("location")).toBe("https://stylecue.example/analyze?login=success");
  });
});
