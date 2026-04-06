import { useOutletContext } from "react-router-dom";
import type { StudioSnapshot } from "../../src/studio/types";

export interface ShellContextValue {
  snapshot: StudioSnapshot;
  refreshSnapshot(): Promise<StudioSnapshot | null>;
  snapshotBusy: boolean;
  startupError: string | null;
}

export function useShellContext() {
  return useOutletContext<ShellContextValue>();
}
