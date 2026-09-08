import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Bot,
  Copy,
  Code2,
  Download,
  Eye,
  FilePlus,
  FolderOpen,
  FolderTree,
  House,
  List,
  Moon,
  Pin,
  RotateCcw,
  Save,
  Settings,
  Sun,
  X,
  ZoomIn,
} from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { LogicalPosition, LogicalSize, getCurrentWindow } from "@tauri-apps/api/window";
import ContextMenu, { type ContextMenuAction } from "./ContextMenu";
import Editor, { type SourceEditorHandle } from "./Editor";
import FileTree from "./FileTree";
import Preview from "./Preview";
import SelectionToolbar from "./SelectionToolbar";
import StatusBar from "./StatusBar";
import Toolbar from "./Toolbar";
import Welcome from "./Welcome";
import type { WysiwygEditorHandle } from "./WysiwygEditor";
import { useAI } from "../hooks/useAI";
import { useAppLifecycle } from "../hooks/useAppLifecycle";
import { useDragDrop } from "../hooks/useDragDrop";
import { useFileSystem } from "../hooks/useFileSystem";
import { useRecentFiles } from "../hooks/useRecentFiles";
import { useRecentWorkspaces } from "../hooks/useRecentWorkspaces";
import { useSession, type SessionState, type StartupBehavior } from "../hooks/useSession";
import { useWorkspace } from "../hooks/useWorkspace";
import { clampScale, useZoom } from "../hooks/useZoom";
import type { TabViewState } from "../types/tabState";
import { exportPdf, saveAsHtml, saveAsPlainText } from "../utils/export";
import { extractToc, getCharCount, getWordCount } from "../utils/markdown";
import type { SearchableEditorHandle } from "../types/editorSearch";
import { filterRecoveredUntitledDocs } from "../hooks/fileSystemLogic";

const AIPanel = lazy(() => import("./AIPanel"));
const AISettings = lazy(() => import("./AISettings"));
const AppSettings = lazy(() => import("./AppSettings"));
const QuickSwitch = lazy(() => import("./QuickSwitch"));
const SearchBar = lazy(() => import("./SearchBar"));
const WysiwygEditor = lazy(() => import("./WysiwygEditor"));
const APP_VERSION = __APP_VERSION__;

type ViewMode = "edit" | "preview" | "split" | "wysiwyg";
type EditMode = "wysiwyg" | "source";
type SidebarTab = "files" | "outline";
type SearchTarget = "source" | "preview" | "wysiwyg";
type ActivePane = "source" | "preview" | "wysiwyg";
type HomeResumeTarget = { path: string; name: string } | null;
type BulkCloseRequest = {
  mode: "others" | "right" | "all";
  anchorTabId: string | null;
  targetTabIds: string[];
  title: string;
  unsavedTabs: Array<{ id: string; name: string; path: string | null }>;
};
type AppCloseRequest = {
  unsavedTabs: Array<{ id: string; name: string; path: string | null }>;
};

const DEFAULT_SESSION: SessionState = {
  theme: "light",
  showSidebar: true,
  sidebarTab: "files",
  sidebarWidth: 260,
  splitRatio: 50,
  viewMode: "split",
  editMode: "wysiwyg",
  syncScroll: true,
  focusMode: false,
  zenMode: false,
  previewFontScale: 1,
  startupBehavior: "resume",
  openTabs: [],
  activeTabId: null,
  workspacePath: null,
  currentFilePath: null,
};

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.closest(".cm-editor, .ProseMirror")) return false;
  return Boolean(target.closest("input, textarea, select, [contenteditable='true'], [contenteditable='']"));
}

function getPathName(path: string): string {
  return path.replace(/\\/g, "/").split("/").pop() || "未命名.md";
}

function findHeadingElement(tocId: string, tocText: string): HTMLElement | null {
  const exact = document.getElementById(tocId);
  if (exact) return exact;

  const headings = document.querySelectorAll(
    ".ProseMirror h1, .ProseMirror h2, .ProseMirror h3, .ProseMirror h4, .ProseMirror h5, .ProseMirror h6, .preview-content h1, .preview-content h2, .preview-content h3, .preview-content h4, .preview-content h5, .preview-content h6"
  );

  for (const heading of headings) {
    const text = (heading.textContent || "").trim();
    if (text === tocText || text.startsWith(tocText) || tocText.startsWith(text)) {
      return heading as HTMLElement;
    }
  }

  return null;
}

function ModalFallback() {
  return null;
}

