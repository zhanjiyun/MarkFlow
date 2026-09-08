import { useCallback, useEffect, useRef, useState } from "react";
import { ask, open as openDialog } from "@tauri-apps/plugin-dialog";
import { readDir, remove, rename, watch, writeTextFile } from "@tauri-apps/plugin-fs";

export interface FileTreeNode {
  name: string;
  path: string;
  isDir: boolean;
  children?: FileTreeNode[];
}

export interface WorkspaceFile {
  name: string;
  path: string;
  relativePath: string;
}

interface UseWorkspaceReturn {
  workspacePath: string | null;
  tree: FileTreeNode[];
  allFiles: WorkspaceFile[];
  expandedDirs: Set<string>;
  openFolder: () => Promise<string | null>;
  openFolderByPath: (path: string) => Promise<void>;
  toggleExpand: (dirPath: string) => Promise<void>;
  refreshTree: () => Promise<void>;
  createFile: (parentDir: string, fileName: string) => Promise<string | null>;
  renameFile: (filePath: string, newName: string) => Promise<boolean>;
  deleteFile: (filePath: string) => Promise<boolean>;
}

const MARKDOWN_FILE_RE = /\.(md|markdown|mdown|mdx)$/i;

function normalizePath(path: string): string {
  return path.replace(/\\/g, "/").replace(/\/+$/, "");
}

function joinPath(basePath: string, name: string): string {
  return `${normalizePath(basePath)}/${name}`;
}

function sortNodes(a: FileTreeNode, b: FileTreeNode): number {
  if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
  return a.name.localeCompare(b.name, "zh-CN");
}

