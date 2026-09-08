import { useEffect } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { lstat } from "@tauri-apps/plugin-fs";

interface UseDragDropOptions {
  onOpenFilePath: (path: string) => Promise<unknown>;
  onOpenFolderPath: (path: string) => Promise<unknown>;
}

function isMarkdownPath(path: string): boolean {
  return /\.(md|markdown|mdown|mdx)$/i.test(path);
}

export function useDragDrop({ onOpenFilePath, onOpenFolderPath }: UseDragDropOptions) {
  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | undefined;

    getCurrentWindow()
      .onDragDropEvent(async (event) => {
        if (disposed || event.payload.type !== "drop") return;

        for (const droppedPath of event.payload.paths) {
          if (isMarkdownPath(droppedPath)) {
            await onOpenFilePath(droppedPath);
            continue;
          }

          try {
            const info = await lstat(droppedPath);
            if (info.isDirectory) {
              await onOpenFolderPath(droppedPath);
            }
          } catch {
            // Ignore invalid drop targets.
          }
        }
      })
      .then((fn) => {
        unlisten = fn;
      })
      .catch(() => {
        // Ignore drag-drop setup failures outside Tauri.
      });

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [onOpenFilePath, onOpenFolderPath]);
}
