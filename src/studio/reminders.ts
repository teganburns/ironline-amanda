import * as chrono from "chrono-node";
import { randomUUID } from "node:crypto";
import { scheduleTemporalJob } from "./temporal";
import { StudioRunStore } from "./run-store";
import type {
  JobRecord,
  ReminderJobPayload,
  ReminderJobPayload as ReminderPayload,
  ReminderTarget,
  ReminderSender,
  ReminderSourceChat,
} from "./types";

export interface ReminderScheduleInput {
  messageText: string;
  requestedTime?: string;
  executeAt?: string;
  currentTime?: string;
  timezone?: string;
  sourceChat: ReminderSourceChat;
  sender: ReminderSender;
  target?: ReminderTarget;
}

export interface ScheduledReminderResult {
  job: JobRecord;
  reminderId: string;
  executeAt: string;
  targetSummary: string;
}

export class ReminderClarificationError extends Error {
  readonly code = "reminder_clarification";

  constructor(message: string) {
    super(message);
    this.name = "ReminderClarificationError";
  }
}

export class ReminderPastTimeError extends Error {
  readonly code = "reminder_past_time";

  constructor(message: string) {
    super(message);
    this.name = "ReminderPastTimeError";
  }
}

function getResolvedTimezone(timezone?: string): string {
  return timezone?.trim() || Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Los_Angeles";
}

function parseReferenceTime(currentTime?: string): Date {
  if (!currentTime) return new Date();
  const parsed = new Date(currentTime);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

function looksLikeHourOnlyPhrase(input: string): boolean {
  return /^(?:at\s+)?\d{1,2}(?::\d{2})?$/i.test(input.trim()) && !/\b(am|pm)\b/i.test(input);
}

function ensureReminderMessage(messageText: string): string {
  const normalized = messageText.trim();
  if (!normalized) {
    throw new ReminderClarificationError("Please include the reminder message you want me to send.");
  }
  return normalized;
}

export function summarizeReminderTarget(target: ReminderTarget, sender?: ReminderSender): string {
  if (target.summary?.trim()) return target.summary.trim();
  if (target.recipient?.trim() && target.recipient.trim() !== sender?.identifier) {
    return target.recipient.trim();
  }
  if (sender?.name?.trim()) return sender.name.trim();
  if (target.recipient?.trim()) return target.recipient.trim();
  if (target.chatId?.trim()) return target.chatId.trim();
  return "the current chat";
}

export function resolveReminderExecuteAt(input: ReminderScheduleInput): {
  executeAt: string;
  requestedTime: string;
  timezone: string;
} {
  const timezone = getResolvedTimezone(input.timezone);
  const referenceTime = parseReferenceTime(input.currentTime);

  if (input.executeAt?.trim()) {
    const resolved = new Date(input.executeAt);
    if (Number.isNaN(resolved.getTime())) {
      throw new ReminderClarificationError("I couldn't understand that reminder time. Please give me a specific future date or time.");
    }
    if (resolved.getTime() <= referenceTime.getTime()) {
      throw new ReminderPastTimeError("That reminder time is in the past. Please give me a future date or time.");
    }
    return {
      executeAt: resolved.toISOString(),
      requestedTime: input.requestedTime?.trim() || input.executeAt,
      timezone,
    };
  }

  const requestedTime = input.requestedTime?.trim();
  if (!requestedTime) {
    throw new ReminderClarificationError("Please tell me when you want the reminder.");
  }

  if (looksLikeHourOnlyPhrase(requestedTime)) {
    throw new ReminderClarificationError("Please include AM or PM for that reminder time.");
  }

  const results = chrono.parse(requestedTime, referenceTime, {
    forwardDate: true,
  });
  const first = results[0];

  if (!first) {
    throw new ReminderClarificationError("I couldn't understand that reminder time. Please give me a specific future date or time.");
  }

  if (!first.start.isCertain("hour")) {
    throw new ReminderClarificationError("Please include a specific time for that reminder.");
  }

  const resolved = first.start.date();
  if (resolved.getTime() <= referenceTime.getTime()) {
    throw new ReminderPastTimeError("That reminder time is in the past. Please give me a future date or time.");
  }

  return {
    executeAt: resolved.toISOString(),
    requestedTime,
    timezone,
  };
}

export function buildReminderPayload(input: ReminderScheduleInput): {
  executeAt: string;
  payload: ReminderPayload;
} {
  const messageText = ensureReminderMessage(input.messageText);
  const resolved = resolveReminderExecuteAt(input);
  const target: ReminderTarget = {
    recipient: input.target?.recipient?.trim() || input.sender.identifier,
    chatId: input.target?.chatId?.trim() || input.sourceChat.chatId,
    service: input.target?.service?.trim() || input.sourceChat.service,
    summary: input.target?.summary?.trim() || summarizeReminderTarget(input.target ?? {}, input.sender),
  };

  return {
    executeAt: resolved.executeAt,
    payload: {
      messageText,
      requestedTime: resolved.requestedTime,
      sourceChat: {
        chatId: input.sourceChat.chatId,
        service: input.sourceChat.service,
      },
      sender: {
        identifier: input.sender.identifier,
        name: input.sender.name ?? null,
      },
      target,
      timezone: resolved.timezone,
    },
  };
}

export async function scheduleReminderJob(
  input: ReminderScheduleInput,
  runStore = new StudioRunStore()
): Promise<ScheduledReminderResult> {
  const built = buildReminderPayload(input);
  const scheduled = await scheduleTemporalJob(
    {
      id: `reminder-${randomUUID()}`,
      jobType: "reminder.send",
      executeAt: built.executeAt,
      payload: built.payload,
      retryPolicy: {
        maxAttempts: 3,
        backoffSeconds: 60,
      },
      dedupeKey: `reminder:${built.payload.target.chatId ?? built.payload.target.recipient}:${built.executeAt}:${built.payload.messageText}`,
      status: "scheduled",
    },
    {
      allowLocalFallback: false,
    }
  );

  const job = await runStore.saveJob(
    {
      id: scheduled.remoteId,
      jobType: "reminder.send",
      executeAt: built.executeAt,
      payload: built.payload,
      retryPolicy: {
        maxAttempts: 3,
        backoffSeconds: 60,
      },
      dedupeKey: `reminder:${built.payload.target.chatId ?? built.payload.target.recipient}:${built.executeAt}:${built.payload.messageText}`,
      status: "scheduled",
    },
    scheduled.backend
  );

  return {
    job,
    reminderId: job.id,
    executeAt: built.executeAt,
    targetSummary: summarizeReminderTarget(built.payload.target, built.payload.sender),
  };
}

export function isReminderPayload(payload: unknown): payload is ReminderJobPayload {
  if (!payload || typeof payload !== "object") return false;
  const candidate = payload as Record<string, unknown>;
  return (
    typeof candidate.messageText === "string" &&
    typeof candidate.requestedTime === "string" &&
    typeof candidate.timezone === "string" &&
    typeof candidate.sourceChat === "object" &&
    typeof candidate.sender === "object" &&
    typeof candidate.target === "object"
  );
}
