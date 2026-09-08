import { useState, useEffect } from "react";
import {
  Check,
  Loader2,
  Circle,
  AlertCircle,
  FileText,
  Layers3,
  Type,
  Hash,
  MousePointer,
} from "lucide-react";
import type { SaveStatus } from "../hooks/useFileSystem";

interface StatusBarProps {
  wordCount: number;
  charCount: number;
  saveStatus: SaveStatus;
  editMode: "wysiwyg" | "source";
  currentFile: string;
  openTabCount: number;
  error: string | null;
  previewZoom: number;
}

const STATUS_ICON: Record<SaveStatus, { icon: React.ReactNode; text: string; className: string }> = {
  saved: { icon: <Check size={12} />, text: "已保存", className: "status-saved" },
  unsaved: { icon: <Circle size={10} />, text: "未保存", className: "status-unsaved" },
  saving: { icon: <Loader2 size={12} className="spinner" />, text: "保存中...", className: "status-saving" },
  error: { icon: <AlertCircle size={12} />, text: "保存失败", className: "status-error" },
};

export default function StatusBar({
  wordCount,
  charCount,
  saveStatus,
  editMode,
  currentFile,
  openTabCount,
  error,
  previewZoom,
}: StatusBarProps) {
  const status = STATUS_ICON[saveStatus];
  const [selectedCount, setSelectedCount] = useState(0);

  useEffect(() => {
    const update = () => {
      const selection = window.getSelection();
      const text = selection?.toString().trim() || "";
      setSelectedCount(text.length ? text.replace(/\s/g, "").length : 0);
    };

    document.addEventListener("selectionchange", update);
    document.addEventListener("keyup", update);
    return () => {
      document.removeEventListener("selectionchange", update);
      document.removeEventListener("keyup", update);
    };
  }, []);

  return (
    <div className="status-bar">
      {error && <div className="status-error-bar">{error}</div>}

      <div className="status-bar-left">
        <span className="status-item" title="当前文件">
          <FileText size={12} />
          {currentFile}
        </span>
        <span className="status-item" title={status.text}>
          <span className={status.className}>{status.icon}</span>
          {status.text}
        </span>
        <span className="status-item" title="当前打开标签数">
          <Layers3 size={12} />
          {openTabCount} 标签
        </span>
      </div>

      <div className="status-bar-center">
        {selectedCount > 0 ? (
          <span className="status-item selected-count">
            <MousePointer size={12} />
            已选 {selectedCount} 字
          </span>
        ) : (
          <>
            <span className="status-item">
              <Type size={12} />
              {wordCount} 词
            </span>
            <span className="status-divider" />
            <span className="status-item">
              <Hash size={12} />
              {charCount} 字符
            </span>
          </>
        )}
      </div>

      <div className="status-bar-right">
        <span className="status-item">{Math.round(previewZoom * 100)}%</span>
        <span className="status-item mode-badge">
          {editMode === "wysiwyg" ? "所见即所得" : "源码模式"}
        </span>
        <span className="status-item">
          {wordCount > 0 ? `${Math.round((wordCount / 300) * 10) / 10} 分钟阅读` : ""}
        </span>
      </div>
    </div>
  );
}
