import { useSyncExternalStore } from "react";

const LIVE_TIME_INTERVAL_MS = 1_000;
const listeners = new Set<() => void>();
let nowSnapshot = Date.now();
let timerId: number | null = null;
let visibilityListenerInstalled = false;

function notifyListeners() {
  nowSnapshot = Date.now();
  for (const listener of listeners) {
    listener();
  }
}

function stopTimer() {
  if (typeof window === "undefined" || timerId === null) return;
  window.clearInterval(timerId);
  timerId = null;
}

function startTimer() {
  if (typeof window === "undefined" || timerId !== null) return;
  timerId = window.setInterval(() => {
    if (typeof document !== "undefined" && document.visibilityState === "hidden") {
      return;
    }
    notifyListeners();
  }, LIVE_TIME_INTERVAL_MS);
}

function handleVisibilityChange() {
  if (typeof document === "undefined") return;

  if (document.visibilityState === "visible") {
    notifyListeners();
    if (listeners.size > 0) {
      startTimer();
    }
    return;
  }

  stopTimer();
}

function subscribe(listener: () => void) {
  listeners.add(listener);

  if (typeof document !== "undefined" && !visibilityListenerInstalled) {
    document.addEventListener("visibilitychange", handleVisibilityChange);
    visibilityListenerInstalled = true;
  }

  if (typeof document === "undefined" || document.visibilityState === "visible") {
    startTimer();
  }

  return () => {
    listeners.delete(listener);
    if (!listeners.size) {
      stopTimer();
    }
  };
}

function getNowSnapshot() {
  return nowSnapshot;
}

export function useLiveNow() {
  return useSyncExternalStore(subscribe, getNowSnapshot, getNowSnapshot);
}

export function formatExactTimestamp(value: string | number | Date) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Unknown time";
  }

  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatRelativeUnit(amount: number, unit: string, suffix: "ago" | "in") {
  if (suffix === "in") {
    return `in ${amount}${unit}`;
  }

  return `${amount}${unit} ago`;
}

export function formatCompactRelativeTime(value: string | number | Date, now = Date.now()) {
  const timestamp = new Date(value).getTime();
  if (Number.isNaN(timestamp)) {
    return "Unknown time";
  }

  const deltaMs = timestamp - now;
  const future = deltaMs > 0;
  const absMs = Math.abs(deltaMs);

  if (absMs < 5_000) {
    return "now";
  }

  if (absMs < 60_000) {
    return formatRelativeUnit(Math.max(1, Math.round(absMs / 1_000)), "s", future ? "in" : "ago");
  }

  if (absMs < 60 * 60_000) {
    return formatRelativeUnit(Math.max(1, Math.round(absMs / 60_000)), "m", future ? "in" : "ago");
  }

  if (absMs < 24 * 60 * 60_000) {
    return formatRelativeUnit(Math.max(1, Math.round(absMs / (60 * 60_000))), "h", future ? "in" : "ago");
  }

  if (absMs < 7 * 24 * 60 * 60_000) {
    return formatRelativeUnit(Math.max(1, Math.round(absMs / (24 * 60 * 60_000))), "d", future ? "in" : "ago");
  }

  return formatExactTimestamp(timestamp);
}

export function truncateMiddle(value: string, head = 8, tail = 6) {
  if (value.length <= head + tail + 1) {
    return value;
  }

  return `${value.slice(0, head)}...${value.slice(-tail)}`;
}
