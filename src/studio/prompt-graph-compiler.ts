import type {
  CompiledPromptPreview,
  PromptGraphNode,
  PromptGraphNodeInput,
  PromptGraphNodeType,
  PromptGraphVariant,
} from "./types";

export const promptGraphNodeTypeLabels: Record<PromptGraphNodeType, string> = {
  core: "Core Instructions",
  context: "Company Context",
  rules: "Rules and Policies",
  examples: "Examples",
  tooling: "Tool Use Guidance",
};

export function normalizePromptGraphNodes(nodes: PromptGraphNode[]): PromptGraphNode[] {
  return [...nodes]
    .sort((left, right) => left.order - right.order)
    .map((node, index) => ({
      ...node,
      order: index,
    }));
}

export function createPromptGraphNodes(inputs: PromptGraphNodeInput[]): PromptGraphNode[] {
  return normalizePromptGraphNodes(
    inputs.map((node, index) => ({
      id: globalThis.crypto.randomUUID(),
      type: node.type,
      title: node.title.trim() || promptGraphNodeTypeLabels[node.type],
      content: node.content,
      enabled: node.enabled ?? true,
      order: index,
    }))
  );
}

function compilePromptGraphNode(node: PromptGraphNode): string {
  const content = node.content.trim();
  if (!content) return "";

  if (node.type === "core") {
    return content;
  }

  return `## ${node.title.trim() || promptGraphNodeTypeLabels[node.type]}\n\n${content}`;
}

export function compilePromptGraphNodes(nodes: PromptGraphNode[]): string {
  return normalizePromptGraphNodes(nodes)
    .filter((node) => node.enabled)
    .map(compilePromptGraphNode)
    .filter(Boolean)
    .join("\n\n");
}

export function compilePromptGraphVariant(variant: PromptGraphVariant): CompiledPromptPreview {
  return {
    variantId: variant.id,
    compiledInstructions: compilePromptGraphNodes(variant.nodes),
  };
}
