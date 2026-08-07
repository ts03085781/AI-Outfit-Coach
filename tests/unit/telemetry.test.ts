import { describe, expect, it } from "vitest";

import { track } from "@/lib/telemetry";

describe("track", () => {
  it("accepts a whitelisted anonymous analysis event", () => {
    expect(() => track({
      type: "analysis_complete",
      occasion: "casual",
      latencyBucket: "5-10s",
    })).not.toThrow();
  });

  it("rejects an event that tries to include photo content before it reaches the sink", () => {
    const received: unknown[] = [];
    const sink = (event: Event) => received.push((event as CustomEvent).detail);
    window.addEventListener("outfit-telemetry", sink);

    try {
      expect(() => track({ type: "analysis_complete", photo: "base64" } as never)).toThrow();
      expect(received).toEqual([]);
    } finally {
      window.removeEventListener("outfit-telemetry", sink);
    }
  });

  it("sends only whitelisted feedback metadata to the event sink", () => {
    const received: unknown[] = [];
    const sink = (event: Event) => received.push((event as CustomEvent).detail);
    window.addEventListener("outfit-telemetry", sink);

    try {
      track({ type: "feedback", helpful: true });
      expect(received).toEqual([{ type: "feedback", helpful: true }]);
      expect(JSON.stringify(received)).not.toContain("建議內容");
    } finally {
      window.removeEventListener("outfit-telemetry", sink);
    }
  });
});
