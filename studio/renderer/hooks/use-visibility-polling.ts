import { useEffect, useRef } from "react";

export function useVisibilityPolling(callback: () => void, pollMs: number | null | undefined, enabled = true) {
  const callbackRef = useRef(callback);

  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  useEffect(() => {
    if (!enabled || !pollMs || pollMs <= 0) {
      return;
    }

    let intervalId: number | null = null;

    function stopPolling() {
      if (typeof window === "undefined" || intervalId === null) return;
      window.clearInterval(intervalId);
      intervalId = null;
    }

    function startPolling() {
      if (typeof window === "undefined" || intervalId !== null) return;
      intervalId = window.setInterval(() => {
        callbackRef.current();
      }, pollMs);
    }

    function handleVisibilityChange() {
      if (typeof document === "undefined") {
        startPolling();
        return;
      }

      if (document.visibilityState === "visible") {
        callbackRef.current();
        startPolling();
        return;
      }

      stopPolling();
    }

    if (typeof document === "undefined" || document.visibilityState === "visible") {
      startPolling();
    }

    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", handleVisibilityChange);
    }

    return () => {
      stopPolling();
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", handleVisibilityChange);
      }
    };
  }, [enabled, pollMs]);
}
