import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronUp, Replace, Search, X } from "lucide-react";
import type { SearchableEditorHandle } from "../types/editorSearch";

type SearchTarget = "source" | "preview" | "wysiwyg";

interface SearchBarProps {
  visible: boolean;
  target: SearchTarget;
  editor: SearchableEditorHandle | null;
  replaceMode: boolean;
  focusToken: number;
  onReplaceModeChange: (value: boolean) => void;
  onClose: () => void;
}

function getTargetLabel(target: SearchTarget): string {
  switch (target) {
    case "wysiwyg":
      return "所见即所得";
    case "preview":
      return "预览文档";
    default:
      return "Markdown 源文档";
  }
}

export default function SearchBar({
  visible,
  target,
  editor,
  replaceMode,
  focusToken,
  onReplaceModeChange,
  onClose,
}: SearchBarProps) {
  const [query, setQuery] = useState("");
  const [replacement, setReplacement] = useState("");
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [matchIndex, setMatchIndex] = useState(0);

  const queryInputRef = useRef<HTMLInputElement>(null);
  const replaceInputRef = useRef<HTMLInputElement>(null);

  const matches = useMemo(() => {
    if (!visible || !editor || !query) return [];
    return editor.findMatches(query, caseSensitive);
  }, [caseSensitive, editor, query, visible]);

  const matchTotal = matches.length;
  const canReplace = editor?.canReplace ?? false;
  const showReplace = replaceMode && canReplace;

  const selectAt = useCallback(
    (index: number, focus = false) => {
      if (!editor || matchTotal === 0) return false;

      const normalized = ((index % matchTotal) + matchTotal) % matchTotal;
      const selected = matches[normalized];
      const ok = editor.selectMatch(selected, { focus });
      if (ok) {
        setMatchIndex(normalized);
      }
      return ok;
    },
    [editor, matchTotal, matches]
  );

  useEffect(() => {
    if (!visible) return;

    const timer = window.setTimeout(() => {
      queryInputRef.current?.focus();
      queryInputRef.current?.select();
    }, 30);

    return () => window.clearTimeout(timer);
  }, [focusToken, visible]);

  useEffect(() => {
    if (!visible || !showReplace) return;

    const timer = window.setTimeout(() => {
      replaceInputRef.current?.focus();
      replaceInputRef.current?.select();
    }, 30);

    return () => window.clearTimeout(timer);
  }, [showReplace, visible]);

  useEffect(() => {
    if (!visible || !query || matchTotal === 0) {
      setMatchIndex(0);
      return;
    }

    void selectAt(0, false);
  }, [matchTotal, query, selectAt, visible]);

  useEffect(() => {
    if (!canReplace && replaceMode) {
      onReplaceModeChange(false);
    }
  }, [canReplace, onReplaceModeChange, replaceMode]);

  const goTo = useCallback(
    (direction: 1 | -1) => {
      if (matchTotal === 0) return;
      void selectAt(matchIndex + direction, false);
    },
    [matchIndex, matchTotal, selectAt]
  );

  const replaceCurrent = useCallback(() => {
    if (!editor || !canReplace || matchTotal === 0) return;

    const current = matches[matchIndex];
    const updated = editor.replaceMatch(current, replacement);
    if (!updated) return;

    const nextMatches = editor.findMatches(query, caseSensitive);
    if (nextMatches.length === 0) {
      setMatchIndex(0);
      return;
    }

    const nextIndex = Math.min(matchIndex, nextMatches.length - 1);
    editor.selectMatch(nextMatches[nextIndex], { focus: false });
    setMatchIndex(nextIndex);
  }, [canReplace, caseSensitive, editor, matchIndex, matchTotal, matches, query, replacement]);

  const replaceAll = useCallback(() => {
    if (!editor || !canReplace || !query) return;

    const replaced = editor.replaceAll(query, replacement, caseSensitive);
    if (replaced > 0) {
      setMatchIndex(0);
    }
  }, [canReplace, caseSensitive, editor, query, replacement]);

  useEffect(() => {
    if (!visible) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key !== "Enter") return;

      const activeElement = document.activeElement;
      if (activeElement === replaceInputRef.current && showReplace) {
        event.preventDefault();
        replaceCurrent();
        return;
      }

      if (activeElement === queryInputRef.current) {
        event.preventDefault();
        goTo(event.shiftKey ? -1 : 1);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [goTo, onClose, replaceCurrent, showReplace, visible]);

  if (!visible) return null;

  return (
    <div className="search-bar">
      <div className="search-row">
        <div className="search-context-pill">
          <Search size={14} className="search-icon" />
          <span>{getTargetLabel(target)}</span>
        </div>

        <input
          ref={queryInputRef}
          className="search-input"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="仅在当前文档内容中查找"
        />

        <span className="search-count">
          {query ? `${matchTotal === 0 ? 0 : matchIndex + 1}/${matchTotal}` : ""}
        </span>

        <button className="search-nav-btn" onClick={() => goTo(-1)} disabled={matchTotal === 0} title="上一个">
          <ChevronUp size={14} />
        </button>
        <button className="search-nav-btn" onClick={() => goTo(1)} disabled={matchTotal === 0} title="下一个">
          <ChevronDown size={14} />
        </button>
        <button
          className={`search-toggle-btn ${caseSensitive ? "active" : ""}`}
          onClick={() => setCaseSensitive((current) => !current)}
          title="区分大小写"
        >
          Aa
        </button>
        <button
          className={`search-toggle-btn ${showReplace ? "active" : ""}`}
          onClick={() => onReplaceModeChange(!showReplace)}
          title={canReplace ? "替换" : "当前视图仅支持查找"}
          disabled={!canReplace}
        >
          <Replace size={14} />
        </button>
        <button className="search-close-btn" onClick={onClose} title="关闭">
          <X size={14} />
        </button>
      </div>

      {showReplace && (
        <div className="replace-row">
          <span className="replace-label">替换为</span>
          <input
            ref={replaceInputRef}
            className="search-input"
            value={replacement}
            onChange={(event) => setReplacement(event.target.value)}
            placeholder="输入替换内容"
          />
          <button className="search-replace-btn" onClick={replaceCurrent} disabled={matchTotal === 0}>
            替换当前
          </button>
          <button className="search-replace-btn" onClick={replaceAll} disabled={matchTotal === 0}>
            全部替换
          </button>
        </div>
      )}
    </div>
  );
}
