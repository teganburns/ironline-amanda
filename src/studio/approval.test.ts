import { describe, expect, test } from "bun:test";
import { normalizeApprovalRule, resolveApprovalMode } from "./approval";

describe("approval helpers", () => {
  test("normalizeApprovalRule deduplicates scopes", () => {
    expect(
      normalizeApprovalRule({
        mode: "suggest",
        connectorScope: ["imessage", "imessage"],
        toolScope: ["send_message", "send_message"],
      })
    ).toEqual({
      mode: "suggest",
      connectorScope: ["imessage"],
      toolScope: ["send_message"],
      actionScope: [],
    });
  });

  test("resolveApprovalMode favors explicit mode first", () => {
    expect(resolveApprovalMode("always_require", "autonomous", [], "imessage")).toBe("always_require");
  });

  test("resolveApprovalMode falls back to matching rule", () => {
    expect(
      resolveApprovalMode(
        undefined,
        "autonomous",
        [{ mode: "suggest", connectorScope: ["imessage"] }],
        "imessage"
      )
    ).toBe("suggest");
  });
});
