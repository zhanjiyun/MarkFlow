import { useEffect, useRef, useCallback } from "react";
import { Crepe, CrepeFeature } from "@milkdown/crepe";
import { editorViewCtx } from "@milkdown/kit/core";
import { TextSelection } from "@milkdown/prose/state";
import type { EditorView } from "@milkdown/prose/view";
import { Milkdown, MilkdownProvider, useEditor } from "@milkdown/react";
import { replaceAll, insert } from "@milkdown/utils";
import "@milkdown/crepe/theme/common/style.css";
import "@milkdown/crepe/theme/classic.css";
import "@milkdown/crepe/theme/frame.css";
import "./MilkdownownTheme.css";
import { handleImagePaste, resolveLocalImageSrcs } from "../utils/image";
import type { EditorSearchMatch, SearchableEditorHandle } from "../types/editorSearch";
import type { WysiwygViewState } from "../types/tabState";
import { findProseMatches } from "../utils/proseSearch";

export interface WysiwygEditorHandle extends SearchableEditorHandle {
  getMarkdown: () => string;
  getViewState: () => WysiwygViewState;
  restoreViewState: (state?: WysiwygViewState) => boolean;
}

interface WysiwygEditorProps {
  content: string;
  onChange: (value: string) => void;
  theme: string;
  editorRef: React.MutableRefObject<WysiwygEditorHandle | null>;
  currentFilePath: string | null;
  onNotice?: (message: string) => void;
}

