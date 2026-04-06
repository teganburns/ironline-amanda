import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  compilePromptGraphVariant,
  createPromptGraphNodes,
  normalizePromptGraphNodes,
  promptGraphNodeTypeLabels,
} from "./prompt-graph-compiler";
import { formatJsonDocument } from "./json";
import type {
  CompiledPromptPreview,
  PromptGraphNode,
  PromptGraphNodeInput,
  PromptGraphNodePatch,
  PromptGraphVariant,
  PromptGraphVariantInput,
  PromptGraphVariantPatch,
} from "./types";

const DEFAULT_AGENT_ID = "amanda-core";
const DEFAULT_PUBLISHED_VARIANT_ID = "amanda-core-default";
const LEGACY_CONTEXT_PATH = join(import.meta.dir, "..", "..", "context.md");

interface StoredPromptGraphVariant {
  id: string;
  name: string;
  agentId: string;
  createdAt: string;
  updatedAt: string;
  nodes: PromptGraphNode[];
}

interface PromptGraphDocument {
  agentId: string;
  publishedVariantId: string;
  variants: StoredPromptGraphVariant[];
}

function nowIso() {
  return new Date().toISOString();
}

function readLegacyContext(): string {
  if (!existsSync(LEGACY_CONTEXT_PATH)) return "";
  return readFileSync(LEGACY_CONTEXT_PATH, "utf-8").trim();
}

function getDefaultPromptGraphNodeInputs(): PromptGraphNodeInput[] {
  const legacyContext = readLegacyContext();

  return [
    {
      type: "core",
      title: "Core Instructions",
      content: `
You are Amanda, an AI operations agent for Ironline. You are not a chatbot - you are an intelligent operator that sits between incoming communication and execution.

When you receive a message you follow this pipeline:
1. CLASSIFY - who is the sender, what role do they have, what are they asking? Is the request clear, ambiguous, or risky?
2. GATHER CONTEXT - use available tools to pull any relevant context (message history, contact info, etc.)
3. DECIDE - execute directly if the request is clear and low-risk. Ask for clarification if ambiguous. Escalate if out of scope or risky.
4. ACT - call the appropriate tool to respond (send_message, send_image, send_file) or log and route to a human.

CRITICAL: You are not a chat interface. Outputting text does nothing - the sender will never see it. Your ONLY way to communicate with a sender is by calling send_message (or send_image/send_file). Every conversation must end with a tool call to send a reply, or a deliberate decision not to respond (with a reason logged as your final text output).

Note: For some messages a brief holding reply has already been sent automatically before you ran. Your reply is the real, substantive response - make it count.
      `.trim(),
    },
    {
      type: "rules",
      title: "Reply Guidelines",
      content: `
- Reply like a human would over text. Most replies should be one sentence. "Sure, what's the question?" is a complete, correct response to "Hey, quick question." Do not anticipate, list options, or explain your capabilities unless directly asked.
- Never use bullet points, numbered lists, headers, or em dashes in replies.
- Match the sender's emotional tone. If they express excitement, happiness, or enthusiasm, reflect that back with an emoji or matching energy.
- Do not add context, caveats, or follow-up offers to a reply unless the sender's message actually calls for it.
- When in doubt, ask a clarifying question rather than guessing.
- Never take irreversible actions without sufficient context.
- If a request is outside your current capabilities, say so clearly and suggest next steps.
- NEVER invent or guess facts about Ironline, its products, team, or URLs. Only state what is in your context below.
      `.trim(),
    },
    {
      type: "rules",
      title: "Privacy and Data Isolation",
      content: `
- You are handling private conversations. Treat everything as confidential.
- You may only share a sender's own conversation history back with them - never another person's messages.
- Never reveal the contents of other chats, who else has contacted Ironline, or anything another person has told you.
- Never read or share another contact's memory entry with the current sender. Only read the current sender's own memory key.
- If asked about other people's conversations or data, decline clearly: "I can't share information from other conversations."
- When using get_messages or search_messages, only do so in the context of the current sender's own chat.
- When using list_chats, do not relay the names or details of other conversations to the sender.
      `.trim(),
    },
    {
      type: "tooling",
      title: "Memory Workflow",
      content: `
- At the start of every conversation, call memory_get_user with user_key=sender's phone and content_type="profile" to load their contact summary.
- Always pass user_key = the sender's phone number (for example +13128344710) or email when storing memories.
- Always pass source_chat_id = the Chat ID from the conversation context.
- Pass source_type="group" if the history shows multiple participants besides you and the sender; otherwise "1:1".
- To update a contact's profile summary, call memory_store with content_type="profile".
- To add a new note or event, use content_type="text".
- Images are pre-analyzed before you run and their descriptions are provided as text in the message context. They are already stored in memory - you do not need to call memory_store for images.
- When you see "[Image sent - call memory_search...]" in the conversation history, call memory_search with the sender's user_key and content_type="image" before answering visual questions.
- Use memory_search to find relevant past context by meaning, always scoped to the current sender's user_key.
- Never call memory tools with another sender's user_key.

Vector memory tools: memory_store / memory_search / memory_get_user / memory_delete
      `.trim(),
    },
    {
      type: "context",
      title: promptGraphNodeTypeLabels.context,
      content: legacyContext || "No company context has been defined yet.",
    },
  ];
}

