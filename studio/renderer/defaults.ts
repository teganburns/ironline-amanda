import type { AgentRunJobPayload, JobSpec, RunRequest } from "../../src/studio/types";

const defaultSender = "+13128344710";
const defaultSenderName = "Tegan Burns";
const defaultChatId = `iMessage;-;${defaultSender}`;
const defaultService = "iMessage";

export const defaultRunRequest: RunRequest = {
  trigger: "manual",
  channel: "imessage",
  input: "",
  context: {
    sender: defaultSender,
    sender_name: defaultSenderName,
    chat_id: defaultChatId,
    service: defaultService,
  },
  approvalMode: "suggest",
};

export function createDefaultReminderJob(): JobSpec {
  const executeAt = new Date(Date.now() + 15 * 60_000).toISOString();
  return {
    jobType: "reminder.send",
    executeAt,
    payload: {
      messageText: "Reminder: follow up on the latest request.",
      requestedTime: executeAt,
      sourceChat: {
        chatId: defaultChatId,
        service: defaultService,
      },
      sender: {
        identifier: defaultSender,
        name: defaultSenderName,
      },
      target: {
        recipient: defaultSender,
        chatId: defaultChatId,
        service: defaultService,
        summary: defaultSenderName,
      },
      timezone: "America/Los_Angeles",
    },
    retryPolicy: {
      maxAttempts: 3,
      backoffSeconds: 60,
    },
  };
}

export function createDefaultAgentRunJob(): JobSpec {
  const payload: AgentRunJobPayload = {
    channel: "imessage",
    input: "Follow up on the latest request",
    context: {
      sender: defaultSender,
      sender_name: defaultSenderName,
      chat_id: defaultChatId,
      service: defaultService,
    },
  };

  return {
    jobType: "agent.run",
    executeAt: new Date(Date.now() + 15 * 60_000).toISOString(),
    payload,
    retryPolicy: {
      maxAttempts: 3,
      backoffSeconds: 60,
    },
  };
}

export const defaultJob = createDefaultReminderJob();