function CrepeEditor({
  content,
  onChange,
  theme,
  editorRef,
  currentFilePath,
  onNotice,
}: WysiwygEditorProps) {
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const onNoticeRef = useRef(onNotice);
  onNoticeRef.current = onNotice;

  const crepeRef = useRef<Crepe | null>(null);
  const ignoreNextUpdate = useRef(false);
  // Only propagate content back after a real user interaction. Milkdown emits
  // markdownUpdated for its own initial parse/serialise pass, which would
  // otherwise mark a freshly opened file as modified and auto-save a
  // reformatted copy.
  const userEditedRef = useRef(false);
  const currentFilePathRef = useRef(currentFilePath);
  currentFilePathRef.current = currentFilePath;

  const getEditorView = useCallback((): EditorView | null => {
    const crepe = crepeRef.current;
    if (!crepe?.editor) return null;

    try {
      return crepe.editor.action((ctx) => ctx.get(editorViewCtx));
    } catch {
      return null;
    }
  }, []);

  const getScrollContainer = useCallback((): HTMLElement | null => {
    return document.querySelector(".wysiwyg-container");
  }, []);

  // Handle image paste
  const handlePaste = useCallback(
    async (e: ClipboardEvent) => {
      const mdTag = await handleImagePaste(e, currentFilePathRef.current);
      if (mdTag) {
        const crepe = crepeRef.current;
        if (crepe?.editor) {
          crepe.editor.action(insert(mdTag, true));
        }
      }
    },
    []
  );

  useEditor((root) => {
    const crepe = new Crepe({
      root,
      defaultValue: content,
      features: {
        [CrepeFeature.Toolbar]: false,
        [CrepeFeature.TopBar]: false,
        [CrepeFeature.CodeMirror]: true,
        [CrepeFeature.Latex]: true,
        [CrepeFeature.ImageBlock]: true,
        [CrepeFeature.Table]: true,
        [CrepeFeature.BlockEdit]: true,
        [CrepeFeature.LinkTooltip]: true,
        [CrepeFeature.ListItem]: true,
        [CrepeFeature.Cursor]: true,
        [CrepeFeature.Placeholder]: true,
      },
    });

    // Listen for markdown changes from user input
    crepe.on((listenerManager) => {
      listenerManager.markdownUpdated((_ctx, markdown) => {
        if (ignoreNextUpdate.current) {
          ignoreNextUpdate.current = false;
          return;
        }
        if (!userEditedRef.current) {
          // Initial parse/serialise or external replace — not a user edit.
          return;
        }
        onChangeRef.current(markdown);
      });
    });

    crepeRef.current = crepe;

    // Expose handle for parent
    editorRef.current = {
      getMarkdown: () => crepeRef.current?.getMarkdown() ?? "",
      canReplace: true,
      focus: () => {
        getEditorView()?.focus();
      },
      findMatches: (query, caseSensitive) => {
        const view = getEditorView();
        return view ? findProseMatches(view.state.doc, query, caseSensitive) : [];
      },
      selectMatch: (match: EditorSearchMatch, options) => {
        const view = getEditorView();
        if (!view || match.from < 0 || match.from >= match.to || match.to > view.state.doc.content.size) {
          return false;
        }

        const selection = TextSelection.create(view.state.doc, match.from, match.to);
        view.dispatch(view.state.tr.setSelection(selection).scrollIntoView());
        if (options?.focus !== false) {
          view.focus();
        }
        return true;
      },
      replaceMatch: (match, replacement) => {
        const view = getEditorView();
        if (!view || match.from < 0 || match.from >= match.to || match.to > view.state.doc.content.size) {
          return null;
        }

        const nextTo = match.from + replacement.length;
        const tr = view.state.tr.insertText(replacement, match.from, match.to);
        tr.setSelection(TextSelection.create(tr.doc, match.from, nextTo));
        tr.scrollIntoView();
        view.dispatch(tr);
        view.focus();

        return {
          from: match.from,
          to: nextTo,
        };
      },
      replaceAll: (query, replacement, caseSensitive) => {
        const view = getEditorView();
        if (!view) return 0;

        const matches = findProseMatches(view.state.doc, query, caseSensitive);
        if (matches.length === 0) return 0;

        let tr = view.state.tr;
        let offset = 0;

        for (const match of matches) {
          const from = match.from + offset;
          const to = match.to + offset;
          tr = tr.insertText(replacement, from, to);
          offset += replacement.length - (match.to - match.from);
        }

        view.dispatch(tr.scrollIntoView());
        view.focus();
        return matches.length;
      },
      getViewState: () => {
        const view = getEditorView();
        const selection = view?.state.selection;

        return {
          from: selection?.from ?? 0,
          to: selection?.to ?? 0,
          scrollTop: getScrollContainer()?.scrollTop ?? 0,
        };
      },
      restoreViewState: (state) => {
        const view = getEditorView();
        if (!view || !state) return false;

        const max = view.state.doc.content.size;
        const from = Math.max(0, Math.min(max, state.from));
        const to = Math.max(from, Math.min(max, state.to));

        const selection = TextSelection.create(view.state.doc, from, to);
        view.dispatch(view.state.tr.setSelection(selection));

        const container = getScrollContainer();
        if (container) {
          requestAnimationFrame(() => {
            container.scrollTop = Math.max(0, state.scrollTop);
          });
        }

        return true;
      },
    };

    return crepe;
  }, [editorRef, getEditorView, getScrollContainer]); // Only create once on mount

  // Sync external content changes → WYSIWYG editor (file open, mode switch)
  const prevContentRef = useRef(content);
  useEffect(() => {
    if (content !== prevContentRef.current) {
      prevContentRef.current = content;
      const crepe = crepeRef.current;
      if (!crepe?.editor) return;
      const currentMd = crepe.getMarkdown();
      if (currentMd !== content) {
        ignoreNextUpdate.current = true;
        userEditedRef.current = false;
        // flush=true rebuilds the editor state, so loading another file
        // cannot be undone back to the previous file's content.
        crepe.editor.action(replaceAll(content, true));
      }
    }
  }, [content]);

  // Sync theme
  useEffect(() => {
    document.documentElement.setAttribute("data-milkdown-theme", theme);
  }, [theme]);

  // Load relative image paths (assets/...) through Tauri's asset protocol.
  // The .milkdown container may not exist yet when this effect runs, so watch
  // the document until it appears, then observe it for image changes.
  useEffect(() => {
    let containerObserver: MutationObserver | null = null;
    let observed: Element | null = null;

    const resolve = () => {
      const container = document.querySelector(".milkdown");
      if (!container) return;
      resolveLocalImageSrcs(container as HTMLElement, currentFilePathRef.current);

      if (observed !== container) {
        containerObserver?.disconnect();
        containerObserver = new MutationObserver(() =>
          resolveLocalImageSrcs(container as HTMLElement, currentFilePathRef.current)
        );
        containerObserver.observe(container, { childList: true, subtree: true });
        observed = container;
      }
    };

    resolve();
    const bodyObserver = new MutationObserver(resolve);
    bodyObserver.observe(document.body, { childList: true, subtree: true });

    return () => {
      bodyObserver.disconnect();
      containerObserver?.disconnect();
    };
  }, [currentFilePath]);

  // Track real user input and intercept image pastes before Crepe's own
  // ImageBlock handling sees them (otherwise the image is also inserted as an
  // in-memory blob URL). Uses document-level capture so it survives the
  // editor element being recreated.
  useEffect(() => {
    const isInEditor = (target: EventTarget | null) =>
      target instanceof Element && !!target.closest(".milkdown");

    const markEdited = (event: Event) => {
      if (isInEditor(event.target)) userEditedRef.current = true;
    };

    const onPasteCapture = (event: ClipboardEvent) => {
      if (!isInEditor(event.target)) return;
      const items = event.clipboardData?.items;
      if (!items) return;
      const itemList = Array.from(items);
      const hasImage = itemList.some((item) => item.type.startsWith("image/"));
      if (!hasImage) return;

      // Keep text alongside an image (web page copies) for the default paste.
      if (itemList.some((item) => item.type === "text/plain")) return;

      if (!currentFilePathRef.current) {
        // Without a saved path there is no place to write assets — stop Crepe
        // from inserting a session-only blob URL and tell the user why.
        event.preventDefault();
        event.stopPropagation();
        onNoticeRef.current?.("请先保存文件，再粘贴图片");
        return;
      }

      // Stop Crepe/ProseMirror from inserting the blob-based image too.
      userEditedRef.current = true;
      event.preventDefault();
      event.stopPropagation();
      void handlePaste(event);
    };

    document.addEventListener("paste", onPasteCapture, true);
    document.addEventListener("beforeinput", markEdited, true);
    document.addEventListener("drop", markEdited, true);

    return () => {
      document.removeEventListener("paste", onPasteCapture, true);
      document.removeEventListener("beforeinput", markEdited, true);
      document.removeEventListener("drop", markEdited, true);
    };
  }, [handlePaste]);

  return <Milkdown />;
}

export default function WysiwygEditor(props: WysiwygEditorProps) {
  return (
    <MilkdownProvider>
      <CrepeEditor {...props} />
    </MilkdownProvider>
  );
}
