import { useEffect, useRef, useState } from "react";
import { useCoachStore } from "./coachStore";
import { useSettingsStore } from "../settings/settingsStore";

export function CoachPanel() {
  const {
    isOpen,
    close,
    init,
    messages,
    streaming,
    send,
    lastError,
    clearError,
  } = useCoachStore();
  const coachVoice = useSettingsStore((s) => s.coachVoice);
  const setCoachVoice = useSettingsStore((s) => s.setCoachVoice);
  const [draft, setDraft] = useState("");
  const listRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (isOpen) void init();
  }, [isOpen, init]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages]);

  if (!isOpen) return null;

  const submit = () => {
    const t = draft;
    setDraft("");
    void send(t);
  };

  return (
    <aside className="coach-panel" aria-label="Coach">
      <header className="coach-head">
        <h2>Coach</h2>
        <div className="mode-toggle">
          <button
            className={coachVoice === "mystical" ? "active" : ""}
            onClick={() => void setCoachVoice("mystical")}
            title="Symbolic, naturalistic register"
          >
            Mystical
          </button>
          <button
            className={coachVoice === "plain" ? "active" : ""}
            onClick={() => void setCoachVoice("plain")}
            title="Plain, clinical-but-warm register"
          >
            Plain
          </button>
        </div>
        <button onClick={close} title="Close (Cmd+J)">
          ✕
        </button>
      </header>

      <div className="coach-messages" ref={listRef}>
        {messages.length === 0 && (
          <p className="dim small">
            Ask about a selected bed, companions, what to observe, or the
            season. Voice changes apply to your next message.
          </p>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`coach-msg coach-${m.role}`}>
            <span className="coach-role">{m.role === "user" ? "You" : "Coach"}</span>
            <p>{m.content || (streaming ? "…" : "")}</p>
          </div>
        ))}
      </div>

      {lastError && (
        <p className="error-inline" role="alert">
          {lastError} <button onClick={clearError}>dismiss</button>
        </p>
      )}

      <form
        className="coach-input"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <textarea
          rows={2}
          value={draft}
          placeholder="Ask the coach…"
          disabled={streaming}
          onChange={(e) => setDraft(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
        />
        <button type="submit" disabled={streaming || draft.trim().length === 0}>
          {streaming ? "…" : "Send"}
        </button>
      </form>
    </aside>
  );
}
