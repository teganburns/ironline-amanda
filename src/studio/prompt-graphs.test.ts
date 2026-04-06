import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { rmSync } from "node:fs";
import { PromptGraphStore } from "./prompt-graphs";

const originalPromptGraphRoot = process.env.IRONLINE_PROMPT_GRAPH_ROOT_DIR;

describe("PromptGraphStore", () => {
  beforeEach(() => {
    process.env.IRONLINE_PROMPT_GRAPH_ROOT_DIR = `/tmp/ironline-prompt-graphs-${Date.now()}`;
  });

  afterEach(() => {
    rmSync(process.env.IRONLINE_PROMPT_GRAPH_ROOT_DIR!, { recursive: true, force: true });
    process.env.IRONLINE_PROMPT_GRAPH_ROOT_DIR = originalPromptGraphRoot;
  });

  test("persists variants, publish semantics, and node reordering", async () => {
    const store = new PromptGraphStore("amanda-core");
    const initial = store.listVariants();
    expect(initial[0]?.isPublished).toBe(true);

    const created = await store.createVariant({
      name: "Sandbox",
      nodes: [
        {
          type: "core",
          title: "Core",
          content: "Sandbox instructions.",
          enabled: true,
        },
      ],
    });
    const withNode = await store.createNode(created.id, {
      type: "rules",
      title: "Rules",
      content: "Be precise.",
      enabled: true,
    });
    const reordered = await store.reorderNodes(
      created.id,
      withNode.nodes
        .map((node) => node.id)
        .reverse()
    );
    const published = await store.publishVariant(created.id);
    const compiled = store.compileVariant(created.id);

    expect(reordered.nodes[0]?.title).toBe("Rules");
    expect(published.isPublished).toBe(true);
    expect(store.getPublishedVariant().id).toBe(created.id);
    expect(compiled.compiledInstructions).toContain("## Rules");
    expect(compiled.compiledInstructions).toContain("Sandbox instructions.");
  });
});
