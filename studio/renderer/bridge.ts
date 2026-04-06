import { STUDIO_BRIDGE_CAPABILITIES, STUDIO_BRIDGE_VERSION } from "../../src/studio/bridge";
import type { BridgeInfo } from "../../src/studio/types";

const STALE_BRIDGE_MESSAGE = "Studio build is out of date. Rebuild and relaunch to refresh the Electron bridge.";

function createBridgeMismatchMessage(missingCapabilities: string[]) {
  if (!missingCapabilities.length) {
    return STALE_BRIDGE_MESSAGE;
  }

  return `${STALE_BRIDGE_MESSAGE} Missing: ${missingCapabilities.join(", ")}`;
}

type StudioBridgeApi = Window["ironlineStudio"];

export function callBridgeMethod<T>(method: keyof StudioBridgeApi & string, ...args: unknown[]): T {
  const bridge = window.ironlineStudio as Record<string, unknown> | undefined;
  const handler = bridge?.[method];
  if (typeof handler !== "function") {
    throw new Error(createBridgeMismatchMessage([method]));
  }

  return (handler as (...methodArgs: unknown[]) => T)(...args);
}

export async function getBridgeDiagnostics(): Promise<
  | { ok: true; info: BridgeInfo }
  | { ok: false; message: string; missingCapabilities: string[] }
> {
  const bridge = window.ironlineStudio as Record<string, unknown> | undefined;
  const availableCapabilities = Object.entries(bridge ?? {})
    .filter(([, value]) => typeof value === "function")
    .map(([key]) => key);
  const missingCapabilities = STUDIO_BRIDGE_CAPABILITIES.filter(
    (capability) => !availableCapabilities.includes(capability)
  );

  if (missingCapabilities.length) {
    return {
      ok: false,
      message: createBridgeMismatchMessage(missingCapabilities),
      missingCapabilities,
    };
  }

  try {
    const info = await callBridgeMethod<Promise<BridgeInfo>>("getBridgeInfo");
    const missingFromInfo = STUDIO_BRIDGE_CAPABILITIES.filter(
      (capability) => !info.capabilities.includes(capability)
    );

    if (info.version !== STUDIO_BRIDGE_VERSION || missingFromInfo.length) {
      return {
        ok: false,
        message: createBridgeMismatchMessage(missingFromInfo),
        missingCapabilities: missingFromInfo,
      };
    }

    return {
      ok: true,
      info,
    };
  } catch (error: any) {
    return {
      ok: false,
      message: error?.message ?? STALE_BRIDGE_MESSAGE,
      missingCapabilities,
    };
  }
}
