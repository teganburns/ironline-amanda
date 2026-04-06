import type { AgentDefinition } from "./types";
import { compilePublishedPromptGraph } from "./prompt-graphs";

export function getDefaultAgentDefinition(): AgentDefinition {
  return {
    id: "amanda-core",
    name: "Amanda Core",
    model: process.env.STANDARD_MODEL ?? "gpt-5.4",
    instructions: compilePublishedPromptGraph("amanda-core").compiledInstructions,
    enabledTools: [
      "send_message",
      "send_image",
      "send_file",
      "get_messages",
      "search_messages",
      "memory_get_user",
      "memory_search",
      "memory_store",
      "memory_delete",
    ],
    defaultApprovalMode: "autonomous",
  };
}