export function useWorkspace(): UseWorkspaceReturn {
  const [workspacePath, setWorkspacePath] = useState<string | null>(null);
  const [tree, setTree] = useState<FileTreeNode[]>([]);
  const [allFiles, setAllFiles] = useState<WorkspaceFile[]>([]);
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set());
  const unwatchRef = useRef<(() => void) | null>(null);
  const workspacePathRef = useRef<string | null>(null);
  const expandedDirsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    workspacePathRef.current = workspacePath;
  }, [workspacePath]);

  useEffect(() => {
    expandedDirsRef.current = expandedDirs;
  }, [expandedDirs]);

  const readDirectory = useCallback(async (dirPath: string): Promise<FileTreeNode[]> => {
    try {
      const entries = await readDir(dirPath);
      const nodes: FileTreeNode[] = [];

      for (const entry of entries) {
        if (!entry.name) continue;

        const fullPath = joinPath(dirPath, entry.name);
        const isDir = entry.isDirectory ?? false;
        if (!isDir && !MARKDOWN_FILE_RE.test(entry.name)) continue;

        nodes.push({
          name: entry.name,
          path: fullPath,
          isDir,
        });
      }

      return nodes.sort(sortNodes);
    } catch (error) {
      console.error("Failed to read directory:", error);
      return [];
    }
  }, []);

  const scanWorkspaceFiles = useCallback(async (dirPath: string, prefix = ""): Promise<WorkspaceFile[]> => {
    try {
      const entries = await readDir(dirPath);
      const results: WorkspaceFile[] = [];

      for (const entry of entries) {
        if (!entry.name) continue;

        const fullPath = joinPath(dirPath, entry.name);
        const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;

        if (entry.isDirectory) {
          results.push(...(await scanWorkspaceFiles(fullPath, relativePath)));
          continue;
        }

        if (MARKDOWN_FILE_RE.test(entry.name)) {
          results.push({
            name: entry.name,
            path: fullPath,
            relativePath,
          });
        }
      }

      return results.sort((a, b) => a.relativePath.localeCompare(b.relativePath, "zh-CN"));
    } catch (error) {
      console.error("Failed to scan workspace files:", error);
      return [];
    }
  }, []);

  const hydrateExpandedTree = useCallback(
    async (nodes: FileTreeNode[], expanded: Set<string>): Promise<FileTreeNode[]> =>
      Promise.all(
        nodes.map(async (node) => {
          if (!node.isDir || !expanded.has(node.path)) return node;

          const children = await readDirectory(node.path);
          return {
            ...node,
            children: await hydrateExpandedTree(children, expanded),
          };
        })
      ),
    [readDirectory]
  );

  const refreshTree = useCallback(async () => {
    const currentWorkspace = workspacePathRef.current;
    if (!currentWorkspace) return;

    const [rootNodes, indexedFiles] = await Promise.all([
      readDirectory(currentWorkspace),
      scanWorkspaceFiles(currentWorkspace),
    ]);
    const hydratedTree = await hydrateExpandedTree(rootNodes, expandedDirsRef.current);

    setTree(hydratedTree);
    setAllFiles(indexedFiles);
  }, [hydrateExpandedTree, readDirectory, scanWorkspaceFiles]);

  const startWatching = useCallback(
    async (path: string) => {
      unwatchRef.current?.();
      unwatchRef.current = null;

      try {
        unwatchRef.current = await watch(
          path,
          () => {
            void refreshTree();
          },
          { recursive: true, delayMs: 250 }
        );
      } catch (error) {
        console.warn("Workspace watch unavailable:", error);
      }
    },
    [refreshTree]
  );

  const openFolderByPath = useCallback(
    async (path: string) => {
      const normalizedPath = normalizePath(path);

      workspacePathRef.current = normalizedPath;
      expandedDirsRef.current = new Set();
      setWorkspacePath(normalizedPath);
      setExpandedDirs(new Set());
      setTree([]);
      setAllFiles([]);

      const [rootNodes, indexedFiles] = await Promise.all([
        readDirectory(normalizedPath),
        scanWorkspaceFiles(normalizedPath),
      ]);

      setTree(rootNodes);
      setAllFiles(indexedFiles);
      await startWatching(normalizedPath);
    },
    [readDirectory, scanWorkspaceFiles, startWatching]
  );

  const openFolder = useCallback(async (): Promise<string | null> => {
    try {
      const selected = await openDialog({
        directory: true,
        multiple: false,
        title: "选择工作区文件夹",
      });

      if (!selected || typeof selected !== "string") return null;

      await openFolderByPath(selected);
      return selected;
    } catch (error) {
      console.error("打开文件夹失败:", error);
      return null;
    }
  }, [openFolderByPath]);

  const toggleExpand = useCallback(
    async (dirPath: string) => {
      if (expandedDirsRef.current.has(dirPath)) {
        setExpandedDirs((current) => {
          const next = new Set(current);
          next.delete(dirPath);
          expandedDirsRef.current = next;
          return next;
        });

        setTree((currentTree) => {
          const collapseNode = (nodes: FileTreeNode[]): FileTreeNode[] =>
            nodes.map((node) => {
              if (node.path === dirPath) {
                return { ...node, children: undefined };
              }
              if (node.children) {
                return { ...node, children: collapseNode(node.children) };
              }
              return node;
            });

          return collapseNode(currentTree);
        });
        return;
      }

      const nextExpanded = new Set(expandedDirsRef.current);
      nextExpanded.add(dirPath);
      expandedDirsRef.current = nextExpanded;
      setExpandedDirs(nextExpanded);

      const children = await readDirectory(dirPath);
      const hydratedChildren = await hydrateExpandedTree(children, nextExpanded);

      setTree((currentTree) => {
        const expandNode = (nodes: FileTreeNode[]): FileTreeNode[] =>
          nodes.map((node) => {
            if (node.path === dirPath) {
              return { ...node, children: hydratedChildren };
            }
            if (node.children) {
              return { ...node, children: expandNode(node.children) };
            }
            return node;
          });

        return expandNode(currentTree);
      });
    },
    [hydrateExpandedTree, readDirectory]
  );

  /** Create a new Markdown file. `fileName` is the user-entered name (may omit .md). */
  const createFile = useCallback(
    async (parentDir: string, fileName: string): Promise<string | null> => {
      const name = fileName.trim();
      if (!name) return null;

      const finalName = MARKDOWN_FILE_RE.test(name) ? name : `${name}.md`;
      const filePath = joinPath(parentDir, finalName);

      try {
        await writeTextFile(filePath, "");
        await refreshTree();
        return filePath;
      } catch (error) {
        console.error("创建文件失败:", error);
        return null;
      }
    },
    [refreshTree]
  );

  /** Rename a file. `newName` is the user-entered name. */
  const renameFile = useCallback(
    async (filePath: string, newName: string): Promise<boolean> => {
      const oldName = filePath.replace(/\\/g, "/").split("/").pop() || "";
      const name = newName.trim();
      if (!name || name === oldName) return false;

      const parentDir = filePath.replace(/\\/g, "/").split("/").slice(0, -1).join("/");
      const newPath = `${parentDir}/${name}`;

      try {
        await rename(filePath, newPath);
        await refreshTree();
        return true;
      } catch (error) {
        console.error("重命名失败:", error);
        return false;
      }
    },
    [refreshTree]
  );

  const deleteFile = useCallback(
    async (filePath: string): Promise<boolean> => {
      const name = filePath.replace(/\\/g, "/").split("/").pop() || "";
      const confirmed = await ask(`确定删除“${name}”吗？`, {
        title: "删除文件",
        kind: "warning",
      });
      if (!confirmed) return false;

      try {
        await remove(filePath, { recursive: true });
        await refreshTree();
        return true;
      } catch (error) {
        console.error("删除失败:", error);
        return false;
      }
    },
    [refreshTree]
  );

  useEffect(() => {
    return () => {
      unwatchRef.current?.();
      unwatchRef.current = null;
    };
  }, []);

  return {
    workspacePath,
    tree,
    allFiles,
    expandedDirs,
    openFolder,
    openFolderByPath,
    toggleExpand,
    refreshTree,
    createFile,
    renameFile,
    deleteFile,
  };
}
