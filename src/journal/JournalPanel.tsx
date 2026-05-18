import { useEffect, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { useJournalStore } from "./journalStore";
import { journalApi } from "./journalApi";

function PhotoThumb({ path }: { path: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let revoked: string | null = null;
    let alive = true;
    void (async () => {
      try {
        const bytes = await journalApi.photoBytes(path);
        const blob = new Blob([new Uint8Array(bytes)]);
        const u = URL.createObjectURL(blob);
        revoked = u;
        if (alive) setUrl(u);
      } catch {
        if (alive) setUrl(null);
      }
    })();
    return () => {
      alive = false;
      if (revoked) URL.revokeObjectURL(revoked);
    };
  }, [path]);
  if (!url) return <div className="journal-photo placeholder" />;
  return <img className="journal-photo" src={url} alt="observation" />;
}

export function JournalPanel() {
  const {
    isOpen,
    close,
    observations,
    busy,
    lastError,
    load,
    add,
    remove,
    clearError,
  } = useJournalStore();
  const [body, setBody] = useState("");
  const [photoPath, setPhotoPath] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) void load();
  }, [isOpen, load]);

  if (!isOpen) return null;

  const pickPhoto = async () => {
    const picked = await open({
      title: "Attach a photo",
      multiple: false,
      directory: false,
      filters: [{ name: "Image", extensions: ["jpg", "jpeg", "png", "webp", "gif"] }],
    });
    if (typeof picked === "string") setPhotoPath(picked);
  };

  const submit = async () => {
    if (body.trim().length === 0 && !photoPath) return;
    await add({ body: body.trim(), bedId: null, photoSourcePath: photoPath });
    setBody("");
    setPhotoPath(null);
  };

  return (
    <aside className="journal-panel" aria-label="Journal">
      <header className="coach-head">
        <h2>Journal</h2>
        <button onClick={close} title="Close">
          ✕
        </button>
      </header>

      <div className="journal-add">
        <textarea
          rows={3}
          value={body}
          placeholder="What did you observe?"
          onChange={(e) => setBody(e.currentTarget.value)}
        />
        <div className="modal-actions">
          <button onClick={() => void pickPhoto()}>
            {photoPath ? "Photo attached ✓" : "Attach photo"}
          </button>
          {photoPath && (
            <button onClick={() => setPhotoPath(null)}>Remove photo</button>
          )}
          <button
            disabled={busy || (body.trim().length === 0 && !photoPath)}
            onClick={() => void submit()}
          >
            Add observation
          </button>
        </div>
      </div>

      {lastError && (
        <p className="error-inline" role="alert">
          {lastError} <button onClick={clearError}>dismiss</button>
        </p>
      )}

      <div className="journal-list">
        {observations.length === 0 ? (
          <p className="dim small">No observations yet.</p>
        ) : (
          observations.map((o) => (
            <article key={o.id} className="journal-entry">
              <div className="journal-entry-head">
                <span className="dim small">
                  {o.observed_at.slice(0, 10)}
                  {o.bed_id ? ` · bed ${o.bed_id}` : ""}
                </span>
                <button
                  className="danger"
                  disabled={busy}
                  onClick={() => void remove(o.id)}
                >
                  Delete
                </button>
              </div>
              {o.body && <p>{o.body}</p>}
              {o.photo_path && <PhotoThumb path={o.photo_path} />}
            </article>
          ))
        )}
      </div>
    </aside>
  );
}
