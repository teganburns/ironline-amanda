export type StudioNavIcon =
  | "overview"
  | "runs"
  | "jobs"
  | "connectors"
  | "mcps"
  | "agent"
  | "observability";

export const navItems = [
  { to: "/", label: "Overview", icon: "overview" },
  { to: "/runs", label: "Runs", icon: "runs" },
  { to: "/jobs", label: "Jobs", icon: "jobs" },
  { to: "/connectors", label: "Connectors", icon: "connectors" },
  { to: "/mcps", label: "MCPs", icon: "mcps" },
  { to: "/agent", label: "Agent", icon: "agent" },
  { to: "/observability", label: "Observability", icon: "observability" },
] as const;

export interface RouteBackLink {
  to: string;
  label: string;
}

export interface RoutePresentation {
  title: string;
  backLink: RouteBackLink | null;
}

export type BackNavigationResolution =
  | {
      mode: "history";
      label: string;
    }
  | {
      mode: "route";
      to: string;
      label: string;
    }
  | null;

export function isNavItemActive(currentPath: string, targetPath: string) {
  if (targetPath === "/") {
    return currentPath === "/";
  }

  return currentPath === targetPath || currentPath.startsWith(`${targetPath}/`);
}

export function getRoutePresentation(pathname: string): RoutePresentation {
  if (pathname.startsWith("/runs/")) {
    return {
      title: "Run Detail",
      backLink: {
        to: "/runs",
        label: "Runs",
      },
    };
  }

  if (pathname.startsWith("/jobs/")) {
    return {
      title: "Job Detail",
      backLink: {
        to: "/jobs",
        label: "Jobs",
      },
    };
  }

  const match = navItems.find((item) => item.to === pathname);
  return {
    title: match?.label ?? "Amanda",
    backLink: null,
  };
}

export function getPageTitle(pathname: string) {
  return getRoutePresentation(pathname).title;
}

export function resolveBackNavigation(pathname: string, historyState?: unknown): BackNavigationResolution {
  const route = getRoutePresentation(pathname);
  if (!route.backLink) {
    return null;
  }

  const idx =
    historyState && typeof historyState === "object" && "idx" in historyState
      ? (historyState as { idx?: unknown }).idx
      : undefined;

  if (typeof idx === "number" && idx > 0) {
    return {
      mode: "history",
      label: route.backLink.label,
    };
  }

  return {
    mode: "route",
    to: route.backLink.to,
    label: route.backLink.label,
  };
}