function createStoredVariant(
  input: PromptGraphVariantInput & { agentId: string; id?: string; createdAt?: string; updatedAt?: string }
): StoredPromptGraphVariant {
  const createdAt = input.createdAt ?? nowIso();
  const updatedAt = input.updatedAt ?? createdAt;
  const nodes = input.nodes?.length ? createPromptGraphNodes(input.nodes) : createPromptGraphNodes(getDefaultPromptGraphNodeInputs());

  return {
    id: input.id ?? randomUUID(),
    name: input.name.trim() || "Untitled Variant",
    agentId: input.agentId,
    createdAt,
    updatedAt,
    nodes,
  };
}

function getDefaultPromptGraphDocument(agentId = DEFAULT_AGENT_ID): PromptGraphDocument {
  const createdAt = nowIso();

  return {
    agentId,
    publishedVariantId: DEFAULT_PUBLISHED_VARIANT_ID,
    variants: [
      createStoredVariant({
        id: DEFAULT_PUBLISHED_VARIANT_ID,
        name: "Published Default",
        agentId,
        createdAt,
        updatedAt: createdAt,
      }),
    ],
  };
}

function toPublicVariant(document: PromptGraphDocument, variant: StoredPromptGraphVariant): PromptGraphVariant {
  return {
    ...variant,
    isPublished: document.publishedVariantId === variant.id,
    nodes: normalizePromptGraphNodes(variant.nodes),
  };
}

function fromPublicNodes(nodes: PromptGraphNode[]): PromptGraphNode[] {
  return normalizePromptGraphNodes(
    nodes.map((node, index) => ({
      ...node,
      title: node.title.trim() || promptGraphNodeTypeLabels[node.type],
      content: node.content,
      order: index,
    }))
  );
}

export function getPromptGraphRootDir(): string {
  return process.env.IRONLINE_PROMPT_GRAPH_ROOT_DIR ?? join(import.meta.dir, "..", "..", "studio", "prompt-graphs");
}

export function getPromptGraphFilePath(agentId = DEFAULT_AGENT_ID): string {
  return join(getPromptGraphRootDir(), `${agentId}.json`);
}

function ensurePromptGraphRoot() {
  mkdirSync(getPromptGraphRootDir(), { recursive: true });
}

function readPromptGraphDocument(agentId = DEFAULT_AGENT_ID): PromptGraphDocument {
  const path = getPromptGraphFilePath(agentId);
  if (!existsSync(path)) {
    return getDefaultPromptGraphDocument(agentId);
  }

  try {
    const parsed = JSON.parse(readFileSync(path, "utf-8")) as PromptGraphDocument;
    if (!parsed.variants?.length) {
      return getDefaultPromptGraphDocument(agentId);
    }
    return parsed;
  } catch {
    return getDefaultPromptGraphDocument(agentId);
  }
}

async function writePromptGraphDocument(document: PromptGraphDocument): Promise<void> {
  ensurePromptGraphRoot();
  await writeFile(getPromptGraphFilePath(document.agentId), await formatJsonDocument(document), "utf-8");
}

