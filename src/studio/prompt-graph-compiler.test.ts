import { describe, expect, test } from "bun:test";
import { compilePromptGraphVariant } from "./prompt-graph-compiler";
import type { PromptGraphVariant } from "./types";

describe("prompt graph compiler", () => {
  test("compiles enabled nodes in order and skips disabled nodes", () => {
    const variant: PromptGraphVariant = {
      id: "variant-1",
      name: "Variant One",
      agentId: "amanda-core",
      isPublished: true,
      createdAt: new Date("2026-01-01T00:00:00.000Z").toISOString(),
      updatedAt: new Date("2026-01-01T00:00:00.000Z").toISOString(),
      nodes: [
        {
          id: "node-b",
          type: "rules",
          title: "Rules",
          content: "Follow the rules.",
          enabled: true,
          order: 1,
        },
        {
          id: "node-a",
          type: "core",
          title: "Core",
          content: "Core instructions.",
          enabled: true,
          order: 0,
        },
        {
          id: "node-c",
          type: "examples",
          title: "Examples",
          content: "Do not include me.",
          enabled: false,
          order: 2,
        },
      ],
    };

    const compiled = compilePromptGraphVariant(variant);

    expect(compiled.compiledInstructions).toBe("Core instructions.\n\n## Rules\n\nFollow the rules.");
  });
});
