import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Save, Eye, FileText, Download } from "lucide-react";
import { renderMarkdown } from "../utils/markdown";
import type { MobileFileHandle, DraftRecord } from "../platform/androidFileSystem";
import {
  writeFileViaUri,
  saveFileAs,
  saveDraft,
  loadDraft,
  clearDraft,
} from "../platform/androidFileSystem";

type MobileView = "edit" | "preview";

interface MobileEditorProps {
  fileHandle: MobileFileHandle | null;
  initialContent: string;
  isNewFile: boolean;
  onBack: () => void;
}

export default function MobileEditor({
  fileHandle,
  initialContent,
  isNewFile: _isNewFile,
  onBack,
}: MobileEditorProps) {
  const [content, setContent] = useState(initialContent);
  const [view, setView] = useState<MobileView>("edit");
  const [currentHandle, setCurrentHandle] = useState<MobileFileHandle | null>(
    fileHandle
  );
  const [saveStatus, setSaveStatus] = useState<
    "unchanged" | "unsaved" | "saving" | "saved"
  >("unchanged");
  const [toast, setToast] = useState<{
    text: string;
    kind: "success" | "error" | "info";
  } | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const initialContentRef = useRef(initialContent);
  const draftTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isDirty = content !== initialContentRef.current;
  const isDirtyRef = useRef(isDirty);
  isDirtyRef.current = isDirty;

  // ── Load draft on mount ──
  useEffect(() => {
    loadDraft(currentHandle?.uri ?? null).then((draft: DraftRecord | null) => {
      if (!draft || !draft.content) return;
      // Restore only when the draft belongs to the exact file being opened.
      // A draft with no URI is a temporary "untitled" draft and must not be
      // applied over a real file.
      const draftMatches = currentHandle
        ? draft.uri === currentHandle.uri
        : !draft.uri;
      if (!draftMatches) return;
      if (draft.content === initialContentRef.current) return;
      setContent(draft.content);
      showToast("已恢复未保存的草稿", "info");
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Periodic draft save ──
  useEffect(() => {
    if (!isDirty) return;
    if (draftTimerRef.current) window.clearTimeout(draftTimerRef.current);
    draftTimerRef.current = window.setTimeout(() => {
      saveDraft(
        currentHandle?.uri ?? null,
        currentHandle?.name ?? "未命名.md",
        content
      );
    }, 3000);
    return () => {
      if (draftTimerRef.current) window.clearTimeout(draftTimerRef.current);
    };
  }, [content, currentHandle, isDirty]);

  useEffect(() => {
    // Mark unsaved as soon as the content diverges from the saved snapshot.
    // Do not force the status back to "unchanged" here — that would clobber
    // the transient "saving"/"saved" feedback right after a save.
    if (isDirty) setSaveStatus("unsaved");
  }, [isDirty]);

  // ── Android system back button ──
  const backHandlerRef = useRef<() => void>(() => {});
  useEffect(() => {
    const onPopState = () => {
      backHandlerRef.current();
      // Keep a single dummy entry so the next back press fires popstate again
      window.history.pushState({ markflow: true }, "");
    };
    window.history.pushState({ markflow: true }, "");
    window.addEventListener("popstate", onPopState);
    return () => {
      window.removeEventListener("popstate", onPopState);
    };
  }, []);

  function showToast(text: string, kind: "success" | "error" | "info") {
    setToast({ text, kind });
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setToast(null), 3000);
  }

  // After a successful save, drop back to "unchanged" — unless the user has
  // already started typing again, in which case keep it unsaved.
  const scheduleStatusReset = useCallback(() => {
    window.setTimeout(() => {
      setSaveStatus(isDirtyRef.current ? "unsaved" : "unchanged");
    }, 2000);
  }, []);

  // ── Save ──
  const handleSave = useCallback(async () => {
    setSaveStatus("saving");
    setToast(null);

    if (currentHandle) {
      const ok = await writeFileViaUri(currentHandle.uri, content).catch(
        () => false
      );
      if (ok) {
        initialContentRef.current = content;
        setSaveStatus("saved");
        scheduleStatusReset();
        clearDraft(currentHandle?.uri ?? null);
        showToast("已保存", "success");
      } else {
        setSaveStatus("unsaved");
        showToast("保存失败，请重试或使用另存为", "error");
      }
    } else {
      let handle: MobileFileHandle | null = null;
      try {
        handle = await saveFileAs(content, "untitled.md");
      } catch (e) {
        setSaveStatus("unsaved");
        showToast(`保存失败：${e}`, "error");
        return;
      }
      if (handle) {
        setCurrentHandle(handle);
        initialContentRef.current = content;
        setSaveStatus("saved");
        scheduleStatusReset();
        // This branch had no handle, so the draft lives in the untitled slot.
        clearDraft(null);
        showToast("已保存", "success");
      } else {
        setSaveStatus("unsaved");
        // User may have cancelled the picker — don't show an error in that case
      }
    }
  }, [content, currentHandle, scheduleStatusReset]);

  // ── Save As ──
  const handleSaveAs = useCallback(async () => {
    setToast(null);
    let handle: MobileFileHandle | null = null;
    try {
      handle = await saveFileAs(
        content,
        currentHandle?.name ?? "untitled.md"
      );
    } catch (e) {
      setSaveStatus("unsaved");
      showToast(`另存为失败：${e}`, "error");
      return;
    }
    if (handle) {
      setCurrentHandle(handle);
      initialContentRef.current = content;
      setSaveStatus("saved");
      scheduleStatusReset();
      clearDraft(currentHandle?.uri ?? null);
      showToast(`已另存为 ${handle.name}`, "success");
    }
  }, [content, currentHandle, scheduleStatusReset]);

  // ── Back ──
  const handleBack = useCallback(() => {
    if (isDirty) {
      const ok = window.confirm("有未保存的更改，确定返回吗？");
      if (!ok) return;
    }
    if (isDirty) saveDraft(currentHandle?.uri ?? null, currentHandle?.name ?? "未命名.md", content);
    onBack();
  }, [isDirty, content, currentHandle, onBack]);
  backHandlerRef.current = handleBack;

  // ── Render ──
  const html = useMemo(() => renderMarkdown(content), [content]);

  const statusText =
    saveStatus === "saving"
      ? "保存中…"
      : saveStatus === "saved"
        ? "已保存"
        : saveStatus === "unsaved"
          ? "● 未保存"
          : "";

  return (
    <div className="mobile-editor">
      {/* Header */}
      <div className="mobile-editor-header">
        <button
          className="mobile-header-btn"
          onClick={handleBack}
          aria-label="返回"
        >
          <ArrowLeft size={20} />
        </button>
        <span className="mobile-editor-filename">
          {currentHandle?.name ?? "未命名.md"}
        </span>
        <span
          className={`mobile-editor-status ${
            saveStatus === "unsaved" ? "status-unsaved" : ""
          } ${saveStatus === "saved" ? "status-ok" : ""}`}
        >
          {statusText}
        </span>
        <button
          className="mobile-header-btn"
          onClick={() => setView(view === "edit" ? "preview" : "edit")}
          aria-label={view === "edit" ? "预览" : "编辑"}
        >
          {view === "edit" ? <Eye size={20} /> : <FileText size={20} />}
        </button>
        <button
          className="mobile-header-btn"
          onClick={handleSave}
          disabled={saveStatus === "saving" || !isDirty}
          aria-label="保存"
        >
          <Save size={20} />
        </button>
        <button
          className="mobile-header-btn"
          onClick={handleSaveAs}
          aria-label="另存为"
        >
          <Download size={20} />
        </button>
      </div>

      {/* Toast */}
      {toast && (
        <div
          className={`mobile-toast ${toast.kind}`}
          onClick={() => setToast(null)}
        >
          {toast.text}
        </div>
      )}

      {/* Edit view */}
      {view === "edit" && (
        <textarea
          ref={textareaRef}
          className="mobile-editor-textarea"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="输入 Markdown 内容…"
          spellCheck={false}
          autoCapitalize="none"
          autoCorrect="off"
        />
      )}

      {/* Preview view */}
      {view === "preview" && (
        <div className="mobile-preview-content">
          {content ? (
            <div dangerouslySetInnerHTML={{ __html: html }} />
          ) : (
            <div className="mobile-preview-empty">暂无内容</div>
          )}
        </div>
      )}
    </div>
  );
}
