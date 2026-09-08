import { useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { TabViewState } from "../types/tabState";

export type StartupBehavior = "resume" | "home";

export interface SessionTabState {
  id: string;
  path: string | null;
  name: string;
  content: string;
  saved: boolean;
  pinned?: boolean;
  viewState?: TabViewState;
}

export interface SessionState {
  theme: "light" | "dark";
  showSidebar: boolean;
  sidebarTab: "files" | "outline";
  sidebarWidth: number;
  splitRatio: number;
  viewMode: "edit" | "preview" | "split" | "wysiwyg";
  editMode: "wysiwyg" | "source";
  syncScroll: boolean;
  focusMode: boolean;
  zenMode: boolean;
  previewFontScale: number;
  startupBehavior: StartupBehavior;
  openTabs: SessionTabState[];
  activeTabId: string | null;
  workspacePath: string | null;
  currentFilePath: string | null;
  /** Window geometry for session restore (optional for backward compat) */
  windowX?: number;
  windowY?: number;
  windowWidth?: number;
  windowHeight?: number;
}

export function useSession() {
  const saveSession = useCallback(async (state: SessionState) => {
    try {
      await invoke("save_session", { data: JSON.stringify(state) });
    } catch {
      // Ignore session save errors to avoid interrupting editing.
    }
  }, []);

  const loadSession = useCallback(async (): Promise<SessionState | null> => {
    try {
      const raw = await invoke<string>("load_session");
      if (!raw) return null;

      const parsed = JSON.parse(raw) as SessionState;
      return parsed;
    } catch {
      return null;
    }
  }, []);

  return { saveSession, loadSession };
}
