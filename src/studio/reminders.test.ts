import { describe, expect, test } from "bun:test";
import {
  ReminderClarificationError,
  ReminderPastTimeError,
  buildReminderPayload,
  resolveReminderExecuteAt,
} from "./reminders";

describe("reminder scheduling helpers", () => {
  test("parses a valid future reminder phrase", () => {
    const resolved = resolveReminderExecuteAt({
      messageText: "Stretch",
      requestedTime: "in 5 minutes",
      currentTime: "2026-04-06T12:00:00.000Z",
      timezone: "America/Los_Angeles",
      sourceChat: {
        chatId: "any;-;+13128344710",
        service: "iMessage",
      },
      sender: {
        identifier: "+13128344710",
        name: "Tegan Burns",
      },
    });

    expect(new Date(resolved.executeAt).toISOString()).toBe("2026-04-06T12:05:00.000Z");
  });

  test("requests clarification when the reminder time lacks a specific time", () => {
    expect(() =>
      resolveReminderExecuteAt({
        messageText: "Stretch",
        requestedTime: "tomorrow",
        currentTime: "2026-04-06T12:00:00.000Z",
        sourceChat: {
          chatId: "any;-;+13128344710",
          service: "iMessage",
        },
        sender: {
          identifier: "+13128344710",
          name: "Tegan Burns",
        },
      })
    ).toThrow(ReminderClarificationError);
  });

  test("rejects past reminder times", () => {
    expect(() =>
      resolveReminderExecuteAt({
        messageText: "Stretch",
        executeAt: "2026-04-06T11:59:00.000Z",
        currentTime: "2026-04-06T12:00:00.000Z",
        sourceChat: {
          chatId: "any;-;+13128344710",
          service: "iMessage",
        },
        sender: {
          identifier: "+13128344710",
          name: "Tegan Burns",
        },
      })
    ).toThrow(ReminderPastTimeError);
  });

  test("builds a reminder payload with same-chat defaults", () => {
    const built = buildReminderPayload({
      messageText: "Reminder: stretch.",
      requestedTime: "in 5 minutes",
      currentTime: "2026-04-06T12:00:00.000Z",
      timezone: "America/Los_Angeles",
      sourceChat: {
        chatId: "any;-;+13128344710",
        service: "iMessage",
      },
      sender: {
        identifier: "+13128344710",
        name: "Tegan Burns",
      },
    });

    expect(built.payload.target.recipient).toBe("+13128344710");
    expect(built.payload.target.chatId).toBe("any;-;+13128344710");
    expect(built.payload.messageText).toBe("Reminder: stretch.");
  });
});
