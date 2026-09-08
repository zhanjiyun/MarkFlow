import { useState, useCallback } from "react";
import { FolderOpen, RefreshCw, Clock, X } from "lucide-react";
import FileTreeNode from "./FileTreeNode";
import ContextMenu from "./ContextMenu";
import PromptDialog, { type PromptConfig } from "./PromptDialog";
import { getFileTreeActions } from "./fileTreeActions";
import type { ContextMenuAction } from "./ContextMenu";
import type { FileTreeNode as FileTreeNodeType } from "../hooks/useWorkspace";
import type { RecentFile } from "../hooks/useRecentFiles";
import type { RecentWorkspace } from "../hooks/useRecentWorkspaces";

interface FileTreeProps {
  workspacePath: string | null;
  tree: FileTreeNodeType[];
  expandedDirs: Set<string>;
  activeFilePath: string | null;
  recentFiles: RecentFile[];
  recentWorkspaces: RecentWorkspace[];
  onRemoveRecent: (path: string) => void;
  onClearRecent: () => void;
  onOpenRecentWorkspace: (path: string) => void;
  onRemoveRecentWorkspace: (path: string) => void;
  onClearRecentWorkspaces: () => void;
  onOpenFolder: () => void;
  onToggleExpand: (dirPath: string) => void;
  onFileClick: (path: string) => void;
  onRefresh: () => void;
  onCreateFile: (parentDir: string, fileName: string) => Promise<string | null>;
  onRenameFile: (filePath: string, newName: string) => Promise<boolean>;
  onDeleteFile: (filePath: string) => Promise<boolean>;
}

