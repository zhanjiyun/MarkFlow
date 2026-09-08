import { useState } from "react";
import { X } from "lucide-react";
import type { AISettings as AISettingsType } from "../hooks/useAI";

interface AISettingsProps {
  settings: AISettingsType;
  onSave: (settings: AISettingsType) => void;
  onClose: () => void;
}

export default function AISettings({ settings, onSave, onClose }: AISettingsProps) {
  const [apiKey, setApiKey] = useState(settings.apiKey);
  const [endpoint, setEndpoint] = useState(settings.endpoint);
  const [model, setModel] = useState(settings.model);

  const handleSave = () => {
    onSave({ apiKey: apiKey.trim(), endpoint: endpoint.trim(), model: model.trim() });
    onClose();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>AI 设置</h2>
          <button className="icon-btn" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        <div className="modal-body">
          <label className="form-label">
            API Key
            <input
              type="password"
              className="form-input"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="sk-xxxxxxxxxxxx"
            />
          </label>

          <label className="form-label">
            API 地址
            <input
              type="text"
              className="form-input"
              value={endpoint}
              onChange={(e) => setEndpoint(e.target.value)}
              placeholder="https://api.deepseek.com"
            />
          </label>

          <label className="form-label">
            模型
            <input
              type="text"
              className="form-input"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder="deepseek-chat"
            />
          </label>

          <div className="model-presets">
            <span className="preset-label">常用模型：</span>
            <button
              className={`preset-btn ${model === "deepseek-v4-pro" ? "active" : ""}`}
              onClick={() => setModel("deepseek-v4-pro")}
            >
              V4 Pro
            </button>
            <button
              className={`preset-btn ${model === "deepseek-v4-flash" ? "active" : ""}`}
              onClick={() => setModel("deepseek-v4-flash")}
            >
              V4 Flash
            </button>
            <button
              className={`preset-btn ${model === "deepseek-chat" ? "active" : ""}`}
              onClick={() => setModel("deepseek-chat")}
            >
              V3 (旧)
            </button>
          </div>
        </div>

        <div className="modal-footer">
          <button className="form-btn secondary" onClick={onClose}>
            取消
          </button>
          <button className="form-btn primary" onClick={handleSave}>
            保存
          </button>
        </div>
      </div>
    </div>
  );
}
