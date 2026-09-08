import { useCallback, useEffect, useRef } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import type { SessionState } from "./useSession";
import type { FileState } from "./useFileSystem";

interface UseAppLifecycleParams {
  openFileByPath: (path: string) => Promise<boolean>;
  saveSession: (state: SessionState) => Promise<void>;
  checkExternalChanges: () => Promise<FileState[]>;
  reloadTabFromDisk: (tabId: string) => Promise<boolean>;
  allowWindowCloseRef: React.MutableRefObject<boolean>;
  captureActiveTabViewState: () => void;
  getTabsSnapshot: () => FileState[];
  buildSessionState: (
    sessionTabs?: FileState[],
    sessionActiveTabId?: string | null,
    currentPath?: string | null
  ) => SessionState;
  activeTabId: string | null;
  sessionReady: boolean;
  /** Needed to re-register the close listener after dialog dismiss (Tauri 2 quirk) */
  appCloseRequestDirty: number;
  /** Called when external file modifications are detected (for non-blocking toast). */
  onExternalChange?: (count: number) => void;
  /** Called when externally modified files were skipped because of local unsaved edits. */
  onExternalChangeSkipped?: (count: number) => void;
  setInitialized: (v: boolean) => void;
  setShowHome: (v: boolean) => void;
  setHomeResumeTarget: (v: { path: string; name: string } | null) => void;
  setAppCloseRequest: (
    v: { unsavedTabs: Array<{ id: string; name: string; path: string | null }> } | null
  ) => void;
}

/**
 * Consolidates window-level lifecycle concerns:
 *   - External file-open events (file association / single-instance forwarding)
 *   - Window close request handling (unsaved-tab confirmation)
 *   - External file change detection on window focus
 */
export function useAppLifecycle(params: UseAppLifecycleParams) {
  const {
    openFileByPath,
    saveSession,
    checkExternalChanges,
    reloadTabFromDisk,
    allowWindowCloseRef,
    captureActiveTabViewState,
    getTabsSnapshot,
    buildSessionState,
    activeTabId,
    sessionReady,
    appCloseRequestDirty,
    onExternalChange,
    onExternalChangeSkipped,
    setInitialized,
    setShowHome,
    setHomeResumeTarget,
    setAppCloseRequest,
  } = params;

  // ── 1. External file-open listener (OS file association / single-instance forwarding) ──
  useEffect(() => {
    if (!sessionReady) return;

    let disposed = false;
    const setup = async () => {
      const openPendingFiles = async () => {
        if (disposed) return;
        const paths = await invoke<string[]>("take_pending_open_files").catch(() => []);
        if (paths.length === 0) return;

        try {
          await getCurrentWindow().setFocus();
        } catch { /* browser dev mode */ }

        for (const filePath of paths) {
          const opened = await openFileByPath(filePath);
          if (opened) {
            setInitialized(true);
            setShowHome(false);
            setHomeResumeTarget(null);
          }
        }
      };

      const unlisten = await listen("open-file-requested", openPendingFiles);
      await openPendingFiles();
      return unlisten;
    };

    const unlistenPromise = setup();
    return () => {
      disposed = true;
      void unlistenPromise.then((fn) => fn?.());
    };
  }, [openFileByPath, sessionReady, setInitialized, setShowHome, setHomeResumeTarget]);

  // ── 2. Window close helper (shared by direct-close and dialog-confirm paths) ──
  const requestWindowClose = useCallback(async (): Promise<boolean> => {
    allowWindowCloseRef.current = true;
    try {
      await invoke("exit_app");
      return true;
    } catch (error) {
      console.error("Failed to exit application:", error);
      allowWindowCloseRef.current = false;
      return false;
    }
  }, [allowWindowCloseRef]);

  // ── 3. Window close request handler ──
  const closingRef = useRef(false);
  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | null = null;
    try {
      void getCurrentWindow()
        .onCloseRequested(async (event) => {
          if (allowWindowCloseRef.current) return;
          event.preventDefault();
          if (closingRef.current) return;
          closingRef.current = true;
          captureActiveTabViewState();

          const sessionTabs = getTabsSnapshot();
          const unsavedTabs = sessionTabs
            .filter((tab) => !tab.saved)
            .map((tab) => ({ id: tab.id, name: tab.name, path: tab.path }));

          if (unsavedTabs.length === 0) {
            const currentPath =
              sessionTabs.find((tab) => tab.id === activeTabId)?.path ?? null;
            await saveSession(
              buildSessionState(sessionTabs, activeTabId, currentPath)
            ).catch((e) => console.error("Failed to save session before close:", e));
            const closed = await requestWindowClose();
            if (!closed) closingRef.current = false;
            return;
          }

          setAppCloseRequest({ unsavedTabs });
          closingRef.current = false;
        })
        .then((dispose) => {
          if (disposed) {
            dispose();
          } else {
            unlisten = dispose;
          }
        })
        .catch((error) => {
          closingRef.current = false;
          console.error("Failed to register close handler:", error);
        });
    } catch { /* browser dev mode */ }

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [
    activeTabId,
    appCloseRequestDirty,
    buildSessionState,
    captureActiveTabViewState,
    getTabsSnapshot,
    saveSession,
    setAppCloseRequest,
    requestWindowClose,
    allowWindowCloseRef,
  ]);

  // ── 4. External file change detection on window focus ──
  const checkingRef = useRef(false);
  useEffect(() => {
    const handleFocus = () => {
      if (checkingRef.current) return;
      checkingRef.current = true;
      void (async () => {
        try {
          const changedTabs = await checkExternalChanges();
          if (changedTabs.length === 0) return;

          let reloaded = 0;
          let skipped = 0;
          for (const tab of changedTabs) {
            if (!tab.saved) {
              skipped++;
              continue;
            }
            if (await reloadTabFromDisk(tab.id)) {
              reloaded++;
            } else {
              skipped++;
            }
          }

          if (reloaded > 0) onExternalChange?.(reloaded);
          if (skipped > 0) {
            // Tell the user instead of silently letting autosave overwrite the
            // external edits later.
            onExternalChangeSkipped?.(skipped);
          }
        } finally {
          checkingRef.current = false;
        }
      })();
    };
    window.addEventListener("focus", handleFocus);
    return () => window.removeEventListener("focus", handleFocus);
  }, [checkExternalChanges, onExternalChange, onExternalChangeSkipped, reloadTabFromDisk]);

  return { requestWindowClose };
}
