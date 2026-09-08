import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { confirm, open, save } from "@tauri-apps/plugin-dialog";
import { readTextFile } from "@tauri-apps/plugin-fs";
import type { SessionTabState } from "./useSession";
import {
  UNTITLED_NAME,
  getFileName,
  getNextUntitledName,
  selectNextActive,
  shouldReplacePlaceholder,
} from "./fileSystemLogic";

export interface FileState {
  id: string;
  path: string | null;
  name: string;
  content: string;
  saved: boolean;
  pinned: boolean;
}

export type SaveStatus = "saved" | "unsaved" | "saving" | "error";
type CloseStrategy = "prompt" | "save" | "discard";

const AUTO_SAVE_DELAY = 1000;
const UNTITLED_PERSIST_DELAY = 5000;

function writeFileRust(path: string, content: string): Promise<void> {
  return invoke("write_file_content", { path, content });
}

function createTabId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `tab-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function createUntitledTab(name = UNTITLED_NAME): FileState {
  return {
    id: createTabId(),
    path: null,
    name,
    content: "",
    saved: true,
    pinned: false,
  };
}

/** Compare paths ignoring separator style — the file tree, the native dialog
 * and OS file association hand us the same file with different separators. */
function samePath(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  return a.replace(/\\/g, "/") === b.replace(/\\/g, "/");
}

export function useFileSystem() {
  // 启动时标签栏为空，直接显示主页（不再预置一个未命名标签）。
  const [tabs, setTabs] = useState<FileState[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("saved");
  const [lastError, setLastError] = useState<string | null>(null);
  const tabsRef = useRef(tabs);
  const activeTabIdRef = useRef<string | null>(activeTabId);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const untitledTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const errorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Tracks the mtime of each opened file so we can detect external changes. */
  const fileMtimesRef = useRef<Record<string, number>>({});

  tabsRef.current = tabs;
  activeTabIdRef.current = activeTabId;

  const activeTab = useMemo(
    () => tabs.find((tab) => tab.id === activeTabId) ?? tabs[0] ?? createUntitledTab(),
    [activeTabId, tabs]
  );

  const file = activeTab;

  const clearPendingSave = useCallback(() => {
    if (timerRef.current) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const showError = useCallback((message: string) => {
    setLastError(message);
    if (errorTimerRef.current) {
      window.clearTimeout(errorTimerRef.current);
    }
    errorTimerRef.current = window.setTimeout(() => {
      setLastError(null);
      errorTimerRef.current = null;
    }, 5000);
  }, []);

  const clearError = useCallback(() => {
    if (errorTimerRef.current) {
      window.clearTimeout(errorTimerRef.current);
      errorTimerRef.current = null;
    }
    setLastError(null);
  }, []);

  /** Clean up a recovery file for a tab that got saved or closed. */
  const cleanupUntitledDoc = useCallback(async (id: string): Promise<void> => {
    try {
      await invoke("remove_untitled_doc", { id });
    } catch {
      // Recovery cleanup is best effort during normal editing.
    }
  }, []);

  const replaceTab = useCallback((nextTab: FileState) => {
    const nextTabs = tabsRef.current.map((tab) => (tab.id === nextTab.id ? nextTab : tab));
    tabsRef.current = nextTabs;
    setTabs(nextTabs);
  }, []);

  const saveTabToPath = useCallback(
    async (tab: FileState, targetPath: string): Promise<boolean> => {
      setSaveStatus("saving");
      try {
        await writeFileRust(targetPath, tab.content);
        const mtime = await invoke<number | null>("get_file_mtime", { path: targetPath }).catch(
          () => null
        );
        replaceTab({
          ...tab,
          path: targetPath,
          name: getFileName(targetPath),
          saved: true,
        });
        setSaveStatus("saved");
        clearError();
        if (mtime != null) {
          fileMtimesRef.current[targetPath] = mtime;
        }
        // Clean up untitled recovery file now that the tab has a real path
        void cleanupUntitledDoc(tab.id);
        return true;
      } catch (error) {
        console.error(error);
        setSaveStatus("error");
        showError(`保存失败：${tab.name}`);
        return false;
      }
    },
    [cleanupUntitledDoc, clearError, replaceTab, showError]
  );

  const saveTabAsInternal = useCallback(
    async (tab: FileState): Promise<boolean> => {
      try {
        const targetPath = await save({
          filters: [{ name: "Markdown", extensions: ["md", "markdown", "mdown", "mdx"] }],
          defaultPath: tab.path ? tab.name : "untitled.md",
        });
        if (!targetPath) return false;

        return saveTabToPath(tab, targetPath);
      } catch (error) {
        console.error(error);
        setSaveStatus("error");
        showError("另存为失败");
        return false;
      }
    },
    [saveTabToPath, showError]
  );

  const activateTab = useCallback(async (tabId: string) => {
    const current = tabsRef.current.find((tab) => tab.id === activeTabIdRef.current);
    if (current?.path && !current.saved) {
      await saveTabToPath(current, current.path);
    }

    clearPendingSave();
    activeTabIdRef.current = tabId;
    setActiveTabId(tabId);
  }, [clearPendingSave, saveTabToPath]);

  const saveExistingFile = useCallback(async (): Promise<boolean> => {
    const current = tabsRef.current.find((tab) => tab.id === activeTabIdRef.current);
    if (!current?.path) return false;
    return saveTabToPath(current, current.path);
  }, [saveTabToPath]);

  const saveAsInternal = useCallback(
    async (content?: string): Promise<boolean> => {
      const current = tabsRef.current.find((tab) => tab.id === activeTabIdRef.current);
      if (!current) return false;

      return saveTabAsInternal({
        ...current,
        content: content ?? current.content,
      });
    },
    [saveTabAsInternal]
  );

  const confirmDiscardTab = useCallback(
    async (tab: FileState): Promise<boolean> => {
      const isEmptyUntitled = !tab.path && tab.content.trim() === "";

      if (tab.saved || isEmptyUntitled) return true;

      const shouldSave = await confirm(`文档“${tab.name}”有未保存的更改，是否先保存？`, {
        title: "未保存的更改",
        kind: "warning",
        okLabel: "保存",
        cancelLabel: "继续不保存",
      });

      if (shouldSave) {
        const latest = tabsRef.current.find((item) => item.id === tab.id) ?? tab;
        return latest.path ? saveTabToPath(latest, latest.path) : saveTabAsInternal(latest);
      }

      return confirm(`确定放弃“${tab.name}”的当前更改并继续吗？`, {
        title: "放弃更改",
        kind: "warning",
        okLabel: "继续",
        cancelLabel: "取消",
      });
    },
    [saveTabAsInternal, saveTabToPath]
  );

  // ── Untitled document persistence (placed before auto-save effect that uses it) ──
  const persistUntitledDocs = useCallback(() => {
    const untitled = tabsRef.current.filter((t) => !t.path);
    if (untitled.length === 0) return;
    invoke("save_untitled_docs", {
      docs: untitled.map((t) => ({ id: t.id, name: t.name, content: t.content })),
    }).catch(() => {});
  }, []);

  const scheduleUntitledPersist = useCallback(() => {
    if (untitledTimerRef.current) window.clearTimeout(untitledTimerRef.current);
    untitledTimerRef.current = window.setTimeout(() => {
      persistUntitledDocs();
    }, UNTITLED_PERSIST_DELAY);
  }, [persistUntitledDocs]);

  useEffect(() => {
    if (!activeTab) return;

    if (!activeTab.path) {
      clearPendingSave();
      setSaveStatus(activeTab.saved ? "saved" : "unsaved");
      // Persist untitled content to disk for crash recovery
      if (!activeTab.saved) scheduleUntitledPersist();
      return;
    }

    if (activeTab.saved) {
      clearPendingSave();
      setSaveStatus("saved");
      return;
    }

    setSaveStatus("unsaved");
    clearPendingSave();
    timerRef.current = window.setTimeout(() => {
      void saveExistingFile();
    }, AUTO_SAVE_DELAY);

    return clearPendingSave;
  }, [activeTab, clearPendingSave, saveExistingFile, scheduleUntitledPersist]);

  useEffect(() => {
    const handleBlur = () => {
      const current = tabsRef.current.find((tab) => tab.id === activeTabIdRef.current);
      if (current?.path && !current.saved) {
        void saveTabToPath(current, current.path);
      }
    };

    window.addEventListener("blur", handleBlur);
    return () => window.removeEventListener("blur", handleBlur);
  }, [saveTabToPath]);

  useEffect(() => {
    return () => {
      clearPendingSave();
      if (untitledTimerRef.current) window.clearTimeout(untitledTimerRef.current);
      if (errorTimerRef.current) {
        window.clearTimeout(errorTimerRef.current);
      }
    };
  }, [clearPendingSave]);

  const flushSave = useCallback(async () => {
    clearPendingSave();
    const pending = tabsRef.current.filter((tab) => tab.path && !tab.saved);
    for (const tab of pending) {
      await saveTabToPath(tab, tab.path!);
    }
  }, [clearPendingSave, saveTabToPath]);

  const newFile = useCallback(async (): Promise<boolean> => {
    const nextTab = createUntitledTab(getNextUntitledName(tabsRef.current));
    clearPendingSave();
    const nextTabs = [...tabsRef.current, nextTab];
    tabsRef.current = nextTabs;
    activeTabIdRef.current = nextTab.id;
    setTabs(nextTabs);
    setActiveTabId(nextTab.id);
    setSaveStatus("saved");
    clearError();
    return true;
  }, [clearError, clearPendingSave]);

  const openFile = useCallback(async (): Promise<boolean> => {
    try {
      const selected = await open({
        multiple: false,
        filters: [
          { name: "Markdown", extensions: ["md", "markdown", "mdown", "mdx"] },
          { name: "所有文件", extensions: ["*"] },
        ],
      });

      if (!selected || typeof selected !== "string") return false;

      const existingTab = tabsRef.current.find((tab) => samePath(tab.path, selected));
      if (existingTab) {
        await activateTab(existingTab.id);
        clearError();
        return true;
      }

      const [content, mtime] = await Promise.all([
        readTextFile(selected),
        invoke<number | null>("get_file_mtime", { path: selected }).catch(() => null),
      ]);
      const nextTab: FileState = {
        id: createTabId(),
        path: selected,
        name: getFileName(selected),
        content,
        saved: true,
        pinned: false,
      };

      clearPendingSave();

      // If the only existing tab is an untouched placeholder, replace it.
      const currentTabs = tabsRef.current;
      const onlyPlaceholder = shouldReplacePlaceholder(currentTabs);

      if (onlyPlaceholder) {
        tabsRef.current = [nextTab];
        setTabs([nextTab]);
      } else {
        const nextTabs = [...currentTabs, nextTab];
        tabsRef.current = nextTabs;
        setTabs(nextTabs);
      }

      activeTabIdRef.current = nextTab.id;
      setActiveTabId(nextTab.id);
      setSaveStatus("saved");
      clearError();
      if (mtime != null) fileMtimesRef.current[selected] = mtime;
      return true;
    } catch (error) {
      console.error(error);
      setSaveStatus("error");
      showError("打开文件失败");
      return false;
    }
  }, [activateTab, clearError, clearPendingSave, showError]);

  const openFileByPath = useCallback(
    async (path: string): Promise<boolean> => {
      const existingTab = tabsRef.current.find((tab) => samePath(tab.path, path));
      if (existingTab) {
        await activateTab(existingTab.id);
        clearError();
        return true;
      }

      try {
        const [content, mtime] = await Promise.all([
          invoke<string>("read_file_content", { path }),
          invoke<number | null>("get_file_mtime", { path }).catch(() => null),
        ]);
        const nextTab: FileState = {
          id: createTabId(),
          path,
          name: getFileName(path),
          content,
          saved: true,
          pinned: false,
        };

        clearPendingSave();

        // If the only existing tab is an untouched placeholder, replace it.
        // Otherwise add the new tab normally.
        const currentTabs = tabsRef.current;
        const onlyPlaceholder = shouldReplacePlaceholder(currentTabs);

        if (onlyPlaceholder) {
          tabsRef.current = [nextTab];
          setTabs([nextTab]);
        } else {
          const nextTabs = [...currentTabs, nextTab];
          tabsRef.current = nextTabs;
          setTabs(nextTabs);
        }

        activeTabIdRef.current = nextTab.id;
        setActiveTabId(nextTab.id);
        setSaveStatus("saved");
        clearError();
        if (mtime != null) fileMtimesRef.current[path] = mtime;
        return true;
      } catch (error) {
        console.error(error);
        setSaveStatus("error");
        showError(`无法打开：${path}`);
        return false;
      }
    },
    [activateTab, clearError, clearPendingSave, showError]
  );

  const saveFile = useCallback(async (): Promise<boolean> => {
    clearPendingSave();
    const current = tabsRef.current.find((tab) => tab.id === activeTabIdRef.current);
    if (!current) return false;

    return current.path ? saveTabToPath(current, current.path) : saveAsInternal(current.content);
  }, [clearPendingSave, saveAsInternal, saveTabToPath]);

  const saveAs = useCallback(
    async (content?: string): Promise<boolean> => saveAsInternal(content),
    [saveAsInternal]
  );

  const updateContent = useCallback((content: string) => {
    const nextTabs = tabsRef.current.map((tab) =>
        tab.id === activeTabIdRef.current
          ? {
              ...tab,
              content,
              saved: false,
            }
          : tab
    );
    tabsRef.current = nextTabs;
    setTabs(nextTabs);
  }, []);

  const renameTab = useCallback((tabId: string, nextName: string): boolean => {
    const normalized = nextName.trim();
    if (!normalized) return false;

    const finalName = /\.[^\\/.\s]+$/.test(normalized) ? normalized : `${normalized}.md`;
    const target = tabsRef.current.find((tab) => tab.id === tabId);
    if (!target || target.path) return false;

    const nextTabs = tabsRef.current.map((tab) =>
      tab.id === tabId ? { ...tab, name: finalName } : tab
    );
    tabsRef.current = nextTabs;
    setTabs(nextTabs);
    return true;
  }, []);

  const setTabPinned = useCallback((tabId: string, pinned: boolean): boolean => {
    const target = tabsRef.current.find((tab) => tab.id === tabId);
    if (!target || target.pinned === pinned) return false;

    const nextTabs = tabsRef.current.map((tab) =>
      tab.id === tabId ? { ...tab, pinned } : tab
    );
    tabsRef.current = nextTabs;
    setTabs(nextTabs);
    return true;
  }, []);

  const saveTabs = useCallback(
    async (tabIds: string[]): Promise<boolean> => {
      const idSet = new Set(tabIds);
      const targetTabs = tabsRef.current.filter((tab) => idSet.has(tab.id) && !tab.saved);

      for (const tab of targetTabs) {
        const ok = tab.path ? await saveTabToPath(tab, tab.path) : await saveTabAsInternal(tab);
        if (!ok) {
          return false;
        }
      }

      return true;
    },
    [saveTabAsInternal, saveTabToPath]
  );

  const removeTabsByIds = useCallback(
    (tabIds: string[]) => {
      const closingSet = new Set(tabIds);
      if (closingSet.size === 0) return true;

      // Clean up recovery files for untitled tabs being closed
      for (const tab of tabsRef.current) {
        if (closingSet.has(tab.id) && !tab.path) {
          void cleanupUntitledDoc(tab.id);
        }
      }

      // Only cancel the pending save when the active tab itself is closing —
      // closing a different tab must not drop the active tab's pending autosave.
      if (activeTabIdRef.current && closingSet.has(activeTabIdRef.current)) {
        clearPendingSave();
      }
      const currentTabs = tabsRef.current;
      const nextTabs = currentTabs.filter((tab) => !closingSet.has(tab.id));

      if (nextTabs.length === 0) {
        // All tabs closed: go to empty state, let the UI show the home page.
        // No fallback untitled tab is created – the user explicitly closed the last tab.
        tabsRef.current = [];
        activeTabIdRef.current = null;
        setTabs([]);
        setActiveTabId(null);
        setSaveStatus("saved");
        clearError();
        return true;
      }

      const nextActiveId = selectNextActive(currentTabs, [...closingSet], activeTabIdRef.current);
      const nextActive = nextTabs.find((tab) => tab.id === nextActiveId) ?? nextTabs[0];

      tabsRef.current = nextTabs;
      activeTabIdRef.current = nextActive.id;
      setTabs(nextTabs);
      setActiveTabId(nextActive.id);
      clearError();
      return true;
    },
    [cleanupUntitledDoc, clearError, clearPendingSave]
  );

  const closeTabsWithStrategy = useCallback(
    async (tabIds: string[], strategy: CloseStrategy): Promise<boolean> => {
      const existingTabs = tabsRef.current.filter((tab) => tabIds.includes(tab.id));
      if (existingTabs.length === 0) return false;

      if (strategy === "save") {
        for (const tab of existingTabs) {
          const ok = tab.path ? await saveTabToPath(tab, tab.path) : await saveTabAsInternal(tab);
          if (!ok) {
            return false;
          }
        }
        return removeTabsByIds(existingTabs.map((tab) => tab.id));
      }

      if (strategy === "discard") {
        return removeTabsByIds(existingTabs.map((tab) => tab.id));
      }

      for (const tab of existingTabs) {
        const ok = await confirmDiscardTab(tab);
        if (!ok) {
          return false;
        }
      }

      return removeTabsByIds(existingTabs.map((tab) => tab.id));
    },
    [confirmDiscardTab, removeTabsByIds, saveTabAsInternal, saveTabToPath]
  );

  const closeTab = useCallback(
    async (tabId: string, strategy: CloseStrategy = "prompt"): Promise<boolean> =>
      closeTabsWithStrategy([tabId], strategy),
    [closeTabsWithStrategy]
  );

  const closeOtherTabs = useCallback(
    async (tabId: string, strategy: CloseStrategy = "prompt"): Promise<boolean> => {
      const targets = tabsRef.current
        .filter((tab) => tab.id !== tabId && !tab.pinned)
        .map((tab) => tab.id);
      return closeTabsWithStrategy(targets, strategy);
    },
    [closeTabsWithStrategy]
  );

  const closeTabsToRight = useCallback(
    async (tabId: string, strategy: CloseStrategy = "prompt"): Promise<boolean> => {
      const tabIndex = tabsRef.current.findIndex((tab) => tab.id === tabId);
      if (tabIndex < 0) return false;

      const targets = tabsRef.current
        .slice(tabIndex + 1)
        .filter((tab) => !tab.pinned)
        .map((tab) => tab.id);
      return closeTabsWithStrategy(targets, strategy);
    },
    [closeTabsWithStrategy]
  );

  const closeAllTabs = useCallback(
    async (strategy: CloseStrategy = "prompt"): Promise<boolean> => {
      return closeTabsWithStrategy(
        tabsRef.current.filter((tab) => !tab.pinned).map((tab) => tab.id),
        strategy
      );
    },
    [closeTabsWithStrategy]
  );

  const reorderTabs = useCallback((sourceTabId: string, targetTabId: string) => {
    if (sourceTabId === targetTabId) return;

    const sourceIndex = tabsRef.current.findIndex((tab) => tab.id === sourceTabId);
    const targetIndex = tabsRef.current.findIndex((tab) => tab.id === targetTabId);
    if (sourceIndex < 0 || targetIndex < 0) return;

    const nextTabs = [...tabsRef.current];
    const [sourceTab] = nextTabs.splice(sourceIndex, 1);
    nextTabs.splice(targetIndex, 0, sourceTab);
    tabsRef.current = nextTabs;
    setTabs(nextTabs);
  }, []);

  const restoreTabs = useCallback((nextTabs: SessionTabState[], nextActiveTabId: string | null) => {
    if (nextTabs.length === 0) return;

    const restoredTabs: FileState[] = nextTabs.map((tab) => ({
      id: tab.id || createTabId(),
      path: tab.path,
      name: tab.name || (tab.path ? getFileName(tab.path) : UNTITLED_NAME),
      content: tab.content ?? "",
      saved: tab.saved ?? true,
      pinned: tab.pinned ?? false,
    }));
    const resolvedActiveId =
      restoredTabs.find((tab) => tab.id === nextActiveTabId)?.id ?? restoredTabs[0].id;

    clearPendingSave();
    tabsRef.current = restoredTabs;
    activeTabIdRef.current = resolvedActiveId;
    setTabs(restoredTabs);
    setActiveTabId(resolvedActiveId);
    clearError();
  }, [clearError, clearPendingSave]);

  const appendTabs = useCallback((nextTabs: SessionTabState[]) => {
    if (nextTabs.length === 0) return;

    const restoredTabs: FileState[] = nextTabs.map((tab) => ({
      id: tab.id || createTabId(),
      path: tab.path,
      name: tab.name || (tab.path ? getFileName(tab.path) : UNTITLED_NAME),
      content: tab.content ?? "",
      saved: tab.saved ?? true,
      pinned: tab.pinned ?? false,
    }));

    const existingIds = new Set(tabsRef.current.map((tab) => tab.id));
    const uniqueTabs = restoredTabs.filter((tab) => !existingIds.has(tab.id));
    if (uniqueTabs.length === 0) return;

    const mergedTabs = [...tabsRef.current, ...uniqueTabs];
    tabsRef.current = mergedTabs;
    setTabs(mergedTabs);

    if (!activeTabIdRef.current) {
      activeTabIdRef.current = uniqueTabs[0].id;
      setActiveTabId(uniqueTabs[0].id);
    }
  }, []);

  const getTabsSnapshot = useCallback(() => tabsRef.current, []);

  // ── Untitled document recovery (persistence helpers are above; these are load/cleanup) ──

  /** Check for orphaned untitled recovery files and return them as FileState[]. */
  const loadUntitledRecoveryDocs = useCallback(async (): Promise<FileState[]> => {
    try {
      const docs = await invoke<Array<{ id: string; name: string; content: string }>>(
        "load_untitled_docs"
      );
      return docs.map((d) => ({
        id: d.id,
        path: null,
        name: d.name || UNTITLED_NAME,
        content: d.content ?? "",
        saved: false, // recovered docs are treated as unsaved
        pinned: false,
      }));
    } catch {
      return [];
    }
  }, []);

  /** Store the mtime of a file so we can later detect external changes. */
  const markFileCurrent = useCallback(async (path: string) => {
    try {
      const mtime = await invoke<number | null>("get_file_mtime", { path });
      if (mtime != null) {
        fileMtimesRef.current[path] = mtime;
      }
    } catch {
      // Ignore — mtime tracking is best effort
    }
  }, []);

  /** Check all open files with paths for external modifications.
   *  Returns tabs whose on-disk mtime differs from what we recorded. */
  const checkExternalChanges = useCallback(async (): Promise<FileState[]> => {
    const changed: FileState[] = [];
    for (const tab of tabsRef.current) {
      if (!tab.path) continue;
      try {
        const mtime = await invoke<number | null>("get_file_mtime", { path: tab.path });
        if (mtime == null) continue;
        const recorded = fileMtimesRef.current[tab.path];
        if (recorded != null && mtime !== recorded) {
          changed.push(tab);
        }
      } catch {
        // Ignore — check is best effort
      }
    }
    return changed;
  }, []);

  /** Reload a tab's content from disk. Only safe when the tab is unmodified. */
  const reloadTabFromDisk = useCallback(
    async (tabId: string): Promise<boolean> => {
      const tab = tabsRef.current.find((t) => t.id === tabId);
      if (!tab?.path) return false;
      const path = tab.path;
      try {
        const content = await invoke<string>("read_file_content", { path });
        const mtime = await invoke<number | null>("get_file_mtime", { path });
        // The user may have typed while we were reading — never clobber that.
        const latest = tabsRef.current.find((t) => t.id === tabId);
        if (!latest || !latest.saved) return false;
        replaceTab({ ...latest, content, saved: true });
        if (mtime != null) {
          fileMtimesRef.current[path] = mtime;
        }
        return true;
      } catch {
        return false;
      }
    },
    [replaceTab]
  );

  /** Keep an open tab in sync after its file was renamed on disk. */
  const renameTabPath = useCallback(
    (oldPath: string, newPath: string, newName: string) => {
      setTabs((current) =>
        current.map((tab) =>
          samePath(tab.path, oldPath)
            ? { ...tab, path: newPath, name: newName }
            : tab
        )
      );
      const mtime = fileMtimesRef.current[oldPath];
      if (mtime != null) {
        delete fileMtimesRef.current[oldPath];
        fileMtimesRef.current[newPath] = mtime;
      }
    },
    []
  );

  /** Close any tabs pointing at a file that was deleted on disk. */
  const closeTabsByPath = useCallback(
    (path: string) => {
      const ids = tabsRef.current
        .filter((tab) => samePath(tab.path, path))
        .map((tab) => tab.id);
      if (ids.length > 0) removeTabsByIds(ids);
    },
    [removeTabsByIds]
  );

  return {
    file,
    tabs,
    activeTabId,
    saveStatus,
    lastError,
    newFile,
    openFile,
    openFileByPath,
    saveFile,
    saveAs,
    updateContent,
    flushSave,
    activateTab,
    closeTab,
    closeOtherTabs,
    closeTabsToRight,
    renameTabPath,
    closeTabsByPath,
    closeAllTabs,
    reorderTabs,
    renameTab,
    setTabPinned,
    saveTabs,
    getTabsSnapshot,
    restoreTabs,
    appendTabs,
    markFileCurrent,
    checkExternalChanges,
    reloadTabFromDisk,
    loadUntitledRecoveryDocs,
    cleanupUntitledDoc,
  };
}
