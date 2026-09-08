import { useState, useCallback } from "react";

export interface RecentFile {
  path: string;
  name: string;
  openedAt: number;
}

const STORAGE_KEY = "markdown-editor-recent-files";
const MAX_RECENT = 10;

function loadRecentFiles(): RecentFile[] {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    if (data) return JSON.parse(data) as RecentFile[];
  } catch {
    // ignore
  }
  return [];
}

function saveRecentFiles(files: RecentFile[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(files));
  } catch {
    // ignore
  }
}

export function useRecentFiles() {
  const [recentFiles, setRecentFiles] = useState<RecentFile[]>(loadRecentFiles);

  const addRecentFile = useCallback((path: string, name: string) => {
    const files = loadRecentFiles();
    // Remove existing entry for same path
    const filtered = files.filter((f) => f.path !== path);
    // Add to front
    filtered.unshift({ path, name, openedAt: Date.now() });
    // Trim
    const trimmed = filtered.slice(0, MAX_RECENT);
    saveRecentFiles(trimmed);
    setRecentFiles(trimmed);
  }, []);

  const removeRecentFile = useCallback((path: string) => {
    const files = loadRecentFiles();
    const filtered = files.filter((file) => file.path !== path);
    saveRecentFiles(filtered);
    setRecentFiles(filtered);
  }, []);

  const clearRecentFiles = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setRecentFiles([]);
  }, []);

  return { recentFiles, addRecentFile, removeRecentFile, clearRecentFiles };
}
