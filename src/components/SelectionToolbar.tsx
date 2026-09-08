import { useState, useEffect, useRef, useCallback } from "react";
import { Bold, Italic, Code, Link, Strikethrough } from "lucide-react";

interface SelectionToolbarProps {
  onFormat: (format: string) => void;
}

export default function SelectionToolbar({ onFormat }: SelectionToolbarProps) {
  const [visible, setVisible] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const toolbarRef = useRef<HTMLDivElement>(null);

  const handleSelectionChange = useCallback(() => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.toString().trim()) {
      setVisible(false);
      return;
    }

    // Only show for selections inside editor area
    const anchor = sel.anchorNode;
    const inEditor = anchor?.parentElement?.closest(".ProseMirror, .cm-editor, .wysiwyg-container");
    if (!inEditor) {
      setVisible(false);
      return;
    }

    // Position above selection
    const range = sel.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    const top = rect.top - 42;
    const left = rect.left + rect.width / 2;

    setPosition({
      x: Math.max(8, Math.min(window.innerWidth - 100, left)),
      y: Math.max(4, top),
    });
    setVisible(true);
  }, []);

  useEffect(() => {
    document.addEventListener("selectionchange", handleSelectionChange);
    document.addEventListener("mouseup", handleSelectionChange);
    return () => {
      document.removeEventListener("selectionchange", handleSelectionChange);
      document.removeEventListener("mouseup", handleSelectionChange);
    };
  }, [handleSelectionChange]);

  // Hide when clicking outside
  useEffect(() => {
    if (!visible) return;
    const hide = (e: MouseEvent) => {
      if (toolbarRef.current && !toolbarRef.current.contains(e.target as Node)) {
        // Delay to allow click on toolbar buttons
        setTimeout(() => setVisible(false), 200);
      }
    };
    document.addEventListener("mousedown", hide);
    return () => document.removeEventListener("mousedown", hide);
  }, [visible]);

  if (!visible) return null;

  const tools = [
    { icon: Bold, action: "bold", title: "粗体" },
    { icon: Italic, action: "italic", title: "斜体" },
    { icon: Strikethrough, action: "strikethrough", title: "删除线" },
    { icon: Code, action: "code", title: "代码" },
    { icon: Link, action: "link", title: "链接" },
  ];

  return (
    <div
      ref={toolbarRef}
      className="selection-toolbar"
      style={{
        left: position.x,
        top: position.y,
        transform: "translateX(-50%)",
      }}
    >
      {tools.map((tool) => (
        <button
          key={tool.action}
          className="selection-toolbar-btn"
          title={tool.title}
          onMouseDown={(e) => {
            e.preventDefault();
            onFormat(tool.action);
            // Keep selection visible briefly
            setTimeout(() => setVisible(false), 100);
          }}
        >
          <tool.icon size={14} />
        </button>
      ))}
    </div>
  );
}
