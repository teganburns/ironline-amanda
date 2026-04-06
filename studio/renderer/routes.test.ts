import { describe, expect, test } from "bun:test";
import { getPageTitle, getRoutePresentation, isNavItemActive, resolveBackNavigation } from "./routes";

describe("studio renderer routes", () => {
  test("marks nested route paths as active for their parent nav item", () => {
    expect(isNavItemActive("/runs/abc123", "/runs")).toBe(true);
    expect(isNavItemActive("/jobs/abc123", "/jobs")).toBe(true);
    expect(isNavItemActive("/jobs/abc123", "/runs")).toBe(false);
  });

  test("treats overview as exact-only", () => {
    expect(isNavItemActive("/", "/")).toBe(true);
    expect(isNavItemActive("/runs", "/")).toBe(false);
  });

  test("maps detail routes to user-facing titles", () => {
    expect(getPageTitle("/runs/abc123")).toBe("Run Detail");
    expect(getPageTitle("/jobs/abc123")).toBe("Job Detail");
    expect(getPageTitle("/connectors")).toBe("Connectors");
    expect(getPageTitle("/mcps")).toBe("MCPs");
  });

  test("declares back metadata for drill-in routes", () => {
    expect(getRoutePresentation("/runs/abc123").backLink).toEqual({
      to: "/runs",
      label: "Runs",
    });
    expect(getRoutePresentation("/jobs/abc123").backLink).toEqual({
      to: "/jobs",
      label: "Jobs",
    });
    expect(getRoutePresentation("/runs").backLink).toBeNull();
  });

  test("prefers history for back navigation when a browser stack exists", () => {
    expect(resolveBackNavigation("/runs/abc123", { idx: 2 })).toEqual({
      mode: "history",
      label: "Runs",
    });
  });

  test("falls back to the parent route when opened directly", () => {
    expect(resolveBackNavigation("/jobs/abc123", { idx: 0 })).toEqual({
      mode: "route",
      to: "/jobs",
      label: "Jobs",
    });
  });
});
