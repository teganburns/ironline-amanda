import type { JobSpec, RunRequest } from "../../src/studio/types";

export const defaultRunRequest: RunRequest = {
  trigger: "manual",
  channel: "imessage",
  input: "",
  context: {
    sender: "+13128344710",
    sender_name: "Tegan Burns",
  },
  approvalMode: "suggest",
};

export const defaultJob: JobSpec = {
  jobType: "follow-up",
  executeAt: new Date(Date.now() + 15 * 60_000).toISOString(),
  payload: {
    channel: "imessage",
    input: "Follow up on the latest request",
  },
  retryPolicy: {
    maxAttempts: 3,
    backoffSeconds: 60,
  },
};
