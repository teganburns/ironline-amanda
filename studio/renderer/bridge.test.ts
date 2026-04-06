import { afterEach, describe, expect, test } from "bun:test";
import { STUDIO_BRIDGE_CAPABILITIES, STUDIO_BRIDGE_VERSION } from "../../src/studio/bridge";
import { getBridgeDiagnostics } from "./bridge";

const originalWindow = globalThis.window;

afterEach(() => {
  globalThis.window = originalWindow;
});

describe("studio renderer bridge", () => {
  test("reports a stale preload when required methods are missing", async () => {
    globalThis.window = {
      ironlineStudio: {
        getSnapshot: async () => null,
      },
    } as typeof window;

    const diagnostics = await getBridgeDiagnostics();

    expect(diagnostics.ok).toBe(false);
    if (!diagnostics.ok) {
      expect(diagnostics.message).toContain("Studio build is out of date");
      expect(diagnostics.missingCapabilities).toContain("getBridgeInfo");
    }
  });

  test("accepts a bridge that exposes the current version and capabilities", async () => {
    const api = Object.fromEntries(
      STUDIO_BRIDGE_CAPABILITIES.map((capability) => [capability, async () => null])
    ) as Record<string, () => Promise<unknown>>;

    api.getBridgeInfo = async () => ({
      version: STUDIO_BRIDGE_VERSION,
      capabilities: [...STUDIO_BRIDGE_CAPABILITIES],
    });

    globalThis.window = {
      ironlineStudio: api,
    } as typeof window;

    const diagnostics = await getBridgeDiagnostics();

    expect(diagnostics.ok).toBe(true);
  });
});
