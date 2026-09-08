import { save } from "@tauri-apps/plugin-dialog";
import { writeTextFile } from "@tauri-apps/plugin-fs";
import { renderMarkdown } from "./markdown";

function getExportStyles(): string {
  return `
    body {
      margin: 0;
      background: #fbfaf6;
      color: #4f3520;
      font: 16px/1.75 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }

    main {
      max-width: 860px;
      margin: 0 auto;
      padding: 48px 28px;
      background: #fffdf8;
      min-height: 100vh;
    }

    h1, h2, h3, h4 {
      color: #4f3520;
      line-height: 1.35;
      margin-top: 1.8em;
    }

    h1 {
      border-bottom: 1px solid #e8e2d6;
      padding-bottom: 12px;
    }

    a { color: #128b82; }
    code {
      background: #f0e8d8;
      border-radius: 6px;
      padding: 2px 5px;
    }

    pre {
      overflow-x: auto;
      border: 1px solid #e8e2d6;
      border-radius: 12px;
      background: #f8f3e9;
      padding: 16px;
    }

    pre code {
      background: transparent;
      padding: 0;
    }

    blockquote {
      border-left: 4px solid #19c8b9;
      margin-left: 0;
      padding: 10px 16px;
      background: #e6f9f6;
      color: #6f5d4a;
      border-radius: 0 10px 10px 0;
    }

    table { width: 100%; border-collapse: collapse; }
    th, td { border: 1px solid #e8e2d6; padding: 8px 10px; }
    img { max-width: 100%; border-radius: 12px; }
    .mermaid { background: #fff; }
    mark { background: rgba(255, 214, 10, 0.35); padding: 0 0.15em; border-radius: 3px; }
    .contains-task-list { list-style: none; padding-left: 0; }
    .task-list-item { display: flex; align-items: flex-start; gap: 8px; }
    .task-list-item label { display: inline-flex; align-items: flex-start; gap: 8px; }
    .task-list-item input[type="checkbox"] { margin-top: 0.25em; }
    .footnotes {
      margin-top: 2.5em;
      padding-top: 1em;
      border-top: 1px solid #e8e2d6;
      color: #6f5d4a;
      font-size: 0.95em;
    }
    .footnotes ol { padding-left: 1.5em; }
    .footnote-ref a, .footnote-backref { text-decoration: none; }
    .frontmatter {
      margin-bottom: 24px;
      padding: 12px 16px;
      background: #f7f2e9;
      border: 1px solid #e8e2d6;
      border-radius: 8px;
      font-size: 12px;
      line-height: 1.8;
    }
    .fm-row { display: flex; gap: 12px; }
    .fm-key { min-width: 80px; color: #128b82; font-weight: 600; }
    .fm-val { color: #6f5d4a; word-break: break-word; }
    .fm-list { margin: 0; padding-left: 1.2em; }
    .fm-nested { display: flex; flex-direction: column; gap: 4px; }
    .fm-nested-row { display: flex; flex-wrap: wrap; gap: 8px; }
    .fm-nested-key { font-weight: 600; }
    .fm-empty { color: #8a7564; font-style: italic; }

  `;
}

function waitForLoadOrError(element: HTMLElement): Promise<void> {
  return new Promise((resolve) => {
    const finish = () => resolve();
    element.addEventListener("load", finish, { once: true });
    element.addEventListener("error", finish, { once: true });
  });
}

async function waitForImage(image: HTMLImageElement): Promise<void> {
  if (!image.complete) {
    await waitForLoadOrError(image);
  }

  if (image.naturalWidth > 0 && typeof image.decode === "function") {
    await image.decode().catch(() => undefined);
  }
}

