import { useEffect } from "react";
import { usePlantsStore } from "./plantsStore";
import { PlantPicker } from "./PlantPicker";

// Per-bed plantings + companion/antagonist guidance (Phase 4). Companion
// data is read from the local cache, so it works offline once a plant
// has been fetched at least once.
export function PlantingsSection({ bedId }: { bedId: number }) {
  const loadForBed = usePlantsStore((s) => s.loadForBed);
  const plantings = usePlantsStore((s) => s.plantings);
  const detailsById = usePlantsStore((s) => s.detailsById);
  const removePlanting = usePlantsStore((s) => s.removePlanting);
  const storeBedId = usePlantsStore((s) => s.bedId);
  const busy = usePlantsStore((s) => s.busy);
  const lastError = usePlantsStore((s) => s.lastError);
  const clearError = usePlantsStore((s) => s.clearError);

  useEffect(() => {
    void loadForBed(bedId);
  }, [bedId, loadForBed]);

  const showing = storeBedId === bedId ? plantings : [];

  return (
    <section className="plantings">
      <h3>Plantings</h3>
      <PlantPicker />

      {showing.length === 0 ? (
        <p className="dim small">No plants in this bed yet.</p>
      ) : (
        <ul className="planting-list">
          {showing.map((p) => {
            const d = detailsById[p.plant_id];
            return (
              <li key={p.id}>
                <div className="planting-row">
                  <span>
                    {d?.common_name ?? p.plant_id}
                    <span className="dim small"> · {p.status}</span>
                  </span>
                  <button
                    className="danger"
                    disabled={busy}
                    onClick={() => void removePlanting(p.id)}
                  >
                    Remove
                  </button>
                </div>
                {d?.companions && d.companions.length > 0 && (
                  <p className="companion-line">
                    <strong>Companions:</strong> {d.companions.join(", ")}
                  </p>
                )}
                {d?.antagonists && d.antagonists.length > 0 && (
                  <p className="antagonist-line">
                    <strong>Avoid near:</strong> {d.antagonists.join(", ")}
                  </p>
                )}
                {d && !d.companions && !d.antagonists && (
                  <p className="dim small">No companion data for this plant.</p>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {lastError && (
        <p className="error-inline" role="alert">
          {lastError} <button onClick={clearError}>dismiss</button>
        </p>
      )}
    </section>
  );
}
