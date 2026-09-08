import { useState, useCallback, useRef, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";

export interface AIMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface AISettings {
  apiKey: string;
  endpoint: string;
  model: string;
}

export interface QuickAction {
  label: string;
  icon: string;
  prompt: string;
}

export const QUICK_ACTIONS: QuickAction[] = [
  { label: "润色", icon: "✨", prompt: "请润色以下文字，使其更流畅自然，保持原意不变：" },
  { label: "翻译英文", icon: "🌐", prompt: "请将以下文字翻译成英文：" },
  { label: "翻译中文", icon: "🇨🇳", prompt: "Please translate the following text into Chinese:" },
  { label: "扩写", icon: "📝", prompt: "请扩写以下内容，增加细节和深度：" },
  { label: "缩写", icon: "📄", prompt: "请精简以下内容，保留核心要点：" },
  { label: "总结", icon: "📋", prompt: "请总结以下内容的核心要点：" },
  { label: "修正语法", icon: "🔧", prompt: "请修正以下文字中的语法和拼写错误，保持原意：" },
  { label: "改口语化", icon: "💬", prompt: "请将以下文字改写为更口语化、自然的表达：" },
];

const DEFAULT_SETTINGS: AISettings = {
  apiKey: "",
  endpoint: "https://api.deepseek.com",
  model: "deepseek-v4-pro",
};

const SETTINGS_KEY = "markdown-editor-ai-settings";
const HISTORY_KEY = "markdown-editor-ai-history";

function loadSettings(): AISettings {
  try {
    const data = localStorage.getItem(SETTINGS_KEY);
    if (data) {
      const parsed = JSON.parse(data) as Partial<AISettings>;
      return { ...DEFAULT_SETTINGS, ...parsed };
    }
  } catch { /* ignore */ }
  return { ...DEFAULT_SETTINGS };
}

function saveSettings(settings: AISettings): void {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch { /* */ }
}

function loadHistory(): AIMessage[] {
  try {
    const data = localStorage.getItem(HISTORY_KEY);
    if (data) return JSON.parse(data) as AIMessage[];
  } catch { /* ignore */ }
  return [];
}

function saveHistory(messages: AIMessage[]): void {
  try {
    if (messages.length === 0) {
      localStorage.removeItem(HISTORY_KEY);
    } else {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(messages.slice(-50)));
    }
  } catch { /* */ }
}

interface UseAIReturn {
  messages: AIMessage[];
  isThinking: boolean;
  settings: AISettings;
  updateSettings: (s: AISettings) => void;
  sendMessage: (content: string, context?: string) => Promise<void>;
  stopGeneration: () => void;
  clearMessages: () => void;
  error: string | null;
}

export function useAI(): UseAIReturn {
  const [messages, setMessages] = useState<AIMessage[]>(loadHistory);
  const [isThinking, setIsThinking] = useState(false);
  const [settings, setSettings] = useState<AISettings>(loadSettings);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef(false);
  const messagesRef = useRef(messages);
  messagesRef.current = messages;
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  // Persist history
  useEffect(() => {
    saveHistory(messages);
  }, [messages]);

  const updateSettings = useCallback((s: AISettings) => {
    setSettings(s);
    saveSettings(s);
  }, []);

  const sendMessage = useCallback(
    async (content: string, context?: string) => {
      const currentSettings = settingsRef.current;
      if (!currentSettings.apiKey) {
        setError("请先配置 API Key（点击 ⚙ 按钮）");
        return;
      }

      setError(null);
      setIsThinking(true);
      abortRef.current = false;

      const systemContent = context
        ? `你是一个专业的 Markdown 写作助手。以下是用户正在编辑的文档内容：\n\n\`\`\`markdown\n${context}\n\`\`\`\n\n请基于以上文档内容回答用户的问题。回答简洁、有帮助。`
        : "你是一个专业的 Markdown 写作助手。帮助用户写作、编辑和优化 Markdown 文档。使用中文回答。回答简洁、有帮助。";

      const userMsg: AIMessage = { role: "user", content };
      const currentMessages = messagesRef.current;
      const newMessages = [...currentMessages, userMsg];
      setMessages(newMessages);

      const allMessages: AIMessage[] = [
        { role: "system", content: systemContent },
        ...newMessages,
      ];

      try {
        const result = await invoke<{ content: string }>("chat_with_ai", {
          request: {
            endpoint: currentSettings.endpoint,
            apiKey: currentSettings.apiKey,
            model: currentSettings.model,
            messages: allMessages.map((m) => ({
              role: m.role,
              content: m.content,
            })),
          },
        });

        if (!abortRef.current) {
          setMessages([
            ...newMessages,
            { role: "assistant", content: result.content },
          ]);
        }
      } catch (err) {
        if (abortRef.current) return;
        setError((err as Error).message || String(err) || "请求失败");
      } finally {
        setIsThinking(false);
      }
    },
    [] // Stable — uses refs
  );

  const stopGeneration = useCallback(() => {
    abortRef.current = true;
    setIsThinking(false);
  }, []);

  const clearMessages = useCallback(() => {
    setMessages([]);
    setError(null);
  }, []);

  return {
    messages,
    isThinking,
    settings,
    updateSettings,
    sendMessage,
    stopGeneration,
    clearMessages,
    error,
  };
}
