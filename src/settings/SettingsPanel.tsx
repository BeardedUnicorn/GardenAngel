import { useEffect, useState } from "react";
import { useSettingsStore } from "./settingsStore";

export function SettingsPanel() {
  const {
    isOpen,
    close,
    baseUrl,
    model,
    hasApiKey,
    isBusy,
    lastError,
    saveConfig,
    setApiKey,
    clearApiKey,
    clearError,
  } = useSettingsStore();

  const [draftBaseUrl, setDraftBaseUrl] = useState(baseUrl);
  const [draftModel, setDraftModel] = useState(model);
  const [draftKey, setDraftKey] = useState("");

  useEffect(() => {
    if (isOpen) {
      setDraftBaseUrl(baseUrl);
      setDraftModel(model);
      setDraftKey("");
    }
  }, [isOpen, baseUrl, model]);

  if (!isOpen) return null;

  return (
    <div className="modal-backdrop" onClick={close}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Settings</h2>
        <p className="dim small">
          The coach &amp; sketch-cleanup model. API key is stored in your macOS
          Keychain, never in the project file.
        </p>

        <label>
          API base URL
          <input
            value={draftBaseUrl}
            onChange={(e) => setDraftBaseUrl(e.currentTarget.value)}
            placeholder="https://api.openai.com/v1"
          />
        </label>

        <label>
          Model
          <input
            value={draftModel}
            onChange={(e) => setDraftModel(e.currentTarget.value)}
            placeholder="gpt-4o-mini"
          />
        </label>

        <div className="modal-actions">
          <button
            disabled={isBusy}
            onClick={() => void saveConfig(draftBaseUrl.trim(), draftModel.trim())}
          >
            Save model config
          </button>
        </div>

        <hr />

        <label>
          API key {hasApiKey && <span className="badge">set</span>}
          <input
            type="password"
            value={draftKey}
            onChange={(e) => setDraftKey(e.currentTarget.value)}
            placeholder={hasApiKey ? "•••••••• (stored)" : "sk-…"}
            autoComplete="off"
          />
        </label>

        <div className="modal-actions">
          <button
            disabled={isBusy || draftKey.trim().length === 0}
            onClick={async () => {
              await setApiKey(draftKey.trim());
              setDraftKey("");
            }}
          >
            Save key
          </button>
          <button
            className="danger"
            disabled={isBusy || !hasApiKey}
            onClick={() => void clearApiKey()}
          >
            Remove key
          </button>
        </div>

        {lastError && (
          <p className="error-inline" role="alert">
            {lastError} <button onClick={clearError}>dismiss</button>
          </p>
        )}

        <div className="modal-actions">
          <button onClick={close}>Done</button>
        </div>
      </div>
    </div>
  );
}
