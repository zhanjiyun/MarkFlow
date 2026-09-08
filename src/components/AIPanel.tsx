import { useState, useRef, useEffect, useCallback } from "react";
import {
  Send,
  Trash2,
  Settings,
  Bot,
  User,
  Loader2,
  AlertCircle,
  FileText,
  Copy,
  Check,
  Replace,
  Square,
} from "lucide-react";
import { renderMarkdown } from "../utils/markdown";
import { QUICK_ACTIONS } from "../hooks/useAI";
import type { AIMessage } from "../hooks/useAI";

interface AIPanelProps {
  messages: AIMessage[];
  isThinking: boolean;
  error: string | null;
  editorContent: string;
  onSend: (content: string, context?: string) => void;
  onStop: () => void;
  onClear: () => void;
  onOpenSettings: () => void;
  onReplaceContent?: (content: string) => void;
}

export default function AIPanel({
  messages,
  isThinking,
  error,
  editorContent,
  onSend,
  onStop,
  onClear,
  onOpenSettings,
  onReplaceContent,
}: AIPanelProps) {
  const [input, setInput] = useState("");
  const [includeContext, setIncludeContext] = useState(false);
  const [selectedText, setSelectedText] = useState("");
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Detect selected text in editor
  useEffect(() => {
    const handleSelection = () => {
      const sel = window.getSelection();
      const text = sel?.toString().trim() || "";
      setSelectedText(text);
    };
    document.addEventListener("mouseup", handleSelection);
    document.addEventListener("keyup", handleSelection);
    return () => {
      document.removeEventListener("mouseup", handleSelection);
      document.removeEventListener("keyup", handleSelection);
    };
  }, []);

  // Auto-scroll to bottom
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isThinking]);

  const handleSend = useCallback(() => {
    const text = input.trim();
    if (!text || isThinking) return;
    const context = includeContext && editorContent ? editorContent : undefined;
    onSend(text, context);
    setInput("");
  }, [input, isThinking, includeContext, editorContent, onSend]);

  const handleQuickAction = useCallback(
    (action: (typeof QUICK_ACTIONS)[0]) => {
      if (isThinking) return;
      const target = selectedText || (includeContext ? editorContent : "");
      if (!target) {
        onSend(action.prompt + "请根据当前文档内容进行操作。");
        return;
      }
      const prompt = `${action.prompt}\n\n---\n${target}\n---`;
      onSend(prompt);
    },
    [isThinking, selectedText, includeContext, editorContent, onSend]
  );

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleSendSelected = () => {
    if (!selectedText || isThinking) return;
    onSend(selectedText);
    setSelectedText("");
  };

  return (
    <div className="ai-panel">
      {/* Header */}
      <div className="ai-panel-header">
        <span className="ai-panel-title">
          <Bot size={14} /> AI 助手
        </span>
        <div className="ai-panel-actions">
          <button className="icon-btn" onClick={onOpenSettings} title="AI 设置">
            <Settings size={14} />
          </button>
          {messages.length > 0 && (
            <button className="icon-btn" onClick={onClear} title="清空对话">
              <Trash2 size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Context bar */}
      <div className="ai-context-bar">
        <label className="ai-context-toggle">
          <input
            type="checkbox"
            checked={includeContext}
            onChange={(e) => setIncludeContext(e.target.checked)}
          />
          <FileText size={12} />
          附加全文
        </label>
        {includeContext && editorContent && (
          <span className="ai-context-hint">({editorContent.length} 字)</span>
        )}
      </div>

      {/* Messages */}
      <div className="ai-messages">
        {messages.length === 0 && !error && (
          <div className="ai-empty">
            <Bot size={32} strokeWidth={1} />
            <p>有问题？问问 AI 助手</p>
            <p className="ai-empty-hint">
              选中文字后可使用快捷操作
            </p>
          </div>
        )}

        {messages.map((msg, i) => (
          <AIMessageBubble
            key={i}
            message={msg}
            onReplaceContent={msg.role === "assistant" ? onReplaceContent : undefined}
          />
        ))}

        {isThinking && (
          <div className="ai-message assistant">
            <div className="ai-message-avatar">
              <Loader2 size={14} className="ai-spinner" />
            </div>
            <div className="ai-message-content ai-thinking">
              思考中...
              <button className="ai-stop-btn" onClick={onStop}>
                <Square size={10} /> 停止
              </button>
            </div>
          </div>
        )}

        {error && (
          <div className="ai-error">
            <AlertCircle size={14} />
            {error}
          </div>
        )}

        <div ref={endRef} />
      </div>

      {/* Quick actions */}
      {!isThinking && (
        <div className="ai-quick-actions">
          {QUICK_ACTIONS.map((action) => (
            <button
              key={action.label}
              className="ai-quick-btn"
              onClick={() => handleQuickAction(action)}
              title={action.prompt}
            >
              <span className="ai-quick-icon">{action.icon}</span>
              {action.label}
            </button>
          ))}
        </div>
      )}

      {/* Selected text hint */}
      {selectedText && !isThinking && (
        <div className="ai-selected-hint" onClick={handleSendSelected}>
          <FileText size={12} />
          <span className="ai-selected-preview">
            {selectedText.length > 60
              ? selectedText.slice(0, 60) + "..."
              : selectedText}
          </span>
          <Send size={12} />
        </div>
      )}

      {/* Input */}
      <div className="ai-input-area">
        <input
          ref={inputRef}
          type="text"
          className="ai-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="输入消息，Enter 发送..."
          disabled={isThinking}
        />
        <button
          className="ai-send-btn"
          onClick={handleSend}
          disabled={isThinking || !input.trim()}
        >
          <Send size={14} />
        </button>
      </div>
    </div>
  );
}

/* ---- AI Message Bubble ---- */
function AIMessageBubble({
  message,
  onReplaceContent,
}: {
  message: AIMessage;
  onReplaceContent?: (content: string) => void;
}) {
  const [copied, setCopied] = useState(false);
  const html =
    message.role === "assistant"
      ? renderMarkdown(message.content)
      : null;

  const handleCopy = () => {
    navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleReplace = () => {
    // Extract code block content for replacement
    const codeMatch = message.content.match(/```[\s\S]*?\n([\s\S]*?)```/);
    const text = codeMatch ? codeMatch[1] : message.content;
    onReplaceContent?.(text);
  };

  return (
    <div className={`ai-message ${message.role}`}>
      <div className="ai-message-avatar">
        {message.role === "user" ? <User size={14} /> : <Bot size={14} />}
      </div>
      <div className="ai-message-body">
        {html ? (
          <div
            className="ai-message-markdown"
            dangerouslySetInnerHTML={{ __html: html }}
          />
        ) : (
          <div className="ai-message-content">{message.content}</div>
        )}

        {/* Actions for assistant messages */}
        {message.role === "assistant" && (
          <div className="ai-message-actions">
            <button className="ai-msg-btn" onClick={handleCopy} title="复制">
              {copied ? <Check size={12} /> : <Copy size={12} />}
              {copied ? "已复制" : "复制"}
            </button>
            {onReplaceContent && (
              <button className="ai-msg-btn" onClick={handleReplace} title="替换到文档">
                <Replace size={12} />
                替换
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
