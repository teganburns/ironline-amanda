import type { CSSProperties, ReactNode } from "react";
import type { FlowNodeData, FlowNodeType } from "../../../src/studio/types";
import { flowNodeTypeDescriptions, flowNodeTypeLabels } from "../flow-editor";

export const flowNodeTypeColors: Record<FlowNodeType, string> = {
  trigger: "#71b7f5",
  classify: "#a596f1",
  context: "#c6a8ee",
  agent: "#ee9dc5",
  tool: "#f4b69d",
  logic: "#fdd597",
  output: "#5cb88f",
};

export function FlowNodeIcon({ type }: { type: FlowNodeType }) {
  const common = {
    width: 14,
    height: 14,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };

  switch (type) {
    case "trigger":
      return (
        <svg {...common}>
          <path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z" />
        </svg>
      );
    case "classify":
      return (
        <svg {...common}>
          <path d="M22 3H2l8 9.46V19l4 2v-8.54L22 3z" />
        </svg>
      );
    case "context":
      return (
        <svg {...common}>
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <path d="M14 2v6h6" />
          <path d="M16 13H8" />
          <path d="M16 17H8" />
          <path d="M10 9H8" />
        </svg>
      );
    case "agent":
      return (
        <svg {...common}>
          <circle cx="12" cy="8" r="4" />
          <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
        </svg>
      );
    case "tool":
      return (
        <svg {...common}>
          <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
        </svg>
      );
    case "logic":
      return (
        <svg {...common}>
          <path d="M8 3H5a2 2 0 0 0-2 2v3" />
          <path d="M21 8V5a2 2 0 0 0-2-2h-3" />
          <path d="M3 16v3a2 2 0 0 0 2 2h3" />
          <path d="M16 21h3a2 2 0 0 0 2-2v-3" />
          <path d="m9 9 6 6" />
          <path d="m15 9-6 6" />
        </svg>
      );
    case "output":
      return (
        <svg {...common}>
          <path d="m22 2-7 20-4-9-9-4 20-7z" />
        </svg>
      );
  }
}

export function FlowNodeCard({
  data,
  selected,
  inputPort,
  outputPort,
}: {
  data: FlowNodeData;
  selected: boolean;
  inputPort?: ReactNode;
  outputPort?: ReactNode;
}) {
  const color = flowNodeTypeColors[data.nodeType];
  const label = flowNodeTypeLabels[data.nodeType];
  const isDisabled = data.enabled === false;
  const config =
    data.config && typeof data.config === "object" && !Array.isArray(data.config) ? data.config : {};
  const configCount = Object.keys(config).length;
  const description = data.description || flowNodeTypeDescriptions[data.nodeType];

  return (
    <div
      className={[
        "flow-node",
        `flow-node-${data.nodeType}`,
        selected ? "flow-node-selected" : "",
        isDisabled ? "flow-node-disabled" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      style={
        {
          "--flow-node-accent": color,
        } as CSSProperties
      }
    >
      {inputPort ? <div className="flow-port-anchor flow-port-anchor-in">{inputPort}</div> : null}
      <div className="flow-node-header">
        <span className="flow-node-icon-shell">
          <span className="flow-node-icon" style={{ color }}>
            <FlowNodeIcon type={data.nodeType} />
          </span>
        </span>
        <div className="flow-node-title-group">
          <span className="flow-node-type-label">{label}</span>
          <strong className="flow-node-label">{data.label}</strong>
        </div>
        <span className={`flow-node-state${isDisabled ? " disabled" : ""}`}>
          {isDisabled ? "Disabled" : "Live"}
        </span>
      </div>
      <div className="flow-node-body">
        <p className="flow-node-description">{description}</p>
      </div>
      <div className="flow-node-footer">
        <span>{configCount} config {configCount === 1 ? "field" : "fields"}</span>
        <span>{data.nodeType}</span>
      </div>
      {outputPort ? <div className="flow-port-anchor flow-port-anchor-out">{outputPort}</div> : null}
    </div>
  );
}
