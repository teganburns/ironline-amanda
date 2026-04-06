import type { ReactNode } from "react";

const toneMap: Record<string, string> = {
  ready: "ready",
  completed: "ready",
  running: "ready",
  autonomous: "ready",
  published: "ready",
  started: "placeholder",
  offline: "offline",
  failed: "offline",
  blocked: "offline",
  always_require: "offline",
  error: "offline",
  degraded: "degraded",
  placeholder: "placeholder",
  queued: "placeholder",
  scheduled: "placeholder",
  suggest: "placeholder",
  sandbox: "placeholder",
  draft: "placeholder",
  skipped: "placeholder",
};

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  secondaryActions,
}: {
  eyebrow: string;
  title: string;
  description: string;
  actions?: ReactNode;
  secondaryActions?: ReactNode;
}) {
  return (
    <section className="page-header">
      <div className="page-header-copy">
        <p className="eyebrow">{eyebrow}</p>
        <h2>{title}</h2>
        <p className="page-description">{description}</p>
      </div>
      {actions || secondaryActions ? (
        <div className="page-actions">
          {secondaryActions ? <div className="page-actions-secondary">{secondaryActions}</div> : null}
          {actions ? <div className="page-actions-primary">{actions}</div> : null}
        </div>
      ) : null}
    </section>
  );
}

export function StatusPill({ value }: { value: string }) {
  const tone = toneMap[value] ?? "placeholder";
  return <span className={`status ${tone}`}>{value.replace(/_/g, " ")}</span>;
}

function formatPrimitive(value: unknown) {
  if (typeof value === "string") return `"${value}"`;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (value === null) return "null";
  return String(value);
}

function getNodeMeta(value: Record<string, unknown> | unknown[]) {
  if (Array.isArray(value)) {
    return `[${value.length}]`;
  }

  const count = Object.keys(value).length;
  return `{${count}}`;
}

function JsonTreeNode({
  label,
  value,
  depth = 0,
}: {
  label?: string;
  value: unknown;
  depth?: number;
}) {
  if (Array.isArray(value)) {
    return (
      <details className="json-node" open={depth === 0}>
        <summary className="json-summary">
          {label ? <span className="json-key">{label}</span> : null}
          <span className="json-meta">{getNodeMeta(value)}</span>
        </summary>
        <div className="json-children">
          {value.length ? (
            value.map((item, index) => <JsonTreeNode depth={depth + 1} key={`${depth}-${index}`} label={String(index)} value={item} />)
          ) : (
            <div className="json-leaf">
              <span className="json-meta">empty</span>
            </div>
          )}
        </div>
      </details>
    );
  }

  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);

    return (
      <details className="json-node" open={depth === 0}>
        <summary className="json-summary">
          {label ? <span className="json-key">{label}</span> : null}
          <span className="json-meta">{getNodeMeta(value as Record<string, unknown>)}</span>
        </summary>
        <div className="json-children">
          {entries.length ? (
            entries.map(([key, childValue]) => (
              <JsonTreeNode depth={depth + 1} key={`${depth}-${key}`} label={key} value={childValue} />
            ))
          ) : (
            <div className="json-leaf">
              <span className="json-meta">empty</span>
            </div>
          )}
        </div>
      </details>
    );
  }

  return (
    <div className="json-leaf">
      {label ? <span className="json-key">{label}</span> : null}
      <span
        className={`json-value${
          typeof value === "string"
            ? " string"
            : typeof value === "number"
            ? " number"
            : typeof value === "boolean"
            ? " boolean"
            : value === null
            ? " null"
            : ""
        }`}
      >
        {formatPrimitive(value)}
      </span>
    </div>
  );
}

export function JsonBlock({ value }: { value: unknown }) {
  return (
    <div className="json-tree">
      <JsonTreeNode value={value} />
    </div>
  );
}

export function EmptyState({ message }: { message: string }) {
  return <p className="empty">{message}</p>;
}

export function LoadingCopy({ message = "Loading data..." }: { message?: string }) {
  return <p className="empty">{message}</p>;
}