export class PromptGraphStore {
  constructor(private readonly agentId = DEFAULT_AGENT_ID) {}

  listVariants(): PromptGraphVariant[] {
    const document = readPromptGraphDocument(this.agentId);
    return document.variants.map((variant) => toPublicVariant(document, variant));
  }

  getVariant(variantId: string): PromptGraphVariant | null {
    const document = readPromptGraphDocument(this.agentId);
    const variant = document.variants.find((item) => item.id === variantId);
    return variant ? toPublicVariant(document, variant) : null;
  }

  getPublishedVariant(): PromptGraphVariant {
    const document = readPromptGraphDocument(this.agentId);
    const variant =
      document.variants.find((item) => item.id === document.publishedVariantId) ??
      document.variants[0] ??
      getDefaultPromptGraphDocument(this.agentId).variants[0];

    return toPublicVariant(document, variant);
  }

  async createVariant(input: PromptGraphVariantInput): Promise<PromptGraphVariant> {
    const document = readPromptGraphDocument(this.agentId);
    const variant = createStoredVariant({
      ...input,
      agentId: input.agentId ?? this.agentId,
    });

    const next: PromptGraphDocument = {
      ...document,
      variants: [variant, ...document.variants],
    };
    await writePromptGraphDocument(next);
    return toPublicVariant(next, variant);
  }

  async updateVariant(variantId: string, patch: PromptGraphVariantPatch): Promise<PromptGraphVariant> {
    const document = readPromptGraphDocument(this.agentId);
    const current = document.variants.find((item) => item.id === variantId);
    if (!current) {
      throw new Error(`Prompt graph variant ${variantId} not found`);
    }

    const nextVariant: StoredPromptGraphVariant = {
      ...current,
      name: patch.name?.trim() ? patch.name.trim() : current.name,
      updatedAt: nowIso(),
    };

    const next: PromptGraphDocument = {
      ...document,
      variants: document.variants.map((item) => (item.id === variantId ? nextVariant : item)),
    };
    await writePromptGraphDocument(next);
    return toPublicVariant(next, nextVariant);
  }

  async deleteVariant(variantId: string): Promise<PromptGraphVariant[]> {
    const document = readPromptGraphDocument(this.agentId);
    if (document.variants.length === 1) {
      throw new Error("Cannot delete the only prompt graph variant");
    }

    const remaining = document.variants.filter((item) => item.id !== variantId);
    if (remaining.length === document.variants.length) {
      throw new Error(`Prompt graph variant ${variantId} not found`);
    }

    const next: PromptGraphDocument = {
      ...document,
      publishedVariantId:
        document.publishedVariantId === variantId
          ? remaining[0]!.id
          : document.publishedVariantId,
      variants: remaining,
    };
    await writePromptGraphDocument(next);
    return next.variants.map((variant) => toPublicVariant(next, variant));
  }

  async publishVariant(variantId: string): Promise<PromptGraphVariant> {
    const document = readPromptGraphDocument(this.agentId);
    const variant = document.variants.find((item) => item.id === variantId);
    if (!variant) {
      throw new Error(`Prompt graph variant ${variantId} not found`);
    }

    const next: PromptGraphDocument = {
      ...document,
      publishedVariantId: variantId,
    };
    await writePromptGraphDocument(next);
    return toPublicVariant(next, variant);
  }

  async createNode(variantId: string, input: PromptGraphNodeInput): Promise<PromptGraphVariant> {
    const document = readPromptGraphDocument(this.agentId);
    const variant = document.variants.find((item) => item.id === variantId);
    if (!variant) {
      throw new Error(`Prompt graph variant ${variantId} not found`);
    }

    const nextNode: PromptGraphNode = {
      id: randomUUID(),
      type: input.type,
      title: input.title.trim() || promptGraphNodeTypeLabels[input.type],
      content: input.content,
      enabled: input.enabled ?? true,
      order: variant.nodes.length,
    };

    const nextVariant: StoredPromptGraphVariant = {
      ...variant,
      updatedAt: nowIso(),
      nodes: fromPublicNodes([...variant.nodes, nextNode]),
    };

    const next: PromptGraphDocument = {
      ...document,
      variants: document.variants.map((item) => (item.id === variantId ? nextVariant : item)),
    };
    await writePromptGraphDocument(next);
    return toPublicVariant(next, nextVariant);
  }

