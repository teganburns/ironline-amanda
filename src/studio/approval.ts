import type { ApprovalMode, ApprovalRule } from "./types";

export function normalizeApprovalRule(rule: ApprovalRule): ApprovalRule {
  return {
    mode: rule.mode,
    connectorScope: [...new Set(rule.connectorScope ?? [])].sort(),
    toolScope: [...new Set(rule.toolScope ?? [])].sort(),
    actionScope: [...new Set(rule.actionScope ?? [])].sort(),
  };
}

export function resolveApprovalMode(
  explicitMode: ApprovalMode | undefined,
  defaultMode: ApprovalMode,
  rules: ApprovalRule[],
  connectorId?: string,
  toolName?: string
): ApprovalMode {
  if (explicitMode) return explicitMode;

  for (const rule of rules) {
    if (connectorId && rule.connectorScope?.length && !rule.connectorScope.includes(connectorId)) {
      continue;
    }
    if (toolName && rule.toolScope?.length && !rule.toolScope.includes(toolName)) {
      continue;
    }
    return rule.mode;
  }

  return defaultMode;
}
