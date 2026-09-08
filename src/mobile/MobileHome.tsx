import { useState } from "react";
import { FilePlus, FolderOpen, Feather } from "lucide-react";
import type { MobileFileHandle } from "../platform/androidFileSystem";
import { pickAndReadFile, createNewFile } from "../platform/androidFileSystem";

interface MobileHomeProps {
  onOpenFile: (handle: MobileFileHandle, content: string) => void;
  onNewFile: () => void;
}

export default function MobileHome({ onOpenFile, onNewFile }: MobileHomeProps) {
  const [error, setError] = useState<string | null>(null);

  const handleOpen = async () => {
    setError(null);
    try {
      const result = await pickAndReadFile();
      if (result) {
        onOpenFile(result.handle, result.content);
      }
      // If null, user cancelled — no action needed
    } catch (e) {
      setError(`打开文件失败：${e}`);
    }
  };

  const handleNew = async () => {
    setError(null);
    try {
      const result = await createNewFile();
      if (result) {
        onOpenFile(result.handle, "");
      } else {
        // User cancelled the file picker — fall back to pure in-memory new file
        onNewFile();
      }
    } catch (e) {
      setError(`新建文件失败：${e}`);
    }
  };

  return (
    <div className="mobile-home">
      <div className="mobile-home-hero">
        <div className="mobile-logo" aria-hidden="true">
          <Feather size={30} strokeWidth={2.2} />
        </div>
        <h1 className="mobile-home-title">MarkFlow</h1>
        <p className="mobile-home-subtitle">Markdown 编辑器 · Android 版</p>
      </div>

      <div className="mobile-home-actions">
        <button className="mobile-home-btn primary" onClick={handleOpen}>
          <FolderOpen size={22} />
          打开文件
        </button>
        <button className="mobile-home-btn" onClick={handleNew}>
          <FilePlus size={22} />
          新建文件
        </button>
      </div>

      {error && (
        <div className="mobile-error-bar" onClick={() => setError(null)}>
          {error}
        </div>
      )}

      <p className="mobile-home-hint">
        支持 .md .markdown .mdown .mdx 文件
      </p>
    </div>
  );
}