async function waitForPrintResources(
  frameDocument: Document,
  timeoutMs = 10_000
): Promise<boolean> {
  const imagesReady = Array.from(frameDocument.images).map(waitForImage);

  const fontsReady = frameDocument.fonts?.ready
    .then(() => undefined)
    .catch(() => undefined) ?? Promise.resolve();

  const resourcesReady = Promise.allSettled([
    ...imagesReady,
    fontsReady,
  ]).then(() => true);

  let timeoutId: number | null = null;
  const timedOut = new Promise<boolean>((resolve) => {
    timeoutId = window.setTimeout(() => resolve(false), timeoutMs);
  });

  const ready = await Promise.race([resourcesReady, timedOut]);
  if (timeoutId !== null) {
    window.clearTimeout(timeoutId);
  }

  return ready;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function toBaseHref(currentFilePath?: string | null): string | null {
  if (!currentFilePath) return null;

  const normalized = currentFilePath.replace(/\\/g, "/");
  const lastSlash = normalized.lastIndexOf("/");
  if (lastSlash < 0) return null;

  const dirPath = normalized.slice(0, lastSlash + 1);
  return `file:///${encodeURI(dirPath)}`;
}

function stripMarkdownExtension(fileName: string): string {
  return fileName.replace(/\.(md|markdown|mdx)$/i, "");
}

function getExportBaseName(fileName: string, currentFilePath?: string | null): string {
  const pathName = currentFilePath?.split(/[\\/]/).pop();
  const baseName = stripMarkdownExtension(pathName || fileName).trim();
  return baseName.replace(/[\\/:*?"<>|]/g, "_") || "markdown-export";
}

export function generateHtml(markdown: string, title: string, currentFilePath?: string | null): string {
  const htmlBody = renderMarkdown(markdown);
  const baseHref = toBaseHref(currentFilePath);

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)}</title>
  ${baseHref ? `<base href="${escapeHtml(baseHref)}">` : ""}
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.17.0/dist/katex.min.css" />
  <style>
    ${getExportStyles()}

    @media print {
      @page {
        margin: 12mm 18mm 16mm;
        @top-center {
          content: "";
        }
        @bottom-center {
          content: counter(page);
          color: #8a7564;
          font: 10px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        }
      }

      body {
        background: #fff;
      }

      main {
        max-width: none;
        padding: 0;
        background: #fff;
        min-height: auto;
      }

      main > :first-child {
        margin-top: 0;
      }

      /* Page break controls */
      h1, h2, h3, h4, h5, h6 {
        page-break-after: avoid;
        break-after: avoid;
        page-break-inside: avoid;
        break-inside: avoid;
      }

      pre, blockquote, .code-block-wrapper {
        page-break-inside: avoid;
        break-inside: avoid;
      }

      img {
        page-break-inside: avoid;
        break-inside: avoid;
        max-width: 100%;
      }

      .katex-display {
        page-break-inside: avoid;
        break-inside: avoid;
      }

      table {
        page-break-inside: auto;
        break-inside: auto;
      }

      thead {
        display: table-header-group;
      }

      tfoot {
        display: table-footer-group;
      }

      tr {
        page-break-inside: avoid;
        break-inside: avoid;
        page-break-after: auto;
        break-after: auto;
      }

      ul, ol {
        page-break-before: avoid;
        break-before: avoid;
      }

      li {
        page-break-inside: avoid;
        break-inside: avoid;
      }
    }
  </style>
</head>
<body>
  <main>${htmlBody}</main>
</body>
</html>`;
}

export async function saveAsHtml(
  markdown: string,
  fileName: string,
  currentFilePath?: string | null
): Promise<boolean> {
  try {
    const exportBaseName = getExportBaseName(fileName, currentFilePath);
    const html = generateHtml(markdown, exportBaseName, currentFilePath);
    const filePath = await save({
      filters: [{ name: "HTML", extensions: ["html"] }],
      defaultPath: exportBaseName + ".html",
    });

    if (!filePath) return false;

    await writeTextFile(filePath, html);
    return true;
  } catch (err) {
    console.error("HTML export failed:", err);
    return false;
  }
}

export async function saveAsPlainText(
  markdown: string,
  fileName: string
): Promise<boolean> {
  try {
    const filePath = await save({
      filters: [{ name: "Text", extensions: ["txt"] }],
      defaultPath: stripMarkdownExtension(fileName) + ".txt",
    });

    if (!filePath) return false;

    await writeTextFile(filePath, markdown);
    return true;
  } catch (err) {
    console.error("Plain text export failed:", err);
    return false;
  }
}

export async function exportPdf(
  markdown: string,
  fileName: string,
  currentFilePath?: string | null
): Promise<boolean> {
  try {
    const exportBaseName = getExportBaseName(fileName, currentFilePath);
    const html = generateHtml(markdown, exportBaseName, currentFilePath);
    const iframe = document.createElement("iframe");

    iframe.style.position = "fixed";
    iframe.style.right = "0";
    iframe.style.bottom = "0";
    iframe.style.width = "1px";
    iframe.style.height = "1px";
    iframe.style.border = "0";
    iframe.style.opacity = "0";
    iframe.style.pointerEvents = "none";
    iframe.setAttribute("aria-hidden", "true");

    document.body.appendChild(iframe);

    await new Promise<void>((resolve, reject) => {
      let cleanupTimer: number | null = null;

      const cleanup = () => {
        if (cleanupTimer !== null) {
          window.clearTimeout(cleanupTimer);
          cleanupTimer = null;
        }
        iframe.remove();
      };

      const printFrame = () => {
        const printWindow = iframe.contentWindow;
        if (!printWindow) {
          cleanup();
          reject(new Error("Unable to open the PDF print preview."));
          return;
        }

        const originalTitle = document.title;
        document.title = exportBaseName;
        printWindow.document.title = exportBaseName;

        const restoreTitle = () => {
          document.title = originalTitle;
        };

        const onAfterPrint = () => {
          restoreTitle();
          cleanup();
        };

        printWindow.addEventListener("afterprint", onAfterPrint, { once: true });
        // Fallback: clean up after 60s in case the print dialog is never dismissed
        cleanupTimer = window.setTimeout(onAfterPrint, 60_000);

        try {
          printWindow.focus();
          printWindow.print();
          resolve();
        } catch (error) {
          restoreTitle();
          cleanup();
          reject(error);
        }
      };

      iframe.addEventListener(
        "load",
        () => {
          const frameDocument = iframe.contentDocument;
          if (!frameDocument) {
            cleanup();
            reject(new Error("Unable to prepare the PDF export content."));
            return;
          }

          void waitForPrintResources(frameDocument).then((ready) => {
            if (!ready) {
              console.warn("PDF resources did not finish loading before the timeout.");
            }
            window.setTimeout(printFrame, 100);
          }).catch((error) => {
            cleanup();
            reject(error);
          });
        },
        { once: true }
      );

      const frameDocument = iframe.contentDocument;
      if (!frameDocument) {
        cleanup();
        reject(new Error("Unable to prepare the PDF export content."));
        return;
      }

      frameDocument.open();
      frameDocument.write(html);
      frameDocument.close();
    });

    return true;
  } catch (err) {
    alert("PDF export failed: " + String(err));
    return false;
  }
}
