import { useCanvasStore } from "./canvasStore";

// Diff preview before anything touches the DB (PLAN §6.2: "Apply / Edit /
// Cancel"). "Edit" = cancel back to the sketch and adjust strokes/labels.
export function CleanupPreview() {
  const preview = useCanvasStore((s) => s.cleanupPreview);
  const warnings = useCanvasStore((s) => s.cleanupWarnings);
  const busy = useCanvasStore((s) => s.cleanupBusy);
  const applyCleanup = useCanvasStore((s) => s.applyCleanup);
  const cancelCleanup = useCanvasStore((s) => s.cancelCleanup);

  if (!preview) return null;

  const total =
    preview.beds.length + preview.paths.length + preview.structures.length;

  return (
    <div className="modal-backdrop">
      <div className="modal cleanup-preview">
        <h2>Review cleanup</h2>
        <p className="dim small">
          AI suggested {total} shape{total === 1 ? "" : "s"} from your sketch.
          Nothing is saved until you apply — and every vertex stays editable
          afterward.
        </p>
        <ul>
          <li>{preview.beds.length} bed(s)</li>
          <li>{preview.paths.length} path(s)</li>
          <li>{preview.structures.length} structure(s)</li>
        </ul>
        {warnings.length > 0 && (
          <div className="cleanup-warning">
            <strong>Warnings</strong>
            <ul>
              {warnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          </div>
        )}
        <div className="modal-actions">
          <button disabled={busy || total === 0} onClick={() => void applyCleanup()}>
            Apply
          </button>
          <button disabled={busy} onClick={cancelCleanup}>
            Edit sketch
          </button>
          <button disabled={busy} className="danger" onClick={cancelCleanup}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
