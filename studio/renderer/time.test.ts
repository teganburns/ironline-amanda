import { describe, expect, test } from "bun:test";
import { formatCompactRelativeTime, formatExactTimestamp, truncateMiddle } from "./time";

describe("renderer time helpers", () => {
  test("formats recent past times compactly", () => {
    const now = new Date("2026-04-06T12:00:00.000Z").getTime();

    expect(formatCompactRelativeTime("2026-04-06T11:59:20.000Z", now)).toBe("40s ago");
    expect(formatCompactRelativeTime("2026-04-06T11:55:00.000Z", now)).toBe("5m ago");
    expect(formatCompactRelativeTime("2026-04-06T10:00:00.000Z", now)).toBe("2h ago");
  });

  test("formats future times compactly", () => {
    const now = new Date("2026-04-06T12:00:00.000Z").getTime();

    expect(formatCompactRelativeTime("2026-04-06T12:00:20.000Z", now)).toBe("in 20s");
    expect(formatCompactRelativeTime("2026-04-06T12:04:00.000Z", now)).toBe("in 4m");
  });

  test("falls back to an exact label for older timestamps", () => {
    const now = new Date("2026-04-20T12:00:00.000Z").getTime();
    const exact = formatCompactRelativeTime("2026-04-06T12:00:00.000Z", now);

    expect(exact).toBe(formatExactTimestamp("2026-04-06T12:00:00.000Z"));
  });

  test("truncates long identifiers in the middle", () => {
    expect(truncateMiddle("cf4856b4-8dc4-4b3f-8c13-f7d27662917f")).toBe("cf4856b4...62917f");
  });
});
