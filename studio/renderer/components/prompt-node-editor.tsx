import { useEffect, useRef } from "react";
import { EditorView, keymap, lineNumbers, drawSelection, highlightActiveLine } from "@codemirror/view";
import { EditorState, StateEffect } from "@codemirror/state";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { markdown } from "@codemirror/lang-markdown";
import { syntaxHighlighting, defaultHighlightStyle } from "@codemirror/language";

const amandaTheme = EditorView.theme({
  "&": {
    fontSize: "0.84rem",
    fontFamily: '"SF Mono", "JetBrains Mono", monospace',
    background: "transparent",
  },
  ".cm-content": {
    padding: "0.82rem 0.95rem",
    caretColor: "#a596f1",
    minHeight: "160px",
  },
  ".cm-focused": {
    outline: "none",
  },
  ".cm-scroller": {
    fontFamily: "inherit",
    lineHeight: "1.6",
  },
  ".cm-cursor": {
    borderLeftColor: "#a596f1",
  },
  ".cm-selectionBackground, ::selection": {
    background: "rgba(165, 149, 214, 0.18) !important",
  },
  ".cm-line": {
    color: "#5f5a72",
  },
  // markdown headings
  ".tok-heading": {
    color: "#5f5a72",
    fontWeight: "700",
  },
  ".tok-heading1, .tok-heading2": {
    color: "#a596f1",
    fontWeight: "700",
  },
  // emphasis / strong
  ".tok-emphasis": {
    color: "#a596f1",
    fontStyle: "italic",
  },
  ".tok-strong": {
    color: "#5f5a72",
    fontWeight: "700",
  },
  // inline code
  ".tok-monospace": {
    color: "#f4b69d",
    background: "rgba(244, 182, 157, 0.12)",
    borderRadius: "4px",
    padding: "0 2px",
  },
  // links
  ".tok-link, .tok-url": {
    color: "#71b7f5",
    textDecoration: "underline",
    textDecorationStyle: "dotted",
  },
  // list markers / meta punctuation
  ".tok-meta, .tok-punctuation": {
    color: "#ee9dc5",
  },
  // blockquotes
  ".tok-quote": {
    color: "#9892aa",
    fontStyle: "italic",
  },
  // hr / separators
  ".tok-contentSeparator": {
    color: "#b2a3dc",
  },
  // gutters (none shown, but style in case)
  ".cm-gutters": {
    display: "none",
  },
});

function buildExtensions(onChange?: (value: string) => void, readOnly?: boolean) {
  const base = [
    amandaTheme,
    markdown(),
    syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
    EditorView.lineWrapping,
    history(),
    drawSelection(),
    keymap.of([...defaultKeymap, ...historyKeymap]),
  ];

  if (readOnly) {
    base.push(EditorState.readOnly.of(true));
    base.push(EditorView.editable.of(false));
  }

  if (onChange) {
    base.push(
      EditorView.updateListener.of((update) => {
        if (update.docChanged) {
          onChange(update.state.doc.toString());
        }
      })
    );
  }

  return base;
}

interface PromptNodeEditorProps {
  value: string;
  onChange?: (value: string) => void;
  readOnly?: boolean;
  className?: string;
}

export function PromptNodeEditor({ value, onChange, readOnly, className }: PromptNodeEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  // track value externally to avoid stale closure in updateListener
  const valueRef = useRef(value);

  useEffect(() => {
    if (!containerRef.current) return;

    const view = new EditorView({
      state: EditorState.create({
        doc: value,
        extensions: buildExtensions(onChange, readOnly),
      }),
      parent: containerRef.current,
    });

    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readOnly]); // only remount if readOnly changes

  // sync external value changes (e.g. variant switch)
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const current = view.state.doc.toString();
    if (current === value) return;
    // replace entire doc without firing onChange
    view.dispatch({
      changes: { from: 0, to: current.length, insert: value },
      // mark as non-user to avoid triggering the update listener if we check flags
    });
    valueRef.current = value;
  }, [value]);

  return <div ref={containerRef} className={className} />;
}
