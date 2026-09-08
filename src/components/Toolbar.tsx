import {
  Bold,
  Italic,
  Heading1,
  Heading2,
  List,
  ListOrdered,
  Quote,
  Code,
  Link,
  Image,
  Table,
  Minus,
  Eye,
  FileEdit,
  PanelRightOpen,
  FileDown,
  FileText,
  Crosshair,
  ArrowUpDown,
} from "lucide-react";

interface ToolbarProps {
  onFormat: (format: string) => void;
  viewMode: "edit" | "preview" | "split" | "wysiwyg";
  onViewModeChange: (mode: "edit" | "preview" | "split") => void;
  editMode?: "wysiwyg" | "source";
  onExportHtml: () => void;
  onExportPdf: () => void;
  onExportText: () => void;
  focusMode: boolean;
  onToggleFocusMode: () => void;
  syncScroll: boolean;
  onToggleSyncScroll: () => void;
}

const FORMAT_TOOLS = [
  { icon: Bold, action: "bold", title: "粗体 (Ctrl+B)" },
  { icon: Italic, action: "italic", title: "斜体 (Ctrl+I)" },
  { type: "separator" as const },
  { icon: Heading1, action: "h1", title: "标题 1" },
  { icon: Heading2, action: "h2", title: "标题 2" },
  { type: "separator" as const },
  { icon: List, action: "ul", title: "无序列表" },
  { icon: ListOrdered, action: "ol", title: "有序列表" },
  { type: "separator" as const },
  { icon: Quote, action: "quote", title: "引用" },
  { icon: Code, action: "code", title: "代码块" },
  { icon: Link, action: "link", title: "链接" },
  { icon: Image, action: "image", title: "图片" },
  { icon: Table, action: "table", title: "表格" },
  { icon: Minus, action: "hr", title: "分隔线" },
];

export default function Toolbar({
  onFormat,
  viewMode,
  onViewModeChange,
  editMode,
  onExportHtml,
  onExportPdf,
  onExportText,
  focusMode,
  onToggleFocusMode,
  syncScroll,
  onToggleSyncScroll,
}: ToolbarProps) {
  const isWysiwyg = editMode === "wysiwyg";

  return (
    <div className="toolbar">
      <div className="toolbar-group">
        {/* Format buttons — only show in source mode (WYSIWYG has built-in markdown shortcuts) */}
        {!isWysiwyg &&
          FORMAT_TOOLS.map((tool, i) =>
            "type" in tool && tool.type === "separator" ? (
              <div key={i} className="toolbar-separator" />
            ) : (
              <button
                key={i}
                className="toolbar-btn"
                title={"title" in tool ? tool.title : ""}
                onClick={() => "action" in tool && onFormat(tool.action)}
              >
                {"icon" in tool && <tool.icon />}
              </button>
            )
          )}

        {/* Hint text when in WYSIWYG mode */}
        {isWysiwyg && (
          <span className="wysiwyg-hint">
            所见即所得模式 — 使用 Markdown 语法直接编辑
          </span>
        )}
      </div>

      <div className="toolbar-spacer" />

      <div className="toolbar-group">
        {/* Export buttons — always visible */}
        <button className="toolbar-btn" onClick={onExportHtml} title="导出 HTML">
          <FileDown size={16} />
          <span style={{ fontSize: 10, marginLeft: 2 }}>HTML</span>
        </button>
        <button className="toolbar-btn" onClick={onExportPdf} title="导出 PDF">
          <FileText size={16} />
          <span style={{ fontSize: 10, marginLeft: 2 }}>PDF</span>
        </button>
        <button className="toolbar-btn" onClick={onExportText} title="导出纯文本">
          <FileText size={16} />
          <span style={{ fontSize: 10, marginLeft: 2 }}>TXT</span>
        </button>

        <div className="toolbar-separator" />

        {/* Focus mode */}
        {!isWysiwyg && (
          <>
            <button
              className={`toolbar-btn ${focusMode ? "active-tool" : ""}`}
              onClick={onToggleFocusMode}
              title="专注模式"
            >
              <Crosshair size={14} />
            </button>
            <button
              className={`toolbar-btn ${syncScroll ? "active-tool" : ""}`}
              onClick={onToggleSyncScroll}
              title="同步滚动"
            >
              <ArrowUpDown size={14} />
            </button>
          </>
        )}

        <div className="toolbar-separator" />

        <div className="view-mode">
          {!isWysiwyg && (
            <>
              <button
                className={`view-mode-btn ${viewMode === "edit" ? "active" : ""}`}
                onClick={() => onViewModeChange("edit")}
                title="仅编辑"
              >
                <FileEdit size={14} />
                编辑
              </button>
              <button
                className={`view-mode-btn ${viewMode === "split" ? "active" : ""}`}
                onClick={() => onViewModeChange("split")}
                title="分栏"
              >
                <PanelRightOpen size={14} />
                分栏
              </button>
              <button
                className={`view-mode-btn ${viewMode === "preview" ? "active" : ""}`}
                onClick={() => onViewModeChange("preview")}
                title="仅预览"
              >
                <Eye size={14} />
                预览
              </button>
            </>
          )}
          {isWysiwyg && (
            <button
              className="view-mode-btn active"
              title="所见即所得 — 编辑即预览"
            >
              <Eye size={14} />
              实时预览
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
