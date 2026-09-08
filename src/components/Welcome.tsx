import {
  FilePlus,
  FolderOpen,
  FolderTree,
  Code2,
  Eye,
  Clock,
  House,
  Play,
  X,
} from "lucide-react";
import type { RecentFile } from "../hooks/useRecentFiles";
import type { RecentWorkspace } from "../hooks/useRecentWorkspaces";

interface WelcomeProps {
  hasActiveDocument: boolean;
  currentFileName: string;
  currentFilePath: string | null;
  workspacePath: string | null;
  openTabCount: number;
  onContinue: () => void;
  onNewFile: () => void;
  onOpenFile: () => void;
  onOpenFolder: () => void;
  recentFiles: RecentFile[];
  recentWorkspaces: RecentWorkspace[];
  onOpenRecent: (path: string) => void;
  onRemoveRecent: (path: string) => void;
  onClearRecent: () => void;
  onOpenRecentWorkspace: (path: string) => void;
  onRemoveRecentWorkspace: (path: string) => void;
  onClearRecentWorkspaces: () => void;
}

const SHORTCUTS = [
  { keys: "Ctrl + N", desc: "新建文件" },
  { keys: "Ctrl + O", desc: "打开文件" },
  { keys: "Ctrl + S", desc: "保存" },
  { keys: "Ctrl + /", desc: "源码 / 所见即所得模式" },
  { keys: "Ctrl + P", desc: "快速切换文件" },
  { keys: "Ctrl + F", desc: "查找" },
  { keys: "Ctrl + H", desc: "查找并替换" },
  { keys: "Ctrl + Shift + E", desc: "切换侧边栏" },
  { keys: "Ctrl + Shift + I", desc: "AI 助手" },
  { keys: "F11", desc: "专注模式" },
];

export default function Welcome({
  hasActiveDocument,
  currentFileName,
  currentFilePath,
  workspacePath,
  openTabCount,
  onContinue,
  onNewFile,
  onOpenFile,
  onOpenFolder,
  recentFiles,
  recentWorkspaces,
  onOpenRecent,
  onRemoveRecent,
  onClearRecent,
  onOpenRecentWorkspace,
  onRemoveRecentWorkspace,
  onClearRecentWorkspaces,
}: WelcomeProps) {
  return (
    <div className="welcome-page">
      <div className="welcome-hero">
        <div className="welcome-badge">
          <House size={14} />
          主页
        </div>
        <h1 className="welcome-title">MarkFlow</h1>
        <p className="welcome-subtitle">本地优先的 Markdown 桌面编辑器，专注于写作体验</p>
        {(hasActiveDocument || openTabCount > 1) && (
          <div className="welcome-session-summary">
            当前会话已打开 <strong>{openTabCount}</strong> 个标签
          </div>
        )}
      </div>

      {hasActiveDocument && (
        <div className="welcome-resume-card">
          <div className="welcome-resume-copy">
            <span className="welcome-resume-label">继续当前工作</span>
            <strong className="welcome-resume-title">{currentFileName}</strong>
            {openTabCount > 1 && (
              <span className="welcome-resume-meta">同时保留了 {openTabCount} 个打开标签</span>
            )}
            <span className="welcome-resume-path" title={currentFilePath ?? undefined}>
              {currentFilePath ?? "未命名文档"}
            </span>
            {workspacePath && (
              <span className="welcome-resume-workspace" title={workspacePath}>
                工作区：{workspacePath}
              </span>
            )}
          </div>
          <button className="welcome-btn primary" onClick={onContinue}>
            <Play size={18} />
            回到编辑器
          </button>
        </div>
      )}

      <div className="welcome-actions">
        <button className="welcome-btn primary" onClick={onNewFile}>
          <FilePlus size={18} />
          新建文件
        </button>
        <button className="welcome-btn" onClick={onOpenFile}>
          <FolderOpen size={18} />
          打开文件
        </button>
        <button className="welcome-btn" onClick={onOpenFolder}>
          <FolderTree size={18} />
          打开文件夹
        </button>
      </div>

      {recentFiles.length > 0 && (
        <div className="welcome-recent">
          <div className="recent-section-header">
            <h2><Clock size={14} /> 最近打开</h2>
            <button
              type="button"
              className="recent-clear-btn"
              onClick={onClearRecent}
            >
              清空全部
            </button>
          </div>
          <div className="recent-list">
            {recentFiles.map((file) => (
              <div
                key={file.path}
                className="recent-file-item"
                title={file.path}
              >
                <button
                  type="button"
                  className="recent-file-main"
                  onClick={() => onOpenRecent(file.path)}
                >
                  <span className="recent-file-name">{file.name}</span>
                  <span className="recent-file-path">{file.path}</span>
                </button>
                <button
                  type="button"
                  className="recent-file-remove"
                  title="移除"
                  aria-label={`移除最近打开的文件 ${file.name}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemoveRecent(file.path);
                  }}
                >
                  <X size={14} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {recentWorkspaces.length > 0 && (
        <div className="welcome-recent">
          <div className="recent-section-header">
            <h2><FolderTree size={14} /> 最近工作区</h2>
            <button
              type="button"
              className="recent-clear-btn"
              onClick={onClearRecentWorkspaces}
            >
              清空全部
            </button>
          </div>
          <div className="recent-list">
            {recentWorkspaces.map((workspace) => (
              <div
                key={workspace.path}
                className="recent-file-item"
                title={workspace.path}
              >
                <button
                  type="button"
                  className="recent-file-main"
                  onClick={() => onOpenRecentWorkspace(workspace.path)}
                >
                  <span className="recent-file-name">{workspace.name}</span>
                  <span className="recent-file-path">{workspace.path}</span>
                </button>
                <button
                  type="button"
                  className="recent-file-remove"
                  title="移除"
                  aria-label={`移除最近工作区 ${workspace.name}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemoveRecentWorkspace(workspace.path);
                  }}
                >
                  <X size={14} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="welcome-shortcuts">
        <h2>快捷键速查</h2>
        <div className="shortcuts-grid">
          {SHORTCUTS.map((s) => (
            <div key={s.keys} className="shortcut-item">
              <kbd className="shortcut-keys">{s.keys}</kbd>
              <span className="shortcut-desc">{s.desc}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="welcome-tips">
        <h2>使用提示</h2>
        <ul>
          <li>
            <Code2 size={14} /> 支持源码编辑、实时预览、分栏视图和所见即所得四种模式
          </li>
          <li>
            <Eye size={14} /> 多标签管理：支持固定标签、拖拽排序、批量关闭，关闭全部标签后回到主页
          </li>
          <li>
            打开文件夹后，左侧文件树可浏览和管理所有 <code>.md</code> 文件
          </li>
          <li>
            退出应用时会自动保存会话，下次启动可恢复上次的所有标签和工作区
          </li>
        </ul>
      </div>
    </div>
  );
}
