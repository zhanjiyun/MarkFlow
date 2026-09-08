import { ChevronRight, ChevronDown, FileText, Folder } from "lucide-react";
import type { FileTreeNode as FileTreeNodeType } from "../hooks/useWorkspace";

interface FileTreeNodeProps {
  node: FileTreeNodeType;
  depth: number;
  expandedDirs: Set<string>;
  activeFilePath: string | null;
  onToggle: (path: string) => void;
  onFileClick: (path: string) => void;
  onContextMenu: (e: React.MouseEvent, filePath: string, isDir: boolean) => void;
}

export default function FileTreeNode({
  node,
  depth,
  expandedDirs,
  activeFilePath,
  onToggle,
  onFileClick,
  onContextMenu,
}: FileTreeNodeProps) {
  const paddingLeft = 12 + depth * 16;
  const isExpanded = expandedDirs.has(node.path);

  if (node.isDir) {
    const isLoading = !node.children && isExpanded;
    return (
      <div>
        <div
          className="file-tree-item directory"
          style={{ paddingLeft }}
          onClick={() => onToggle(node.path)}
          onContextMenu={(e) => onContextMenu(e, node.path, true)}
        >
          <span className="file-tree-chevron">
            {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </span>
          <Folder size={14} className="file-tree-icon folder" />
          <span className="file-tree-name">{node.name}</span>
          {isLoading && <span className="file-tree-loading">...</span>}
        </div>
        {isExpanded && node.children && (
          <div>
            {node.children.map((child) => (
              <FileTreeNode
                key={child.path}
                node={child}
                depth={depth + 1}
                expandedDirs={expandedDirs}
                activeFilePath={activeFilePath}
                onToggle={onToggle}
                onFileClick={onFileClick}
                onContextMenu={onContextMenu}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      className={`file-tree-item file ${activeFilePath === node.path ? "active" : ""}`}
      style={{ paddingLeft: paddingLeft + 22 }}
      onClick={() => onFileClick(node.path)}
      onContextMenu={(e) => onContextMenu(e, node.path, false)}
      draggable
      onDragStart={(e) => {
        const name = node.name.replace(/\.md$/i, "");
        const link = `[${name}](${node.path})`;
        e.dataTransfer.setData("text/plain", link);
        e.dataTransfer.effectAllowed = "copy";
      }}
    >
      <FileText size={14} className="file-tree-icon file" />
      <span className="file-tree-name">{node.name}</span>
    </div>
  );
}
