import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { Clock, FileText } from "lucide-react";
import type { RecentFile } from "../hooks/useRecentFiles";
import type { WorkspaceFile } from "../hooks/useWorkspace";

interface QuickSwitchProps {
  visible: boolean;
  files: WorkspaceFile[];
  recentFiles: RecentFile[];
  workspacePath: string | null;
  onSelect: (path: string) => void;
  onClose: () => void;
}

interface FlatFile {
  name: string;
  path: string;
  displayPath: string;
  isRecent?: boolean;
}

export default function QuickSwitch({
  visible,
  files,
  recentFiles,
  workspacePath,
  onSelect,
  onClose,
}: QuickSwitchProps) {
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const flatFiles = useMemo<FlatFile[]>(() => {
    const recent = recentFiles.map((file) => ({
      name: file.name,
      path: file.path,
      displayPath: file.path,
      isRecent: true,
    }));

    const seen = new Set(recent.map((file) => file.path));
    const workspaceFiles = files
      .filter((file) => !seen.has(file.path))
      .map((file) => ({
        name: file.name,
        path: file.path,
        displayPath: file.relativePath,
      }));

    return [...recent, ...workspaceFiles];
  }, [files, recentFiles]);

  const filtered = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return flatFiles;

    return flatFiles.filter((file) => {
      return (
        file.name.toLowerCase().includes(normalizedQuery) ||
        file.displayPath.toLowerCase().includes(normalizedQuery) ||
        file.path.toLowerCase().includes(normalizedQuery)
      );
    });
  }, [flatFiles, query]);

  useEffect(() => {
    if (!visible) return;

    setQuery("");
    setSelectedIndex(0);
    const timer = window.setTimeout(() => inputRef.current?.focus(), 50);
    return () => window.clearTimeout(timer);
  }, [visible]);

  useEffect(() => {
    setSelectedIndex((current) => Math.max(0, Math.min(current, Math.max(filtered.length - 1, 0))));
  }, [filtered.length]);

  const handleSelect = useCallback(
    (file: FlatFile) => {
      onSelect(file.path);
      onClose();
    },
    [onClose, onSelect]
  );

  useEffect(() => {
    if (!visible) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key === "ArrowDown") {
        event.preventDefault();
        setSelectedIndex((current) => Math.min(current + 1, Math.max(filtered.length - 1, 0)));
        return;
      }

      if (event.key === "ArrowUp") {
        event.preventDefault();
        setSelectedIndex((current) => Math.max(current - 1, 0));
        return;
      }

      if (event.key === "Enter") {
        event.preventDefault();
        const selected = filtered[selectedIndex];
        if (selected) {
          handleSelect(selected);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [filtered, handleSelect, onClose, selectedIndex, visible]);

  if (!visible) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="quick-switch" onClick={(event) => event.stopPropagation()}>
        <input
          ref={inputRef}
          className="quick-switch-input"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setSelectedIndex(0);
          }}
          placeholder="搜索文件名或路径... (Ctrl+P)"
        />

        <div className="quick-switch-list">
          {!workspacePath && recentFiles.length === 0 && <div className="quick-switch-empty">请先打开文件夹或文件</div>}
          {filtered.length === 0 && query && <div className="quick-switch-empty">未找到匹配文件</div>}

          {filtered.slice(0, 50).map((file, index) => (
            <div
              key={file.path}
              className={`quick-switch-item ${index === selectedIndex ? "selected" : ""}`}
              onClick={() => handleSelect(file)}
              onMouseEnter={() => setSelectedIndex(index)}
            >
              <div className="quick-switch-left">
                {file.isRecent ? (
                  <Clock size={14} className="quick-switch-icon recent" />
                ) : (
                  <FileText size={14} className="quick-switch-icon" />
                )}
                <span className="quick-switch-name">{file.name}</span>
              </div>
              <span className="quick-switch-path">{file.displayPath}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
