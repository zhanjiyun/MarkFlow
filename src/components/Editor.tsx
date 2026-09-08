import { useCallback, useEffect, useRef, type MutableRefObject } from "react";
import { Compartment, EditorState, Transaction } from "@codemirror/state";
import { EditorView, highlightActiveLine, highlightActiveLineGutter, keymap, lineNumbers } from "@codemirror/view";
import type { KeyBinding } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { defaultHighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { closeBrackets } from "@codemirror/autocomplete";
import { highlightSelectionMatches } from "@codemirror/search";
import { oneDark } from "@codemirror/theme-one-dark";
import { handleImagePaste } from "../utils/image";
import type { EditorSearchMatch, SearchableEditorHandle } from "../types/editorSearch";
import type { SourceViewState } from "../types/tabState";
import { findTextMatches } from "../utils/textSearch";

export interface SourceEditorHandle extends SearchableEditorHandle {
  applyFormat: (format: string) => boolean;
  getViewState: () => SourceViewState;
  restoreViewState: (state?: SourceViewState) => boolean;
}

interface EditorProps {
  content: string;
  onChange: (value: string) => void;
  theme: string;
  currentFilePath?: string | null;
  editorRef?: MutableRefObject<SourceEditorHandle | null>;
  onNotice?: (message: string) => void;
}

function wrapSelection(
  view: EditorView,
  prefix: string,
  suffix: string,
  placeholder: string
): void {
  const selection = view.state.selection.main;
  const selectedText = view.state.sliceDoc(selection.from, selection.to);
  const insertText = `${prefix}${selectedText || placeholder}${suffix}`;
  const selectFrom = selection.from + prefix.length;
  const selectTo = selectFrom + (selectedText || placeholder).length;

  view.dispatch({
    changes: { from: selection.from, to: selection.to, insert: insertText },
    selection: { anchor: selectFrom, head: selectTo },
  });
  view.focus();
}

function transformSelectedLines(
  view: EditorView,
  transform: (line: string, index: number) => string
): void {
  const selection = view.state.selection.main;
  const startLine = view.state.doc.lineAt(selection.from);
  const endLine = view.state.doc.lineAt(selection.to);
  const selectedText = view.state.sliceDoc(startLine.from, endLine.to);
  const lines = selectedText.split("\n");
  const insertText = lines.map(transform).join("\n");

  view.dispatch({
    changes: { from: startLine.from, to: endLine.to, insert: insertText },
    selection: { anchor: startLine.from, head: startLine.from + insertText.length },
  });
  view.focus();
}

function insertSnippet(view: EditorView, snippet: string): void {
  const selection = view.state.selection.main;
  view.dispatch({
    changes: { from: selection.from, to: selection.to, insert: snippet },
    selection: { anchor: selection.from + snippet.length },
  });
  view.focus();
}

function scrollMatchIntoView(view: EditorView, from: number, to: number): void {
  requestAnimationFrame(() => {
    const container = view.dom.closest(".split-pane-left") as HTMLElement | null;
    if (!container) return;

    const start = view.coordsAtPos(from);
    const end = view.coordsAtPos(Math.max(from, to));
    if (!start && !end) return;

    const containerRect = container.getBoundingClientRect();
    const matchTop = Math.min(start?.top ?? end?.top ?? 0, end?.top ?? start?.top ?? 0);
    const matchBottom = Math.max(start?.bottom ?? end?.bottom ?? 0, end?.bottom ?? start?.bottom ?? 0);
    const padding = 56;

    if (matchTop < containerRect.top + padding) {
      container.scrollTop += matchTop - containerRect.top - padding;
      return;
    }

    if (matchBottom > containerRect.bottom - padding) {
      container.scrollTop += matchBottom - containerRect.bottom + padding;
    }
  });
}

function getScrollContainer(view: EditorView): HTMLElement | null {
  return view.dom.closest(".split-pane-left") as HTMLElement | null;
}

function applySourceFormat(view: EditorView, format: string): boolean {
  switch (format) {
    case "bold":
      wrapSelection(view, "**", "**", "粗体文字");
      return true;
    case "italic":
      wrapSelection(view, "*", "*", "斜体文字");
      return true;
    case "strikethrough":
      wrapSelection(view, "~~", "~~", "删除线");
      return true;
    case "link":
      wrapSelection(view, "[", "](url)", "链接文字");
      return true;
    case "image":
      wrapSelection(view, "![", "](url)", "图片描述");
      return true;
    case "code": {
      const selection = view.state.selection.main;
      const selectedText = view.state.sliceDoc(selection.from, selection.to);
      if (selectedText.includes("\n") || !selectedText) {
        wrapSelection(view, "```\n", "\n```", "代码块");
      } else {
        wrapSelection(view, "`", "`", "代码");
      }
      return true;
    }
    case "h1":
      transformSelectedLines(view, (line) => `# ${(line || "一级标题").replace(/^#+\s*/, "")}`);
      return true;
    case "h2":
      transformSelectedLines(view, (line) => `## ${(line || "二级标题").replace(/^#+\s*/, "")}`);
      return true;
    case "ul":
      transformSelectedLines(view, (line) => `- ${line || "列表项"}`);
      return true;
    case "ol":
      transformSelectedLines(view, (line, index) => `${index + 1}. ${line || "列表项"}`);
      return true;
    case "quote":
      transformSelectedLines(view, (line) => `> ${line || "引用文字"}`);
      return true;
    case "table":
      insertSnippet(view, "| 列1 | 列2 | 列3 |\n| --- | --- | --- |\n| 内容 | 内容 | 内容 |");
      return true;
    case "hr":
      insertSnippet(view, "\n---\n");
      return true;
    default:
      return false;
  }
}

export default function Editor({ content, onChange, theme, currentFilePath, editorRef, onNotice }: EditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  const onNoticeRef = useRef(onNotice);
  onNoticeRef.current = onNotice;
  const isExternalUpdate = useRef(false);
  const currentFilePathRef = useRef(currentFilePath);
  const initialContentRef = useRef(content);
  const initialThemeRef = useRef(theme);
  const themeCompartmentRef = useRef(new Compartment());

  currentFilePathRef.current = currentFilePath;

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  const handlePaste = useCallback((event: ClipboardEvent, view: EditorView): boolean => {
    const items = event.clipboardData?.items;
    if (!items) return false;

    const itemList = Array.from(items);
    const hasImage = itemList.some((item) => item.type.startsWith("image/"));
    if (!hasImage) return false;

    // Clipboard payloads that also carry text (e.g. copied from a web page)
    // should keep their text — let the default paste handle it instead of
    // swallowing everything for the image.
    const hasText = itemList.some((item) => item.type === "text/plain");
    if (hasText) return false;

    if (!currentFilePathRef.current) {
      event.preventDefault();
      onNoticeRef.current?.("请先保存文件，再粘贴图片");
      return true;
    }

    event.preventDefault();
    handleImagePaste(event, currentFilePathRef.current ?? null).then((markdownTag) => {
      if (!markdownTag) return;

      const cursor = view.state.selection.main.head;
      view.dispatch({
        changes: { from: cursor, insert: markdownTag },
      });
    });

    return true;
  }, []);

  useEffect(() => {
    if (!containerRef.current) return;

    const updateListener = EditorView.updateListener.of((update) => {
      if (update.docChanged && !isExternalUpdate.current) {
        onChangeRef.current(update.state.doc.toString());
      }
      isExternalUpdate.current = false;
    });

    const autoListKeymap: KeyBinding[] = [
      {
        key: "Enter",
        run: (view) => {
          const position = view.state.selection.main.head;
          const line = view.state.doc.lineAt(position);
          const match = line.text.match(/^(\s*)([-*+]\s+|\d+[.)]\s+)(.*)$/);
          if (!match) return false;

          const [, indent, marker, listContent] = match;
          if (!listContent.trim()) {
            const markerStart = line.from + indent.length;
            view.dispatch({
              changes: { from: markerStart, to: line.to, insert: "\n" },
              selection: { anchor: position - marker.length + 1 },
            });
            return true;
          }

          let nextMarker = marker;
          const orderedMatch = marker.match(/^(\d+)([.)]\s+)$/);
          if (orderedMatch) {
            nextMarker = `${parseInt(orderedMatch[1], 10) + 1}${orderedMatch[2]}`;
          }

          view.dispatch({
            changes: { from: position, insert: `\n${indent}${nextMarker}` },
            selection: { anchor: position + 1 + indent.length + nextMarker.length },
          });
          return true;
        },
      },
    ];

    const state = EditorState.create({
      doc: initialContentRef.current,
      extensions: [
        lineNumbers(),
        highlightActiveLineGutter(),
        highlightActiveLine(),
        history(),
        keymap.of([...defaultKeymap, ...historyKeymap, ...autoListKeymap]),
        closeBrackets(),
        highlightSelectionMatches(),
        markdown({ base: markdownLanguage }),
        syntaxHighlighting(defaultHighlightStyle),
        updateListener,
        EditorView.lineWrapping,
        EditorView.theme({
          "&": { height: "auto" },
          ".cm-scroller": { overflow: "visible" },
        }),
        themeCompartmentRef.current.of(initialThemeRef.current === "dark" ? oneDark : []),
        EditorView.domEventHandlers({
          paste: (event, view) => handlePaste(event, view),
        }),
      ],
    });

    const view = new EditorView({
      state,
      parent: containerRef.current,
    });

    viewRef.current = view;

    if (editorRef) {
      editorRef.current = {
        canReplace: true,
        focus: () => view.focus(),
        findMatches: (query, caseSensitive) =>
          findTextMatches(view.state.doc.toString(), query, caseSensitive),
        selectMatch: (match: EditorSearchMatch, options) => {
          const max = view.state.doc.length;
          if (match.from < 0 || match.to > max || match.from >= match.to) return false;

          view.dispatch({
            selection: { anchor: match.from, head: match.to },
            scrollIntoView: true,
          });
          scrollMatchIntoView(view, match.from, match.to);
          if (options?.focus !== false) {
            view.focus();
          }
          return true;
        },
        replaceMatch: (match, replacement) => {
          const max = view.state.doc.length;
          if (match.from < 0 || match.to > max || match.from > match.to) return null;

          view.dispatch({
            changes: { from: match.from, to: match.to, insert: replacement },
            selection: {
              anchor: match.from,
              head: match.from + replacement.length,
            },
            scrollIntoView: true,
          });
          scrollMatchIntoView(view, match.from, match.from + replacement.length);
          view.focus();

          return {
            from: match.from,
            to: match.from + replacement.length,
          };
        },
        replaceAll: (query, replacement, caseSensitive) => {
          const matches = findTextMatches(view.state.doc.toString(), query, caseSensitive);
          if (matches.length === 0) return 0;

          view.dispatch({
            changes: matches.map((match) => ({
              from: match.from,
              to: match.to,
              insert: replacement,
            })),
          });
          view.focus();
          return matches.length;
        },
        applyFormat: (format) => applySourceFormat(view, format),
        getViewState: () => {
          const selection = view.state.selection.main;
          const container = getScrollContainer(view);

          return {
            anchor: selection.anchor,
            head: selection.head,
            scrollTop: container?.scrollTop ?? 0,
            scrollLeft: container?.scrollLeft ?? 0,
          };
        },
        restoreViewState: (state) => {
          if (!state) return false;

          const max = view.state.doc.length;
          const anchor = Math.max(0, Math.min(max, state.anchor));
          const head = Math.max(0, Math.min(max, state.head));

          view.dispatch({
            selection: { anchor, head },
          });

          const container = getScrollContainer(view);
          if (container) {
            requestAnimationFrame(() => {
              container.scrollTop = Math.max(0, state.scrollTop);
              container.scrollLeft = Math.max(0, state.scrollLeft);
            });
          }

          return true;
        },
      };
    }

    return () => {
      if (editorRef) {
        editorRef.current = null;
      }
      view.destroy();
      viewRef.current = null;
    };
  }, [editorRef, handlePaste]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;

    view.dispatch({
      effects: themeCompartmentRef.current.reconfigure(theme === "dark" ? oneDark : []),
    });
  }, [theme]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;

    const currentContent = view.state.doc.toString();
    if (currentContent === content) return;

    isExternalUpdate.current = true;
    view.dispatch({
      changes: {
        from: 0,
        to: currentContent.length,
        insert: content,
      },
      // Loading another file must not be undoable — otherwise Ctrl+Z could
      // revert to the previous tab's content and auto-save it here.
      annotations: Transaction.addToHistory.of(false),
    });
  }, [content]);

  return <div ref={containerRef} className="cm-wrapper" />;
}