export default function FileTree({
  workspacePath,
  tree,
  expandedDirs,
  activeFilePath,
  recentFiles,
  recentWorkspaces,
  onRemoveRecent,
  onClearRecent,
  onOpenRecentWorkspace,
  onRemoveRecentWorkspace,
  onClearRecentWorkspaces,
  onOpenFolder,
  onToggleExpand,
  onFileClick,
  onRefresh,
  onCreateFile,
  onRenameFile,
  onDeleteFile,
}: FileTreeProps) {
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    items: ContextMenuAction[];
  } | null>(null);

  const [promptConfig, setPromptConfig] = useState<PromptConfig | null>(null);

  const handleCreateFilePrompt = useCallback(
    (parentPath: string) => {
      setPromptConfig({
        title: "新建文件",
        message: `在文件夹中创建新的 Markdown 文件`,
        defaultValue: "",
        confirmLabel: "创建",
        onConfirm: (name) => {
          setPromptConfig(null);
          onCreateFile(parentPath, name).then((path) => {
            if (path) onFileClick(path);
          });
        },
        onCancel: () => setPromptConfig(null),
      });
    },
    [onCreateFile, onFileClick]
  );

  const handleRenameFilePrompt = useCallback(
    (filePath: string) => {
      const oldName = filePath.replace(/\\/g, "/").split("/").pop() || "";
      setPromptConfig({
        title: "重命名",
        message: `输入新文件名`,
        defaultValue: oldName,
        confirmLabel: "确定",
        onConfirm: (newName) => {
          setPromptConfig(null);
          onRenameFile(filePath, newName);
        },
        onCancel: () => setPromptConfig(null),
      });
    },
    [onRenameFile]
  );

  const handleContextMenu = useCallback(
    (e: React.MouseEvent, filePath: string, isDir: boolean) => {
      e.preventDefault();
      setContextMenu({
        x: e.clientX,
        y: e.clientY,
        items: getFileTreeActions(
          filePath,
          isDir,
          handleCreateFilePrompt,
          handleRenameFilePrompt,
          onDeleteFile
        ),
      });
    },
    [handleCreateFilePrompt, handleRenameFilePrompt, onDeleteFile]
  );

  const handleWorkspaceContextMenu = useCallback(
    (e: React.MouseEvent) => {
      if (!workspacePath) return;
      handleContextMenu(e, workspacePath, true);
    },
    [workspacePath, handleContextMenu]
  );

  return (
    <div className="file-tree-panel" onContextMenu={handleWorkspaceContextMenu}>
      <div className="file-tree-header">
        <span className="file-tree-title">资源管理器</span>
        <div className="file-tree-actions">
          <button className="icon-btn" onClick={onRefresh} title="刷新">
            <RefreshCw size={14} />
          </button>
          <button className="icon-btn" onClick={onOpenFolder} title="打开文件夹">
            <FolderOpen size={14} />
          </button>
        </div>
      </div>

      {workspacePath && (
        <div className="file-tree-workspace-path">
          {workspacePath.replace(/\\/g, "/").split("/").pop() || workspacePath}
        </div>
      )}

      <div className="file-tree-content">
        {!workspacePath ? (
          <div className="file-tree-empty">
            <FolderOpen size={32} strokeWidth={1} />
            <p>未打开文件夹</p>
            <button className="file-tree-open-btn" onClick={onOpenFolder}>
              打开文件夹
            </button>
            {recentFiles.length > 0 && (
              <div className="file-tree-recent">
                <div className="file-tree-recent-header">
                  <div className="recent-header-title">
                    <Clock size={12} />
                    最近打开
                  </div>
                  <button
                    type="button"
                    className="recent-clear-btn compact"
                    onClick={onClearRecent}
                  >
                    清空
                  </button>
                </div>
                {recentFiles.map((rf) => (
                  <div
                    key={rf.path}
                    className={`file-tree-recent-item ${activeFilePath === rf.path ? "active" : ""}`}
                    title={rf.path}
                  >
                    <button
                      type="button"
                      className="file-tree-recent-open"
                      onClick={() => onFileClick(rf.path)}
                    >
                      <span className="file-tree-name">{rf.name}</span>
                    </button>
                    <button
                      type="button"
                      className="file-tree-recent-remove"
                      title="移除"
                      aria-label={`移除最近打开的文件 ${rf.name}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        onRemoveRecent(rf.path);
                      }}
                    >
                      <X size={12} />
                    </button>
                  </div>
                ))}
              </div>
            )}
            {recentWorkspaces.length > 0 && (
              <div className="file-tree-recent">
                <div className="file-tree-recent-header">
                  <div className="recent-header-title">
                    <FolderOpen size={12} />
                    最近工作区
                  </div>
                  <button
                    type="button"
                    className="recent-clear-btn compact"
                    onClick={onClearRecentWorkspaces}
                  >
                    清空
                  </button>
                </div>
                {recentWorkspaces.map((workspace) => (
                  <div
                    key={workspace.path}
                    className="file-tree-recent-item"
                    title={workspace.path}
                  >
                    <button
                      type="button"
                      className="file-tree-recent-open"
                      onClick={() => onOpenRecentWorkspace(workspace.path)}
                    >
                      <span className="file-tree-name">{workspace.name}</span>
                    </button>
                    <button
                      type="button"
                      className="file-tree-recent-remove"
                      title="移除"
                      aria-label={`移除最近工作区 ${workspace.name}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        onRemoveRecentWorkspace(workspace.path);
                      }}
                    >
                      <X size={12} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : tree.length === 0 ? (
          <div className="file-tree-empty">
            <p>未找到 Markdown 文件</p>
          </div>
        ) : (
          tree.map((node) => (
            <FileTreeNode
              key={node.path}
              node={node}
              depth={0}
              expandedDirs={expandedDirs}
              activeFilePath={activeFilePath}
              onToggle={onToggleExpand}
              onFileClick={onFileClick}
              onContextMenu={handleContextMenu}
            />
          ))
        )}
      </div>

      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={contextMenu.items}
          onClose={() => setContextMenu(null)}
        />
      )}

      <PromptDialog config={promptConfig} />
    </div>
  );
}
