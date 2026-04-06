import type { StudioNavIcon } from "../routes";

export function NavIcon({ icon }: { icon: StudioNavIcon }) {
  const common = {
    width: 16,
    height: 16,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.9,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };

  switch (icon) {
    case "overview":
      return (
        <svg {...common}>
          <path d="M3 11.5 12 4l9 7.5" />
          <path d="M6 10.5V20h12v-9.5" />
        </svg>
      );
    case "runs":
      return (
        <svg {...common}>
          <path d="M4 7h16" />
          <path d="M4 12h10" />
          <path d="M4 17h16" />
          <path d="m18 10 3 2-3 2" />
        </svg>
      );
    case "jobs":
      return (
        <svg {...common}>
          <rect x="4" y="5" width="16" height="15" rx="2" />
          <path d="M8 3v4" />
          <path d="M16 3v4" />
          <path d="M4 10h16" />
        </svg>
      );
    case "connectors":
      return (
        <svg {...common}>
          <path d="M9 8V5" />
          <path d="M15 8V5" />
          <path d="M8 11h8" />
          <path d="M12 11v8" />
          <path d="M7 8h10v3a3 3 0 0 1-3 3h-4a3 3 0 0 1-3-3Z" />
        </svg>
      );
    case "mcps":
      return (
        <svg {...common}>
          <path d="M4 7h6" />
          <path d="M4 12h8" />
          <path d="M4 17h6" />
          <path d="m15 8 5 4-5 4" />
          <path d="M12 12h8" />
        </svg>
      );
    case "agent":
      return (
        <svg {...common}>
          <path d="M4 7h16" />
          <path d="M8 7v10" />
          <path d="M16 7v6" />
          <circle cx="16" cy="17" r="3" />
        </svg>
      );
    case "observability":
      return (
        <svg {...common}>
          <path d="M4 19h16" />
          <path d="M7 16V9" />
          <path d="M12 16V5" />
          <path d="M17 16v-4" />
        </svg>
      );
  }
}
