import { useCallback, useState } from "react";
import MobileHome from "./MobileHome";
import MobileEditor from "./MobileEditor";
import type { MobileFileHandle } from "../platform/androidFileSystem";
import "./mobile.css";

type Screen = "home" | "editor";

export default function MobileApp() {
  const [screen, setScreen] = useState<Screen>("home");
  const [fileHandle, setFileHandle] = useState<MobileFileHandle | null>(null);
  const [initialContent, setInitialContent] = useState("");
  const [isNewFile, setIsNewFile] = useState(false);

  const handleOpenFile = useCallback(
    (handle: MobileFileHandle, content: string) => {
      setFileHandle(handle);
      setInitialContent(content);
      setIsNewFile(false);
      setScreen("editor");
    },
    []
  );

  const handleNewFile = useCallback(() => {
    setFileHandle(null);
    setInitialContent("");
    setIsNewFile(true);
    setScreen("editor");
  }, []);

  const handleBackHome = useCallback(() => {
    setScreen("home");
    setFileHandle(null);
    setInitialContent("");
  }, []);

  if (screen === "editor") {
    return (
      <div className="mobile-app">
        <div key="editor" className="mobile-screen">
          <MobileEditor
            fileHandle={fileHandle}
            initialContent={initialContent}
            isNewFile={isNewFile}
            onBack={handleBackHome}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="mobile-app">
      <div key="home" className="mobile-screen">
        <MobileHome onOpenFile={handleOpenFile} onNewFile={handleNewFile} />
      </div>
    </div>
  );
}