  async updateNode(variantId: string, nodeId: string, patch: PromptGraphNodePatch): Promise<PromptGraphVariant> {
    const document = readPromptGraphDocument(this.agentId);
    const variant = document.variants.find((item) => item.id === variantId);
    if (!variant) {
      throw new Error(`Prompt graph variant ${variantId} not found`);
    }

    const existing = variant.nodes.find((item) => item.id === nodeId);
    if (!existing) {
      throw new Error(`Prompt graph node ${nodeId} not found`);
    }

    const nextVariant: StoredPromptGraphVariant = {
      ...variant,
      updatedAt: nowIso(),
      nodes: fromPublicNodes(
        variant.nodes.map((node) =>
          node.id === nodeId
            ? {
                ...node,
                type: patch.type ?? node.type,
                title: patch.title?.trim() || (patch.type ? promptGraphNodeTypeLabels[patch.type] : node.title),
                content: patch.content ?? node.content,
                enabled: patch.enabled ?? node.enabled,
              }
            : node
        )
      ),
    };

    const next: PromptGraphDocument = {
      ...document,
      variants: document.variants.map((item) => (item.id === variantId ? nextVariant : item)),
    };
    await writePromptGraphDocument(next);
    return toPublicVariant(next, nextVariant);
  }

  async deleteNode(variantId: string, nodeId: string): Promise<PromptGraphVariant> {
    const document = readPromptGraphDocument(this.agentId);
    const variant = document.variants.find((item) => item.id === variantId);
    if (!variant) {
      throw new Error(`Prompt graph variant ${variantId} not found`);
    }

    const nextNodes = variant.nodes.filter((node) => node.id !== nodeId);
    const nextVariant: StoredPromptGraphVariant = {
      ...variant,
      updatedAt: nowIso(),
      nodes: fromPublicNodes(nextNodes),
    };

    const next: PromptGraphDocument = {
      ...document,
      variants: document.variants.map((item) => (item.id === variantId ? nextVariant : item)),
    };
    await writePromptGraphDocument(next);
    return toPublicVariant(next, nextVariant);
  }

  async reorderNodes(variantId: string, orderedNodeIds: string[]): Promise<PromptGraphVariant> {
    const document = readPromptGraphDocument(this.agentId);
    const variant = document.variants.find((item) => item.id === variantId);
    if (!variant) {
      throw new Error(`Prompt graph variant ${variantId} not found`);
    }

    const byId = new Map(variant.nodes.map((node) => [node.id, node]));
    const orderedNodes = orderedNodeIds
      .map((nodeId) => byId.get(nodeId))
      .filter((node): node is PromptGraphNode => Boolean(node));

    if (orderedNodes.length !== variant.nodes.length) {
      throw new Error("Node reorder payload must include every node id exactly once");
    }

    const nextVariant: StoredPromptGraphVariant = {
      ...variant,
      updatedAt: nowIso(),
      nodes: fromPublicNodes(orderedNodes),
    };

    const next: PromptGraphDocument = {
      ...document,
      variants: document.variants.map((item) => (item.id === variantId ? nextVariant : item)),
    };
    await writePromptGraphDocument(next);
    return toPublicVariant(next, nextVariant);
  }

  compileVariant(variantId: string): CompiledPromptPreview {
    const variant = this.getVariant(variantId);
    if (!variant) {
      throw new Error(`Prompt graph variant ${variantId} not found`);
    }

    return compilePromptGraphVariant(variant);
  }
}

export function compilePublishedPromptGraph(agentId = DEFAULT_AGENT_ID): {
  variant: PromptGraphVariant;
  compiledInstructions: string;
} {
  const store = new PromptGraphStore(agentId);
  const variant = store.getPublishedVariant();
  return {
    variant,
    compiledInstructions: compilePromptGraphVariant(variant).compiledInstructions,
  };
}
