import { describe, expect, test } from "bun:test";
import {
  BROWSER_TARGET_ID,
  createBrowserActionLogEntry,
  createBrowserHistorySeed,
  extractBrowserToolPayload,
  parseBrowserScreenshotPreview,
  parseBrowserSnapshotPreview,
} from "./browser-console";

describe("browser console helpers", () => {
  test("extracts screenshot previews from MCP image content", () => {
    const preview = parseBrowserScreenshotPreview({
      rawResponse: {
        content: [
          {
            type: "image",
            mimeType: "image/png",
            data: "abc123",
          },
        ],
      },
    });

    expect(preview).toEqual({
      mimeType: "image/png",
      data: "abc123",
      src: "data:image/png;base64,abc123",
    });
  });

  test("extracts snapshot previews from MCP text content", () => {
    const preview = parseBrowserSnapshotPreview({
      rawResponse: {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              title: "Example Domain",
              text: "Example body",
            }),
          },
        ],
      },
    });

    expect(preview).toEqual({
      title: "Example Domain",
      text: "Example body",
      truncated: false,
    });
  });

  test("summarizes browser success entries with tool-specific copy", () => {
    const entry = createBrowserActionLogEntry({
      toolName: "browser_navigate",
      args: {
        url: "https://example.com/docs",
      },
      result: {
        targetId: BROWSER_TARGET_ID,
        actionType: "tool",
        ok: true,
        summary: "Invoked tool browser_navigate",
        formattedJson: "{}",
        rawResponse: {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                url: "https://example.com/docs",
                title: "Docs",
              }),
            },
          ],
        },
      },
    });

    expect(entry.summary).toBe("Opened example.com · Docs");
    expect(entry.status).toBe("ok");
  });

  test("seeds browser history only from browser tool invocations", () => {
    const seeded = createBrowserHistorySeed([
      {
        id: "browser-entry",
        createdAt: "2026-04-07T10:00:00.000Z",
        targetId: BROWSER_TARGET_ID,
        actionType: "tool",
        ok: true,
        summary: "Invoked tool browser_snapshot",
        formattedJson: "{}",
        rawResponse: {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                title: "Inbox",
                text: "Messages",
              }),
            },
          ],
        },
      },
      {
        id: "other-target",
        createdAt: "2026-04-07T10:01:00.000Z",
        targetId: "context-local",
        actionType: "tool",
        ok: true,
        summary: "Invoked tool memory_search",
        formattedJson: "{}",
        rawResponse: {},
      },
    ]);

    expect(seeded).toHaveLength(1);
    expect(seeded[0]?.toolName).toBe("browser_snapshot");
  });

  test("parses JSON text content payloads", () => {
    const payload = extractBrowserToolPayload({
      rawResponse: {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              clicked: true,
              selector: "#submit",
            }),
          },
        ],
      },
    });

    expect(payload).toEqual({
      clicked: true,
      selector: "#submit",
    });
  });
});
