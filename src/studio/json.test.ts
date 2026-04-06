import { describe, expect, test } from "bun:test";
import { formatJsonDocument } from "./json";

describe("studio json formatting", () => {
  test("formats JSON documents with a formatter library", async () => {
    const formatted = await formatJsonDocument({
      zebra: true,
      nested: {
        alpha: 1,
      },
    });

    expect(formatted).toContain('"nested": {');
    expect(formatted).toContain('"alpha": 1');
    expect(formatted.endsWith("\n")).toBe(true);
  });
});
