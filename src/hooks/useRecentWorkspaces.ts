import { useCallback, useState } from "react";

export interface RecentWorkspace {
  path: string;
  name: string;
  openedAt: number;
}

const STORAGE_KEY = "markdown-editor-recent-workspaces";
const MAX_RECENT = 8;

function getWorkspaceName(path: string): string {
  return path.replace(/\\/g, "/").split("/").filter(Boolean).pop() || path;
}

function loadRecentWorkspaces(): RecentWorkspace[] {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    if (data) {
      return JSON.parse(data) as RecentWorkspace[];
    }
  } catch {
    // ignore
  }

  return [];
}

function saveRecentWorkspaces(workspaces: RecentWorkspace[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(workspaces));
  } catch {
    // ignore
  }
}

export function useRecentWorkspaces() {
  const [recentWorkspaces, setRecentWorkspaces] = useState(loadRecentWorkspaces);

  const addRecentWorkspace = useCallback((path: string) => {
    const workspaces = loadRecentWorkspaces();
    const filtered = workspaces.filter((workspace) => workspace.path !== path);
    filtered.unshift({
      path,
      name: getWorkspaceName(path),
      openedAt: Date.now(),
    });

    const trimmed = filtered.slice(0, MAX_RECENT);
    saveRecentWorkspaces(trimmed);
    setRecentWorkspaces(trimmed);
  }, []);

  const removeRecentWorkspace = useCallback((path: string) => {
    const filtered = loadRecentWorkspaces().filter((workspace) => workspace.path !== path);
    saveRecentWorkspaces(filtered);
    setRecentWorkspaces(filtered);
  }, []);

  const clearRecentWorkspaces = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setRecentWorkspaces([]);
  }, []);

  return {
    recentWorkspaces,
    addRecentWorkspace,
    removeRecentWorkspace,
    clearRecentWorkspaces,
  };
}
