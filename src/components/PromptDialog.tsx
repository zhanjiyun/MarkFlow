import { useEffect, useRef } from "react";
import { X } from "lucide-react";

export interface PromptConfig {
  title: string;
  message: string;
  defaultValue: string;
  confirmLabel: string;
  onConfirm: (value: string) => void;
  onCancel: () => void;
}

interface PromptDialogProps {
  config: PromptConfig | null;
}

export default function PromptDialog({ config }: PromptDialogProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!config) return;
    const timer = window.setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 50);
    return () => window.clearTimeout(timer);
  }, [config]);

  useEffect(() => {
    if (!config) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        config.onCancel();
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [config]);

  if (!config) return null;

  const handleSubmit = () => {
    const value = inputRef.current?.value.trim();
    if (value) config.onConfirm(value);
  };

  return (
    <div className="modal-overlay" onClick={config.onCancel}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ width: 380 }}>
        <div className="modal-header">
          <h2>{config.title}</h2>
          <button className="icon-btn" onClick={config.onCancel}>
            <X size={16} />
          </button>
        </div>
        <div className="modal-body">
          {config.message && (
            <p style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 8 }}>
              {config.message}
            </p>
          )}
          <input
            ref={inputRef}
            className="form-input"
            defaultValue={config.defaultValue}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleSubmit();
              }
            }}
            placeholder={config.defaultValue}
          />
        </div>
        <div className="modal-footer">
          <button className="form-btn secondary" onClick={config.onCancel}>
            取消
          </button>
          <button className="form-btn primary" onClick={handleSubmit}>
            {config.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