export default function App() {
  const {
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
    closeAllTabs,
    reorderTabs,
    renameTab,
    setTabPinned,
    saveTabs,
    getTabsSnapshot,
    restoreTabs,
    appendTabs,
    checkExternalChanges,
    reloadTabFromDisk,
    loadUntitledRecoveryDocs,
    cleanupUntitledDoc,
    renameTabPath,
    closeTabsByPath,
  } = useFileSystem();
  const {
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
  } = useWorkspace();
  const { recentFiles, addRecentFile, removeRecentFile, clearRecentFiles } = useRecentFiles();
  const {
    recentWorkspaces,
    addRecentWorkspace,
    removeRecentWorkspace,
    clearRecentWorkspaces,
  } = useRecentWorkspaces();
  const { saveSession, loadSession } = useSession();
  const {
    messages,
    isThinking,
    settings: aiSettings,
    updateSettings: updateAISettings,
    sendMessage,
    stopGeneration,
    clearMessages,
    error: aiError,
  } = useAI();

  const [viewMode, setViewMode] = useState<ViewMode>(DEFAULT_SESSION.viewMode);
  const [initialized, setInitialized] = useState(false);
  const [showAIPanel, setShowAIPanel] = useState(false);
  const [showAISettings, setShowAISettings] = useState(false);
  const [showAppSettings, setShowAppSettings] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [searchReplaceMode, setSearchReplaceMode] = useState(false);
  const [searchFocusToken, setSearchFocusToken] = useState(0);
  const [showQuickSwitch, setShowQuickSwitch] = useState(false);
  const [focusMode, setFocusMode] = useState(DEFAULT_SESSION.focusMode);
  const [zenMode, setZenMode] = useState(DEFAULT_SESSION.zenMode);
  const [syncScroll, setSyncScroll] = useState(DEFAULT_SESSION.syncScroll);
  const [editMode, setEditMode] = useState<EditMode>(DEFAULT_SESSION.editMode);
  const [theme, setTheme] = useState<"light" | "dark">(DEFAULT_SESSION.theme);
  const [showSidebar, setShowSidebar] = useState(DEFAULT_SESSION.showSidebar);
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>(DEFAULT_SESSION.sidebarTab);
  const [splitRatio, setSplitRatio] = useState(DEFAULT_SESSION.splitRatio);
  const [sidebarWidth, setSidebarWidth] = useState(DEFAULT_SESSION.sidebarWidth);
  const [activePane, setActivePane] = useState<ActivePane>(DEFAULT_SESSION.editMode);
  const [isDragging, setIsDragging] = useState(false);
  const [isResizingSidebar, setIsResizingSidebar] = useState(false);
  const [previewFontScale, setPreviewFontScale] = useState(DEFAULT_SESSION.previewFontScale);
  const [startupBehavior, setStartupBehavior] = useState<StartupBehavior>(DEFAULT_SESSION.startupBehavior);
  const [showHome, setShowHome] = useState(false);
  const [homeResumeTarget, setHomeResumeTarget] = useState<HomeResumeTarget>(null);
  const [draggingTabId, setDraggingTabId] = useState<string | null>(null);
  const [tabDropTargetId, setTabDropTargetId] = useState<string | null>(null);
  const [renamingTabId, setRenamingTabId] = useState<string | null>(null);
  const [renamingTabName, setRenamingTabName] = useState("");
  const [bulkCloseRequest, setBulkCloseRequest] = useState<BulkCloseRequest | null>(null);
  const [appCloseRequest, setAppCloseRequest] = useState<AppCloseRequest | null>(null);
  const [tabContextMenu, setTabContextMenu] = useState<{
    x: number;
    y: number;
    items: ContextMenuAction[];
  } | null>(null);
  const [sessionReady, setSessionReady] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const sourcePaneRef = useRef<HTMLDivElement>(null);
  const previewPaneRef = useRef<HTMLDivElement>(null);
  const wysiwygPaneRef = useRef<HTMLDivElement>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);
  const sourceEditorRef = useRef<SourceEditorHandle | null>(null);
  const wysiwygEditorRef = useRef<WysiwygEditorHandle | null>(null);
  const previewSearchRef = useRef<SearchableEditorHandle | null>(null);
  const tabViewStatesRef = useRef<Record<string, TabViewState>>({});
  const allowWindowCloseRef = useRef(false);
  /** Snapshot of window geometry captured before session save. */
  const windowGeomRef = useRef<{
    windowX?: number;
    windowY?: number;
    windowWidth?: number;
    windowHeight?: number;
  }>({});

  useZoom({
    enabled: true,
    setScale: (updater) =>
      setPreviewFontScale((current) =>
        typeof updater === "function" ? clampScale(updater(current)) : clampScale(updater)
      ),
  });

  const isWysiwyg = editMode === "wysiwyg";
  const toc = useMemo(() => extractToc(file.content), [file.content]);
  const wordCount = useMemo(() => getWordCount(file.content), [file.content]);
  const charCount = useMemo(() => getCharCount(file.content), [file.content]);

  const captureActiveTabViewState = useCallback(() => {
    // Also capture window geometry for session restore
    try {
      void getCurrentWindow().outerPosition().then((pos) => {
        windowGeomRef.current = {
          ...windowGeomRef.current,
          windowX: pos.x,
          windowY: pos.y,
        };
      });
      void getCurrentWindow().outerSize().then((size) => {
        windowGeomRef.current = {
          ...windowGeomRef.current,
          windowWidth: size.width,
          windowHeight: size.height,
        };
      });
    } catch { /* browser dev mode */ }

    if (!activeTabId) return;

    const nextState: TabViewState = {
      ...(tabViewStatesRef.current[activeTabId] ?? {}),
    };

    const sourceState = sourceEditorRef.current?.getViewState();
    if (sourceState) {
      nextState.source = sourceState;
    }

    if (previewPaneRef.current) {
      nextState.preview = {
        scrollTop: previewPaneRef.current.scrollTop,
      };
    }

    const wysiwygState = wysiwygEditorRef.current?.getViewState();
    if (wysiwygState) {
      nextState.wysiwyg = {
        ...wysiwygState,
        scrollTop: wysiwygPaneRef.current?.scrollTop ?? wysiwygState.scrollTop,
      };
    }

    tabViewStatesRef.current[activeTabId] = nextState;
  }, [activeTabId]);

  const restoreTabViewState = useCallback((tabId: string | null) => {
    if (!tabId) return;

    const state = tabViewStatesRef.current[tabId];
    if (!state) return;

    if (state.source) {
      sourceEditorRef.current?.restoreViewState(state.source);
    }

    if (state.preview && previewPaneRef.current) {
      requestAnimationFrame(() => {
        if (previewPaneRef.current) {
          previewPaneRef.current.scrollTop = Math.max(0, state.preview!.scrollTop);
        }
      });
    }

    if (state.wysiwyg) {
      wysiwygEditorRef.current?.restoreViewState(state.wysiwyg);
      requestAnimationFrame(() => {
        if (wysiwygPaneRef.current) {
          wysiwygPaneRef.current.scrollTop = Math.max(0, state.wysiwyg!.scrollTop);
        }
      });
    }
  }, []);

  const buildSessionState = useCallback(
    (
      sessionTabs = tabs,
      sessionActiveTabId = activeTabId,
      currentPath: string | null = sessionTabs.length === 0
        ? null
        : file.path ?? homeResumeTarget?.path ?? null
    ): SessionState => {
      const resolvedActiveTabId =
        sessionTabs.find((tab) => tab.id === sessionActiveTabId)?.id ?? sessionTabs[0]?.id ?? null;

      return {
        theme,
        showSidebar,
        sidebarTab,
        sidebarWidth,
        splitRatio,
        viewMode,
        editMode,
        syncScroll,
        focusMode,
        zenMode,
        previewFontScale,
        startupBehavior,
        openTabs: sessionTabs.map((tab) => ({
          id: tab.id,
          path: tab.path,
          name: tab.name,
          content: tab.content,
          saved: tab.saved,
          pinned: tab.pinned,
          viewState: tabViewStatesRef.current[tab.id],
        })),
        activeTabId: resolvedActiveTabId,
        workspacePath,
        currentFilePath: currentPath,
        // Window geometry saved from latest capture (best effort)
        ...windowGeomRef.current,
      };
    },
    [
      activeTabId,
      editMode,
      file.path,
      focusMode,
      homeResumeTarget?.path,
      previewFontScale,
      showSidebar,
      sidebarTab,
      sidebarWidth,
      splitRatio,
      syncScroll,
      tabs,
      theme,
      startupBehavior,
      viewMode,
      workspacePath,
      zenMode,
    ]
  );

  // ── App lifecycle (window close, file-open events, external change detection) ──
  useAppLifecycle({
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
    appCloseRequestDirty: appCloseRequest ? 1 : 0,
    onExternalChange: (count) => {
      setToastMsg(`检测到 ${count} 个文件被外部修改，已自动重载。`);
    },
    onExternalChangeSkipped: (count) => {
      setToastMsg(`有 ${count} 个文件被外部修改，但你还有未保存的改动，已跳过重载。`);
    },
    setInitialized,
    setShowHome,
    setHomeResumeTarget,
    setAppCloseRequest,
  });

  const toggleTheme = useCallback(() => {
    setTheme((current) => (current === "light" ? "dark" : "light"));
  }, []);

  const toggleSidebar = useCallback(() => {
    setShowSidebar((current) => !current);
  }, []);

  const openSearch = useCallback((replace = false) => {
    setSearchReplaceMode(replace);
    setShowSearch(true);
    setSearchFocusToken((current) => current + 1);
  }, []);

  const markInitialized = useCallback(() => {
    setInitialized(true);
  }, []);

  const closeHome = useCallback(() => {
    setShowHome(false);
  }, []);

  const openFileAndActivate = useCallback(
    async (path: string) => {
      captureActiveTabViewState();
      const opened = await openFileByPath(path);
      if (opened) {
        markInitialized();
        setShowHome(false);
        setHomeResumeTarget(null);
      }
      return opened;
    },
    [captureActiveTabViewState, markInitialized, openFileByPath]
  );

  useDragDrop({
    onOpenFilePath: openFileAndActivate,
    onOpenFolderPath: async (path) => {
      await openFolderByPath(path);
      setShowSidebar(true);
      setSidebarTab("files");
      markInitialized();
      setShowHome(false);
      setHomeResumeTarget(null);
    },
  });

  // File-open listener and external change detection are now in useAppLifecycle hook.

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  useEffect(() => {
    if (!renamingTabId) return;

    const timer = window.setTimeout(() => {
      renameInputRef.current?.focus();
      renameInputRef.current?.select();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [renamingTabId]);

  useEffect(() => {
    if (editMode === "wysiwyg") {
      setActivePane("wysiwyg");
      return;
    }

    if (viewMode === "preview") {
      setActivePane("preview");
      return;
    }

    setActivePane("source");
  }, [editMode, viewMode]);

  useEffect(() => {
    if (!file.path) return;
    addRecentFile(file.path, file.name);
  }, [addRecentFile, file.name, file.path]);

  useEffect(() => {
    if (!workspacePath) return;
    addRecentWorkspace(workspacePath);
  }, [addRecentWorkspace, workspacePath]);

  // Auto-dismiss toast
  useEffect(() => {
    if (!toastMsg) return;
    const timer = window.setTimeout(() => setToastMsg(null), 4000);
    return () => window.clearTimeout(timer);
  }, [toastMsg]);

  const hadOpenTabsRef = useRef(false);
  useEffect(() => {
    if (tabs.length > 0) {
      hadOpenTabsRef.current = true;
    } else if (hadOpenTabsRef.current && homeResumeTarget) {
      // Only clear when the user actually closed the last tab — a fresh launch
      // also starts with zero tabs and must keep the resume target.
      setHomeResumeTarget(null);
    }
  }, [homeResumeTarget, tabs.length]);

  useEffect(() => {
    const validTabIds = new Set(tabs.map((tab) => tab.id));
    const nextEntries = Object.entries(tabViewStatesRef.current).filter(([tabId]) => validTabIds.has(tabId));
    if (nextEntries.length === Object.keys(tabViewStatesRef.current).length) {
      return;
    }

    tabViewStatesRef.current = Object.fromEntries(nextEntries);
  }, [tabs]);

  useEffect(() => {
    const dirtyMarker = file.saved ? "" : "●";
    const title = `${dirtyMarker}${file.name} - MarkFlow`;
    document.title = title;

    try {
      getCurrentWindow().setTitle(title);
    } catch {
      // Ignore in browser dev mode.
    }
  }, [file.name, file.saved]);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const session = (await loadSession()) ?? DEFAULT_SESSION;
      if (cancelled) return;

      setTheme(session.theme);
      setShowSidebar(session.showSidebar);
      setSidebarTab(session.sidebarTab);
      setSidebarWidth(session.sidebarWidth);
      setSplitRatio(session.splitRatio);
      setViewMode(session.viewMode);
      setEditMode(session.editMode);
      setSyncScroll(session.syncScroll);
      setFocusMode(session.focusMode);
      setZenMode(session.zenMode);
      setPreviewFontScale(clampScale(session.previewFontScale));
      setStartupBehavior(session.startupBehavior ?? DEFAULT_SESSION.startupBehavior);

      // Restore window geometry (with bounds validation)
      if (
        session.windowX != null &&
        session.windowY != null &&
        session.windowWidth != null &&
        session.windowHeight != null
      ) {
        const minW = 800;
        const minH = 600;
        const w = Math.max(minW, session.windowWidth);
        const h = Math.max(minH, session.windowHeight);
        // Clamp position so at least part of the window is on screen
        const x = Math.max(-w + 100, session.windowX);
        const y = Math.max(-40, session.windowY);
        try {
          void getCurrentWindow().setPosition(new LogicalPosition(x, y));
          void getCurrentWindow().setSize(new LogicalSize(w, h));
        } catch { /* browser dev mode */ }
      }

      tabViewStatesRef.current = Object.fromEntries(
        session.openTabs.map((tab) => [tab.id, tab.viewState ?? {}])
      );

      // 用户偏好：每次启动标签栏为空——不自动恢复上次打开的文件标签，
      // 仅保留下方的工作区文件夹恢复与未保存草稿恢复。
      const restoredSessionTabs = false;
      const resumedCurrentFile = false;
      setHomeResumeTarget(
        session.currentFilePath
          ? {
              path: session.currentFilePath,
              name: getPathName(session.currentFilePath),
            }
          : null
      );

      if (session.workspacePath) {
        await openFolderByPath(session.workspacePath);
      }

      // 启动不恢复文件标签，直接显示主页。
      setShowHome(true);
      setInitialized(true);

      // Recover orphaned untitled documents from disk
      if (!cancelled) {
        try {
          const recoveredDocs = await loadUntitledRecoveryDocs();
          const existingSessionTabs = session.openTabs.map((tab) => ({ id: tab.id }));
          const missingRecoveredDocs = filterRecoveredUntitledDocs(recoveredDocs, existingSessionTabs);
          if (missingRecoveredDocs.length > 0) {
            if (restoredSessionTabs || resumedCurrentFile) {
              appendTabs(missingRecoveredDocs);
            } else {
              restoreTabs(missingRecoveredDocs, missingRecoveredDocs[0].id);
            }
            setInitialized(true);
          }
        } catch { /* ignore recovery errors */ }
      }

      if (!cancelled) {
        setSessionReady(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [appendTabs, loadSession, loadUntitledRecoveryDocs, openFileByPath, openFolderByPath, restoreTabs]);

  useEffect(() => {
    if (!sessionReady) return;
    captureActiveTabViewState();

    const timer = window.setTimeout(() => {
      void saveSession(buildSessionState());
    }, 250);

    return () => window.clearTimeout(timer);
  }, [
    buildSessionState,
    captureActiveTabViewState,
    saveSession,
    sessionReady,
  ]);

  useEffect(() => {
    const handleBeforeUnload = () => {
      void flushSave();
      captureActiveTabViewState();
      void saveSession(buildSessionState());
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [buildSessionState, captureActiveTabViewState, flushSave, saveSession]);

  useEffect(() => {
    if (showHome) return;

    const timer = window.setTimeout(() => {
      restoreTabViewState(activeTabId);
    }, 0);

    return () => window.clearTimeout(timer);
  }, [activeTabId, editMode, restoreTabViewState, showHome, viewMode]);

  const handleFormat = useCallback(
    (format: string) => {
      if (editMode !== "source") return;
      sourceEditorRef.current?.applyFormat(format);
    },
    [editMode]
  );

  const handleFileClick = useCallback(
    async (path: string) => {
      await openFileAndActivate(path);
    },
    [openFileAndActivate]
  );

  // Keep open tabs consistent with file-tree operations
  const handleRenameFile = useCallback(
    async (path: string, newName: string) => {
      const ok = await renameFile(path, newName);
      if (ok) {
        const normalized = path.replace(/\\/g, "/");
        const parent = normalized.split("/").slice(0, -1).join("/");
        const name = newName.trim();
        renameTabPath(path, `${parent}/${name}`, name);
      }
      return ok;
    },
    [renameFile, renameTabPath]
  );

  const handleDeleteFile = useCallback(
    async (path: string) => {
      const ok = await deleteFile(path);
      if (ok) closeTabsByPath(path);
      return ok;
    },
    [deleteFile, closeTabsByPath]
  );

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (event: MouseEvent) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const ratio = ((event.clientX - rect.left) / rect.width) * 100;
      setSplitRatio(Math.max(20, Math.min(80, ratio)));
    };

    const handleMouseUp = () => setIsDragging(false);
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDragging]);

  useEffect(() => {
    if (!isResizingSidebar) return;

    const handleMouseMove = (event: MouseEvent) => {
      setSidebarWidth(Math.max(160, Math.min(500, event.clientX)));
    };

    const handleMouseUp = () => setIsResizingSidebar(false);
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isResizingSidebar]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const mod = event.ctrlKey || event.metaKey;
      const typing = isTypingTarget(event.target);

      if (mod && event.key.toLowerCase() === "s") {
        event.preventDefault();
        void saveFile();
        return;
      }

      if (typing) return;

      if (mod && event.key.toLowerCase() === "o") {
        event.preventDefault();
        void openFile().then((opened) => {
          if (opened) {
            markInitialized();
            setShowHome(false);
            setHomeResumeTarget(null);
          }
        });
        return;
      }

      if (mod && event.key.toLowerCase() === "n") {
        event.preventDefault();
        void newFile().then((created) => {
          if (created) {
            markInitialized();
            setShowHome(false);
            setHomeResumeTarget(null);
          }
        });
        return;
      }

      if (mod && event.key === "/") {
        event.preventDefault();
        setEditMode((current) => (current === "wysiwyg" ? "source" : "wysiwyg"));
        return;
      }

      if (mod && event.shiftKey && event.key.toLowerCase() === "e") {
        event.preventDefault();
        toggleSidebar();
        return;
      }

      if (mod && event.shiftKey && event.key.toLowerCase() === "i") {
        event.preventDefault();
        setShowAIPanel((current) => !current);
        return;
      }

      if (mod && event.key.toLowerCase() === "p") {
        event.preventDefault();
        setShowQuickSwitch(true);
        return;
      }

      if (event.key === "F11") {
        event.preventDefault();
        setZenMode((current) => !current);
        return;
      }

      if (mod && event.shiftKey && event.key.toLowerCase() === "f") {
        event.preventDefault();
        openSearch(false);
        return;
      }

      if (mod && event.key.toLowerCase() === "f") {
        event.preventDefault();
        openSearch(false);
        return;
      }

      if (mod && event.key.toLowerCase() === "h") {
        event.preventDefault();
        openSearch(true);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [editMode, markInitialized, newFile, openFile, openSearch, saveFile, toggleSidebar]);

  useEffect(() => {
    if (!syncScroll || editMode === "wysiwyg" || viewMode !== "split") return;

    let syncing = false;
    const left = document.querySelector(".split-pane-left") as HTMLElement | null;
    const right = document.querySelector(".split-pane-right") as HTMLElement | null;
    if (!left || !right) return;

    const syncLeft = () => {
      if (syncing) return;
      syncing = true;
      const ratio = left.scrollTop / Math.max(left.scrollHeight - left.clientHeight, 1);
      right.scrollTop = ratio * Math.max(right.scrollHeight - right.clientHeight, 1);
      requestAnimationFrame(() => {
        syncing = false;
      });
    };

    const syncRight = () => {
      if (syncing) return;
      syncing = true;
      const ratio = right.scrollTop / Math.max(right.scrollHeight - right.clientHeight, 1);
      left.scrollTop = ratio * Math.max(left.scrollHeight - left.clientHeight, 1);
      requestAnimationFrame(() => {
        syncing = false;
      });
    };

    left.addEventListener("scroll", syncLeft);
    right.addEventListener("scroll", syncRight);

    return () => {
      left.removeEventListener("scroll", syncLeft);
      right.removeEventListener("scroll", syncRight);
    };
  }, [editMode, syncScroll, viewMode]);

  useEffect(() => {
    if (sidebarTab !== "outline" || toc.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;

          const heading = entry.target as HTMLElement;
          const id =
            heading.id ||
            toc.find((item) => {
              const text = (heading.textContent || "").trim();
              return text === item.text || text.startsWith(item.text) || item.text.startsWith(text);
            })?.id;
          if (!id) continue;

          document.querySelectorAll(".outline-content .toc-item").forEach((item) => item.classList.remove("active-outline"));
          document
            .querySelector(`.outline-content .toc-item[href="#${CSS.escape(id)}"]`)
            ?.classList.add("active-outline");
        }
      },
      { rootMargin: "-20% 0px -70% 0px" }
    );

    document
      .querySelectorAll(
        ".ProseMirror h1, .ProseMirror h2, .ProseMirror h3, .ProseMirror h4, .ProseMirror h5, .ProseMirror h6, .preview-content h1, .preview-content h2, .preview-content h3, .preview-content h4, .preview-content h5, .preview-content h6"
      )
      .forEach((target) => observer.observe(target));

    return () => observer.disconnect();
  }, [sidebarTab, toc, editMode, viewMode, file.content]);

  const openNewFile = useCallback(async () => {
    captureActiveTabViewState();
    const created = await newFile();
    if (created) {
      markInitialized();
      setShowHome(false);
      setHomeResumeTarget(null);
    }
  }, [captureActiveTabViewState, markInitialized, newFile]);

  const openNativeFile = useCallback(async () => {
    captureActiveTabViewState();
    const opened = await openFile();
    if (opened) {
      markInitialized();
      setShowHome(false);
      setHomeResumeTarget(null);
    }
  }, [captureActiveTabViewState, markInitialized, openFile]);

  const openWorkspace = useCallback(async () => {
    const selected = await openFolder();
    if (selected) {
      markInitialized();
      setShowHome(false);
      setHomeResumeTarget(null);
    }
  }, [markInitialized, openFolder]);

  const openRecentWorkspace = useCallback(
    async (path: string) => {
      await openFolderByPath(path);
      setShowSidebar(true);
      setSidebarTab("files");
      markInitialized();
      setShowHome(false);
      setHomeResumeTarget(null);
    },
    [markInitialized, openFolderByPath]
  );

  const handleContinueFromHome = useCallback(async () => {
    if (tabs.length === 0) {
      void openNewFile();
      return;
    }

    if (file.path || file.content.trim()) {
      closeHome();
      return;
    }

    if (homeResumeTarget?.path) {
      await openFileAndActivate(homeResumeTarget.path);
      return;
    }

    closeHome();
  }, [closeHome, file.content, file.path, homeResumeTarget?.path, openFileAndActivate, openNewFile, tabs.length]);

  const handleTabClick = useCallback(
    (tabId: string) => {
      if (tabId === activeTabId) return;
      captureActiveTabViewState();
      void activateTab(tabId);
      setShowHome(false);
      setHomeResumeTarget(null);
    },
    [activateTab, activeTabId, captureActiveTabViewState]
  );

  const handleCloseTab = useCallback(
    (tabId: string) => {
      void closeTab(tabId).then((closed) => {
        if (closed) {
          setShowHome(false);
        }
      });
    },
    [closeTab]
  );

  const handleCopyTabPath = useCallback(async (path: string) => {
    try {
      await navigator.clipboard.writeText(path);
    } catch (error) {
      console.error("Failed to copy tab path", error);
    }
  }, []);

  const handleRevealTabInFolder = useCallback(async (path: string) => {
    try {
      await invoke("reveal_in_folder", { path });
    } catch (error) {
      console.error("Failed to reveal tab in folder", error);
    }
  }, []);

  const waitForTabsSnapshot = useCallback(async () => {
    await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    return getTabsSnapshot();
  }, [getTabsSnapshot]);

  const finalizeWindowClose = useCallback(
    async (strategy: "save" | "discard"): Promise<boolean> => {
      captureActiveTabViewState();

      let sessionTabs = getTabsSnapshot();

      if (strategy === "save") {
        const unsavedIds = sessionTabs.filter((tab) => !tab.saved).map((tab) => tab.id);
        if (unsavedIds.length > 0) {
          const saved = await saveTabs(unsavedIds);
          if (!saved) {
            return false;
          }
        }

        sessionTabs = await waitForTabsSnapshot();
      } else {
        const discardedTabs = [];

        for (const tab of sessionTabs) {
          if (tab.saved) {
            discardedTabs.push(tab);
            continue;
          }

          if (!tab.path) {
            await cleanupUntitledDoc(tab.id);
            continue;
          }

          try {
            const content = await invoke<string>("read_file_content", { path: tab.path });
            discardedTabs.push({
              ...tab,
              content,
              saved: true,
            });
          } catch (error) {
            console.error("Failed to reload file while discarding changes", error);
          }
        }

        sessionTabs = discardedTabs;
      }

      const nextActiveTabId =
        sessionTabs.find((tab) => tab.id === activeTabId)?.id ?? sessionTabs[0]?.id ?? null;
      const nextCurrentPath =
        sessionTabs.find((tab) => tab.id === nextActiveTabId)?.path ?? null;

      try {
        await saveSession(buildSessionState(sessionTabs, nextActiveTabId, nextCurrentPath));
      } catch (error) {
        // Session persistence failure should not trap the user inside the app.
        console.error("Failed to save session before closing:", error);
      }

      allowWindowCloseRef.current = true;
      try {
        await invoke("exit_app");
        return true;
      } catch (error) {
        allowWindowCloseRef.current = false;
        console.error("Failed to exit application:", error);
        return false;
      }
    },
    [
      activeTabId,
      buildSessionState,
      captureActiveTabViewState,
      cleanupUntitledDoc,
      getTabsSnapshot,
      saveSession,
      saveTabs,
      waitForTabsSnapshot,
    ]
  );

  const handleAppCloseSave = useCallback(() => {
    if (!appCloseRequest) return;

    void finalizeWindowClose("save").then((closed) => {
      if (closed) {
        setAppCloseRequest(null);
      }
    });
  }, [appCloseRequest, finalizeWindowClose]);

  const handleAppCloseDiscard = useCallback(() => {
    if (!appCloseRequest) return;

    void finalizeWindowClose("discard").then((closed) => {
      if (closed) {
        setAppCloseRequest(null);
      }
    });
  }, [appCloseRequest, finalizeWindowClose]);

  const executeBulkCloseRequest = useCallback(
    async (request: BulkCloseRequest, strategy: "save" | "discard") => {
      if (request.mode === "others" && request.anchorTabId) {
        return closeOtherTabs(request.anchorTabId, strategy);
      }

      if (request.mode === "right" && request.anchorTabId) {
        return closeTabsToRight(request.anchorTabId, strategy);
      }

      return closeAllTabs(strategy);
    },
    [closeAllTabs, closeOtherTabs, closeTabsToRight]
  );

  const requestBulkClose = useCallback(
    (mode: BulkCloseRequest["mode"], anchorTabId: string | null = null) => {
      const anchorIndex = anchorTabId ? tabs.findIndex((tab) => tab.id === anchorTabId) : -1;
      const targetTabs =
        mode === "all"
          ? tabs.filter((tab) => !tab.pinned)
          : mode === "others" && anchorTabId
            ? tabs.filter((tab) => tab.id !== anchorTabId && !tab.pinned)
            : mode === "right" && anchorTabId && anchorIndex >= 0
              ? tabs.slice(anchorIndex + 1).filter((tab) => !tab.pinned)
              : [];

      if (targetTabs.length === 0) return;

      const unsavedTabs = targetTabs
        .filter((tab) => !tab.saved)
        .map((tab) => ({ id: tab.id, name: tab.name, path: tab.path }));

      if (targetTabs.length > 1 && unsavedTabs.length > 0) {
        const title = (() => {
          if (mode === "all") {
            return tabs.some((tab) => tab.pinned) ? "关闭全部未固定标签" : "关闭全部标签";
          }

          return mode === "others" ? "关闭其他标签" : "关闭右侧标签";
        })();
        setBulkCloseRequest({
          mode,
          anchorTabId,
          targetTabIds: targetTabs.map((tab) => tab.id),
          title,
          unsavedTabs,
        });
        return;
      }

      const directStrategy = unsavedTabs.length > 0 ? "prompt" : "discard";

      if (mode === "all") {
        void closeAllTabs(directStrategy).then((closed) => {
          if (closed) {
            setShowHome(false);
          }
        });
        return;
      }

      if (mode === "others" && anchorTabId) {
        void closeOtherTabs(anchorTabId, directStrategy).then((closed) => {
          if (closed) {
            setShowHome(false);
          }
        });
        return;
      }

      if (mode === "right" && anchorTabId) {
        void closeTabsToRight(anchorTabId, directStrategy).then((closed) => {
          if (closed) {
            setShowHome(false);
          }
        });
      }
    },
    [closeAllTabs, closeOtherTabs, closeTabsToRight, tabs]
  );

  const handleCloseOtherTabs = useCallback(
    (tabId: string) => {
      requestBulkClose("others", tabId);
    },
    [requestBulkClose]
  );

  const handleCloseTabsToRight = useCallback(
    (tabId: string) => {
      requestBulkClose("right", tabId);
    },
    [requestBulkClose]
  );

  const handleCloseAllTabs = useCallback(() => {
    requestBulkClose("all");
  }, [requestBulkClose]);

  const handleBulkCloseSave = useCallback(() => {
    if (!bulkCloseRequest) return;

    void executeBulkCloseRequest(bulkCloseRequest, "save").then((closed) => {
      if (closed) {
        setBulkCloseRequest(null);
        setShowHome(false);
      }
    });
  }, [bulkCloseRequest, executeBulkCloseRequest]);

  const handleBulkCloseDiscard = useCallback(() => {
    if (!bulkCloseRequest) return;

    void executeBulkCloseRequest(bulkCloseRequest, "discard").then((closed) => {
      if (closed) {
        setBulkCloseRequest(null);
        setShowHome(false);
      }
    });
  }, [bulkCloseRequest, executeBulkCloseRequest]);

  // Window close request handling is now in useAppLifecycle hook.

  const handleStartRenameTab = useCallback((tabId: string) => {
    const tab = tabs.find((item) => item.id === tabId);
    if (!tab || tab.path) return;

    setDraggingTabId(null);
    setTabDropTargetId(null);
    setTabContextMenu(null);
    setRenamingTabId(tab.id);
    setRenamingTabName(tab.name.replace(/\.md$/i, ""));
  }, [tabs]);

  const handleCancelRenameTab = useCallback(() => {
    setRenamingTabId(null);
    setRenamingTabName("");
  }, []);

  const handleCommitRenameTab = useCallback(() => {
    if (!renamingTabId) return;

    const renamed = renameTab(renamingTabId, renamingTabName);
    if (renamed) {
      handleCancelRenameTab();
      return;
    }

    const tab = tabs.find((item) => item.id === renamingTabId);
    setRenamingTabName(tab?.name.replace(/\.md$/i, "") ?? "");
    renameInputRef.current?.focus();
  }, [handleCancelRenameTab, renameTab, renamingTabId, renamingTabName, tabs]);

  const handleToggleTabPinned = useCallback(
    (tabId: string) => {
      const tab = tabs.find((item) => item.id === tabId);
      if (!tab) return;

      setTabPinned(tabId, !tab.pinned);
    },
    [setTabPinned, tabs]
  );

  const handleTabContextMenu = useCallback(
    (event: React.MouseEvent, tabId: string) => {
      event.preventDefault();

      const tabIndex = tabs.findIndex((tab) => tab.id === tabId);
      const tab = tabIndex >= 0 ? tabs[tabIndex] : null;
      if (!tab) return;

      const hasTabsToRight = tabs.slice(tabIndex + 1).some((item) => !item.pinned);
      const hasClosableTabs = tabs.some((item) => !item.pinned);
      const hasOtherTabs = hasClosableTabs && tabs.some((item) => item.id !== tabId && !item.pinned);
      const items: ContextMenuAction[] = [
        {
          label: "关闭",
          icon: <X size={14} />,
          onClick: () => handleCloseTab(tabId),
        },
        {
          label: tab.pinned ? "取消固定" : "固定标签",
          icon: <Pin size={14} />,
          onClick: () => handleToggleTabPinned(tabId),
        },
      ];

      if (tab.path) {
        items.push({
          label: "复制路径",
          icon: <Copy size={14} />,
          onClick: () => void handleCopyTabPath(tab.path!),
        });
        items.push({
          label: "在资源管理器中显示",
          icon: <FolderOpen size={14} />,
          onClick: () => void handleRevealTabInFolder(tab.path!),
        });
      }

      if (hasOtherTabs) {
        items.push({
          label: "关闭其他",
          icon: <X size={14} />,
          onClick: () => handleCloseOtherTabs(tabId),
        });
      }

      if (hasTabsToRight) {
        items.push({
          label: "关闭右侧",
          icon: <X size={14} />,
          onClick: () => handleCloseTabsToRight(tabId),
        });
      }

      if (hasOtherTabs) {
        items.push({
          label: "关闭全部",
          icon: <X size={14} />,
          destructive: true,
          onClick: handleCloseAllTabs,
        });
      }

      setTabContextMenu({
        x: event.clientX,
        y: event.clientY,
        items,
      });
    },
    [
      handleCloseAllTabs,
      handleCloseOtherTabs,
      handleCloseTab,
      handleCloseTabsToRight,
      handleCopyTabPath,
      handleRevealTabInFolder,
      handleToggleTabPinned,
      tabs,
    ]
  );

  const handleTabDrop = useCallback(
    (targetTabId: string) => {
      if (!draggingTabId || draggingTabId === targetTabId) {
        setDraggingTabId(null);
        setTabDropTargetId(null);
        return;
      }

      reorderTabs(draggingTabId, targetTabId);
      setDraggingTabId(null);
      setTabDropTargetId(null);
    },
    [draggingTabId, reorderTabs]
  );

  const searchTarget: SearchTarget =
    isWysiwyg || activePane === "wysiwyg"
      ? "wysiwyg"
      : viewMode === "preview"
        ? "preview"
        : viewMode === "split"
          ? activePane
          : "source";
  const activeSearchEditor: SearchableEditorHandle | null =
    searchTarget === "wysiwyg"
      ? wysiwygEditorRef.current
      : searchTarget === "preview"
        ? previewSearchRef.current
        : sourceEditorRef.current;
  const hasResumeDocument = Boolean(file.path || file.content.trim() || homeResumeTarget?.path);
  const resumeDocumentName =
    file.path || file.content.trim() ? file.name : homeResumeTarget?.name ?? file.name;
  const resumeDocumentPath =
    file.path || file.content.trim() ? file.path : homeResumeTarget?.path ?? null;
  const visibleTabCount = tabs.length;
  const bulkCloseUntitledCount = bulkCloseRequest?.unsavedTabs.filter((tab) => !tab.path).length ?? 0;
  const appCloseUntitledCount = appCloseRequest?.unsavedTabs.filter((tab) => !tab.path).length ?? 0;

  return (
    <div className={`app-container ${zenMode ? "zen-mode" : ""}`}>
      {zenMode && <div className="zen-hint">按 F11 退出专注模式</div>}

      <div className="title-bar">
        <div className="title-bar-left">
          <button className="icon-btn" onClick={toggleSidebar} title="切换侧边栏 (Ctrl+Shift+E)">
            <FolderTree size={16} />
          </button>
          <button
            className="icon-btn"
            onClick={() => {
              captureActiveTabViewState();
              setShowHome(true);
            }}
            title="返回主页"
            style={{
              color: showHome ? "var(--accent-color)" : undefined,
              background: showHome ? "var(--accent-light)" : undefined,
            }}
          >
            <House size={16} />
          </button>
          {!showHome && (
            <>
              <span className="file-name">{file.name}</span>
              {file.path && <span className="file-path">{file.path}</span>}
              <span className={`file-status ${saveStatus}`}>
                {saveStatus === "saving"
                  ? "保存中..."
                  : saveStatus === "unsaved"
                    ? "● 未保存"
                    : saveStatus === "error"
                      ? "保存失败"
                      : ""}
              </span>
            </>
          )}
        </div>

        <div className="title-bar-right">
          <button className="icon-btn" onClick={() => void openNewFile()} title="新建 (Ctrl+N)">
            <FilePlus size={16} />
          </button>
          <button className="icon-btn" onClick={() => void openNativeFile()} title="打开 (Ctrl+O)">
            <FolderOpen size={16} />
          </button>
          <button className="icon-btn" onClick={() => void saveFile()} title="保存 (Ctrl+S)">
            <Save size={16} />
          </button>
          <button className="icon-btn" onClick={() => void saveAs(file.content)} title="另存为">
            <Download size={16} />
          </button>
          <div className="toolbar-separator" />
          <button
            className="icon-btn"
            onClick={() => setPreviewFontScale((current) => clampScale(current + 0.05))}
            title="放大阅读视图 (Ctrl+滚轮)"
          >
            <ZoomIn size={16} />
          </button>
          <button className="icon-btn" onClick={() => setPreviewFontScale(1)} title="重置阅读缩放 (Ctrl+0)">
            <RotateCcw size={16} />
          </button>
          <div className="toolbar-separator" />
          <button
            className="icon-btn"
            onClick={() => setEditMode((current) => (current === "wysiwyg" ? "source" : "wysiwyg"))}
            title={isWysiwyg ? "切换到源码模式 (Ctrl+/)" : "切换到所见即所得模式 (Ctrl+/)"}
            style={{
              color: isWysiwyg ? undefined : "var(--accent-color)",
              background: isWysiwyg ? undefined : "var(--accent-light)",
            }}
          >
            {isWysiwyg ? <Code2 size={16} /> : <Eye size={16} />}
          </button>
          <div className="toolbar-separator" />
          <button
            className="icon-btn"
            onClick={() => setShowAIPanel((current) => !current)}
            title="AI 助手 (Ctrl+Shift+I)"
            style={{
              color: showAIPanel ? "var(--accent-color)" : undefined,
              background: showAIPanel ? "var(--accent-light)" : undefined,
            }}
          >
            <Bot size={16} />
          </button>
          {!showHome && (
            <>
              <div className="toolbar-separator" />
              <span className="file-status">{wordCount} 词</span>
              <div className="toolbar-separator" />
            </>
          )}
          <button className="icon-btn" onClick={() => setShowAppSettings(true)} title="设置">
            <Settings size={16} />
          </button>
          <button className="icon-btn" onClick={toggleTheme} title="切换主题">
            {theme === "light" ? <Moon size={16} /> : <Sun size={16} />}
          </button>
        </div>
      </div>

      <div className={`editor-top-strip ${isWysiwyg ? "merged" : ""}`}>
        <div className="tab-strip">
        {tabs.map((tab) => (
          <div
            key={tab.id}
            className={`tab-chip ${tab.id === activeTabId ? "active" : ""} ${tab.pinned ? "pinned" : ""} ${draggingTabId === tab.id ? "dragging" : ""} ${tabDropTargetId === tab.id ? "drop-target" : ""}`}
            role="button"
            tabIndex={renamingTabId === tab.id ? -1 : 0}
            onClick={() => {
              if (renamingTabId === tab.id) return;
              handleTabClick(tab.id);
            }}
            onKeyDown={(event) => {
              if (renamingTabId === tab.id) return;
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                handleTabClick(tab.id);
              }
            }}
            onDoubleClick={() => handleStartRenameTab(tab.id)}
            onContextMenu={(event) => handleTabContextMenu(event, tab.id)}
            draggable={renamingTabId !== tab.id}
            onMouseDown={(event) => {
              if (event.button !== 1) return;
              event.preventDefault();
              handleCloseTab(tab.id);
            }}
            onDragStart={(event) => {
              if (renamingTabId === tab.id) {
                event.preventDefault();
                return;
              }
              setDraggingTabId(tab.id);
              setTabDropTargetId(tab.id);
              event.dataTransfer.effectAllowed = "move";
              event.dataTransfer.setData("text/plain", tab.id);
            }}
            onDragOver={(event) => {
              event.preventDefault();
              if (draggingTabId && draggingTabId !== tab.id) {
                setTabDropTargetId(tab.id);
              }
            }}
            onDrop={(event) => {
              event.preventDefault();
              handleTabDrop(tab.id);
            }}
            onDragEnd={() => {
              setDraggingTabId(null);
              setTabDropTargetId(null);
            }}
            title={tab.path ?? tab.name}
          >
            {renamingTabId === tab.id ? (
              <input
                ref={renameInputRef}
                className="tab-chip-input form-input"
                value={renamingTabName}
                onChange={(event) => setRenamingTabName(event.target.value)}
                onClick={(event) => event.stopPropagation()}
                onDoubleClick={(event) => event.stopPropagation()}
                onBlur={handleCommitRenameTab}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    handleCommitRenameTab();
                    return;
                  }

                  if (event.key === "Escape") {
                    event.preventDefault();
                    handleCancelRenameTab();
                  }
                }}
              />
            ) : (
              <span className="tab-chip-name">
                {tab.pinned && <Pin size={10} className="tab-chip-pin" aria-hidden="true" />}
                {!tab.saved && <span className="tab-chip-dot" aria-hidden="true" />}
                {tab.name}
              </span>
            )}
            <button
              type="button"
              className="tab-chip-close"
              draggable={false}
              aria-label={`关闭 ${tab.name}`}
              onClick={(event) => {
                event.stopPropagation();
                handleCloseTab(tab.id);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  event.stopPropagation();
                  handleCloseTab(tab.id);
                }
              }}
            >
              <X size={10} />
            </button>
          </div>
        ))}
      </div>

      <Toolbar
        onFormat={handleFormat}
        viewMode={isWysiwyg ? "wysiwyg" : viewMode}
        onViewModeChange={setViewMode}
        editMode={editMode}
        onExportHtml={() => saveAsHtml(file.content, file.name, file.path)}
        onExportPdf={() => exportPdf(file.content, file.name, file.path)}
        onExportText={() => saveAsPlainText(file.content, file.name)}
        focusMode={focusMode}
        onToggleFocusMode={() => setFocusMode((current) => !current)}
        syncScroll={syncScroll}
        onToggleSyncScroll={() => setSyncScroll((current) => !current)}
      />
      </div>

      <Suspense fallback={<ModalFallback />}>
        <SearchBar
          visible={showSearch}
          target={searchTarget}
          editor={activeSearchEditor}
          replaceMode={searchReplaceMode}
          focusToken={searchFocusToken}
          onReplaceModeChange={setSearchReplaceMode}
          onClose={() => setShowSearch(false)}
        />
      </Suspense>

      <div className={`main-area ${focusMode ? "focus-mode" : ""}`}>
        {showSidebar && (
          <>
            <div className="sidebar" style={{ width: sidebarWidth }}>
              <div className="sidebar-tabs">
                <button
                  className="sidebar-close"
                  onClick={toggleSidebar}
                  title="关闭侧边栏"
                >
                  <X size={14} />
                </button>
                <button
                  className={`sidebar-tab ${sidebarTab === "files" ? "active" : ""}`}
                  onClick={() => setSidebarTab("files")}
                  title="文件"
                >
                  <FolderTree size={14} />
                </button>
                <button
                  className={`sidebar-tab ${sidebarTab === "outline" ? "active" : ""}`}
                  onClick={() => setSidebarTab("outline")}
                  title="目录"
                >
                  <List size={14} />
                </button>
              </div>

              {sidebarTab === "files" && (
                <FileTree
                  workspacePath={workspacePath}
                  tree={tree}
                  expandedDirs={expandedDirs}
                  activeFilePath={file.path}
                  recentFiles={recentFiles}
                  recentWorkspaces={recentWorkspaces}
                  onRemoveRecent={removeRecentFile}
                  onClearRecent={clearRecentFiles}
                  onOpenRecentWorkspace={(path) => void openRecentWorkspace(path)}
                  onRemoveRecentWorkspace={removeRecentWorkspace}
                  onClearRecentWorkspaces={clearRecentWorkspaces}
                  onOpenFolder={openWorkspace}
                  onToggleExpand={toggleExpand}
                  onFileClick={handleFileClick}
                  onRefresh={refreshTree}
                  onCreateFile={createFile}
                  onRenameFile={handleRenameFile}
                  onDeleteFile={handleDeleteFile}
                />
              )}

              {sidebarTab === "outline" && (
                <div className="outline-panel">
                  <div className="file-tree-header">
                    <span className="file-tree-title">目录</span>
                  </div>
                  <div className="outline-content">
                    {toc.length === 0 ? (
                      <div className="file-tree-empty">
                        <p>暂无标题</p>
                      </div>
                    ) : (
                      toc.map((item) => (
                        <a
                          key={`${item.id}-${item.level}`}
                          className={`toc-item h${item.level}`}
                          href={`#${item.id}`}
                          onClick={(event) => {
                            event.preventDefault();
                            const element = findHeadingElement(item.id, item.text);
                            if (!element) return;

                            const container = element.closest(".wysiwyg-container, .split-pane-right") as HTMLElement | null;
                            if (container) {
                              container.scrollTo({
                                top:
                                  container.scrollTop +
                                  element.getBoundingClientRect().top -
                                  container.getBoundingClientRect().top -
                                  40,
                                behavior: "smooth",
                              });
                            } else {
                              element.scrollIntoView({ behavior: "smooth", block: "start" });
                            }
                          }}
                        >
                          {item.text}
                        </a>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            <div
              className={`sidebar-resize-handle ${isResizingSidebar ? "active" : ""}`}
              onMouseDown={(event) => {
                event.preventDefault();
                setIsResizingSidebar(true);
              }}
            />
          </>
        )}

        <div className="split-pane" ref={containerRef}>
          {showHome || tabs.length === 0 || (!initialized && !file.path && !file.content) ? (
            <Welcome
              hasActiveDocument={hasResumeDocument}
              currentFileName={resumeDocumentName}
              currentFilePath={resumeDocumentPath}
              workspacePath={workspacePath}
              openTabCount={visibleTabCount}
              onContinue={() => void handleContinueFromHome()}
              onNewFile={() => void openNewFile()}
              onOpenFile={() => void openNativeFile()}
              onOpenFolder={() => void openWorkspace()}
              recentFiles={recentFiles}
              recentWorkspaces={recentWorkspaces}
              onOpenRecent={(path) => void openFileAndActivate(path)}
              onRemoveRecent={removeRecentFile}
              onClearRecent={clearRecentFiles}
              onOpenRecentWorkspace={(path) => void openRecentWorkspace(path)}
              onRemoveRecentWorkspace={removeRecentWorkspace}
              onClearRecentWorkspaces={clearRecentWorkspaces}
            />
          ) : (
            <>
              {isWysiwyg && (
                <div
                  ref={wysiwygPaneRef}
                  className="wysiwyg-container"
                  style={{ ["--preview-scale" as string]: String(previewFontScale) }}
                  onMouseDown={() => setActivePane("wysiwyg")}
                  onFocusCapture={() => setActivePane("wysiwyg")}
                >
                  <Suspense fallback={<div className="empty-state"><p>正在加载编辑器...</p></div>}>
                    <WysiwygEditor
                      content={file.content}
                      onChange={updateContent}
                      theme={theme}
                      currentFilePath={file.path}
                      editorRef={wysiwygEditorRef}
                      onNotice={setToastMsg}
                    />
                  </Suspense>
                </div>
              )}

              {!isWysiwyg && (
                <>
                  {(viewMode === "edit" || viewMode === "split") && (
                    <div
                      ref={sourcePaneRef}
                      className="split-pane-left"
                      style={{
                        width: viewMode === "edit" ? "100%" : `${splitRatio}%`,
                        display: "flex",
                        flexDirection: "column",
                      }}
                      onMouseDown={() => setActivePane("source")}
                      onFocusCapture={() => setActivePane("source")}
                    >
                      <div className="pane-header">
                        <span>Markdown</span>
                        <span style={{ fontWeight: 400, fontSize: 11 }}>{charCount} 字符</span>
                      </div>
                      <div style={{ flex: 1, minHeight: 0 }}>
                        <Editor
                          content={file.content}
                          onChange={updateContent}
                          theme={theme}
                          currentFilePath={file.path}
                          editorRef={sourceEditorRef}
                          onNotice={setToastMsg}
                        />
                      </div>
                    </div>
                  )}

                  {viewMode === "split" && (
                    <div
                      className={`split-divider ${isDragging ? "active" : ""}`}
                      style={{ left: `${splitRatio}%` }}
                      onMouseDown={(event) => {
                        event.preventDefault();
                        setIsDragging(true);
                      }}
                    />
                  )}

                  {(viewMode === "preview" || viewMode === "split") && (
                    <div
                      ref={previewPaneRef}
                      className="split-pane-right"
                      style={{
                        flex: viewMode === "split" ? 1 : undefined,
                        width: viewMode === "preview" ? "100%" : undefined,
                        overflow: "auto",
                      }}
                      onMouseDown={() => setActivePane("preview")}
                      onFocusCapture={() => setActivePane("preview")}
                    >
                      <div className="pane-header">
                        <span>预览</span>
                        <span style={{ fontWeight: 400, fontSize: 11 }}>{Math.round(previewFontScale * 100)}%</span>
                      </div>
                      <div style={{ ["--preview-scale" as string]: String(previewFontScale) }}>
                        <Preview content={file.content} currentFilePath={file.path} searchRef={previewSearchRef} />
                      </div>
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </div>

        {showAIPanel && (
          <Suspense fallback={<ModalFallback />}>
            <AIPanel
              messages={messages}
              isThinking={isThinking}
              error={aiError}
              editorContent={file.content}
              onSend={sendMessage}
              onStop={stopGeneration}
              onClear={clearMessages}
              onOpenSettings={() => setShowAISettings(true)}
              onReplaceContent={updateContent}
            />
          </Suspense>
        )}
      </div>

      <Suspense fallback={<ModalFallback />}>
      {showAISettings && (
          <AISettings
            settings={aiSettings}
            onSave={updateAISettings}
            onClose={() => setShowAISettings(false)}
          />
        )}
      </Suspense>

      {!showHome && (
        <StatusBar
          wordCount={wordCount}
          charCount={charCount}
          saveStatus={saveStatus}
          editMode={editMode}
          currentFile={file.name}
          openTabCount={visibleTabCount}
          error={lastError}
          previewZoom={previewFontScale}
        />
      )}

      {toastMsg && <div className="toast-bar">{toastMsg}</div>}

      {!isWysiwyg && <SelectionToolbar onFormat={handleFormat} />}

      <Suspense fallback={<ModalFallback />}>
        <QuickSwitch
          visible={showQuickSwitch}
          files={allFiles}
          recentFiles={recentFiles}
          workspacePath={workspacePath}
          onSelect={(path) => {
            void openFileAndActivate(path);
            setShowQuickSwitch(false);
          }}
          onClose={() => setShowQuickSwitch(false)}
        />
      </Suspense>

      <Suspense fallback={<ModalFallback />}>
        {showAppSettings && (
          <AppSettings
            theme={theme}
            onToggleTheme={toggleTheme}
            startupBehavior={startupBehavior}
            onStartupBehaviorChange={setStartupBehavior}
            aiSettings={aiSettings}
            onOpenAISettings={() => {
              setShowAppSettings(false);
              setShowAISettings(true);
            }}
            onOpenDataDir={() => {
              void invoke("open_app_data_dir").catch(() => {});
            }}
            version={APP_VERSION}
            onClose={() => setShowAppSettings(false)}
          />
        )}
      </Suspense>

      {bulkCloseRequest && (
        <div className="modal-overlay" onClick={() => setBulkCloseRequest(null)}>
          <div className="modal-content bulk-close-modal" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <h2>{bulkCloseRequest.title}</h2>
              <button className="icon-btn" onClick={() => setBulkCloseRequest(null)}>
                <X size={16} />
              </button>
            </div>
            <div className="modal-body">
              <p className="bulk-close-summary">
                即将关闭 <strong>{bulkCloseRequest.targetTabIds.length}</strong> 个标签，其中
                <strong> {bulkCloseRequest.unsavedTabs.length} </strong>个尚未保存。
              </p>
              {bulkCloseUntitledCount > 0 && (
                <p className="bulk-close-hint">
                  其中有 {bulkCloseUntitledCount} 个未命名标签。选择“全部保存后关闭”时，会依次要求你选择保存路径。
                </p>
              )}
              <div className="bulk-close-list">
                {bulkCloseRequest.unsavedTabs.slice(0, 6).map((tab) => (
                  <div key={tab.id} className="bulk-close-item">
                    <span className="bulk-close-item-name">{tab.name}</span>
                    <span className="bulk-close-item-path">{tab.path ?? "未命名文档"}</span>
                  </div>
                ))}
                {bulkCloseRequest.unsavedTabs.length > 6 && (
                  <div className="bulk-close-more">
                    还有 {bulkCloseRequest.unsavedTabs.length - 6} 个未保存标签未展开显示
                  </div>
                )}
              </div>
            </div>
            <div className="modal-footer">
              <button className="form-btn secondary" onClick={() => setBulkCloseRequest(null)}>
                取消
              </button>
              <button className="form-btn secondary danger-btn" onClick={handleBulkCloseDiscard}>
                不保存并关闭
              </button>
              <button className="form-btn primary" onClick={handleBulkCloseSave}>
                全部保存后关闭
              </button>
            </div>
          </div>
        </div>
      )}

      {appCloseRequest && (
        <div className="modal-overlay" onClick={() => setAppCloseRequest(null)}>
          <div className="modal-content bulk-close-modal app-close-modal" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <h2>退出前确认</h2>
              <button className="icon-btn" onClick={() => setAppCloseRequest(null)}>
                <X size={16} />
              </button>
            </div>
            <div className="modal-body">
              <p className="bulk-close-summary">
                当前有 <strong>{appCloseRequest.unsavedTabs.length}</strong> 个标签尚未保存，退出后这些更改将无法撤回。
              </p>
              {appCloseUntitledCount > 0 && (
                <p className="bulk-close-hint">
                  其中有 {appCloseUntitledCount} 个未命名标签。选择“保存后退出”时，会依次要求你选择保存位置。
                </p>
              )}
              <div className="bulk-close-list">
                {appCloseRequest.unsavedTabs.slice(0, 6).map((tab) => (
                  <div key={tab.id} className="bulk-close-item">
                    <span className="bulk-close-item-name">{tab.name}</span>
                    <span className="bulk-close-item-path">{tab.path ?? "未命名文档"}</span>
                  </div>
                ))}
                {appCloseRequest.unsavedTabs.length > 6 && (
                  <div className="bulk-close-more">
                    还有 {appCloseRequest.unsavedTabs.length - 6} 个未保存标签未展开显示
                  </div>
                )}
              </div>
            </div>
            <div className="modal-footer">
              <button className="form-btn secondary" onClick={() => setAppCloseRequest(null)}>
                取消
              </button>
              <button className="form-btn secondary danger-btn" onClick={handleAppCloseDiscard}>
                放弃更改并退出
              </button>
              <button className="form-btn primary" onClick={handleAppCloseSave}>
                保存后退出
              </button>
            </div>
          </div>
        </div>
      )}

      {tabContextMenu && (
        <ContextMenu
          x={tabContextMenu.x}
          y={tabContextMenu.y}
          items={tabContextMenu.items}
          onClose={() => setTabContextMenu(null)}
        />
      )}
    </div>
  );
}
