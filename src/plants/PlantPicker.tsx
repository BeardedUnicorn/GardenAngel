import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSettingsStore } from "../settings/settingsStore";
import { createPermapeopleAdapter } from "./permapeopleAdapter";
import { usePlantsStore } from "./plantsStore";
import type { PlantSummary } from "./types";

export function PlantPicker() {
  const [text, setText] = useState("");
  const [query, setQuery] = useState("");
  const hasPermapeople = useSettingsStore((s) => s.hasPermapeople);
  const resolvePermapeople = useSettingsStore((s) => s.resolvePermapeople);
  const addPlanting = usePlantsStore((s) => s.addPlanting);
  const busy = usePlantsStore((s) => s.busy);

  // Debounce keystrokes into the actual query (search-as-you-type).
  useEffect(() => {
    const t = setTimeout(() => setQuery(text.trim()), 300);
    return () => clearTimeout(t);
  }, [text]);

  const enabled = hasPermapeople && query.length >= 2;
  const { data, isFetching, error } = useQuery({
    queryKey: ["plant-search", query],
    enabled,
    queryFn: async ({ signal }): Promise<PlantSummary[]> => {
      const adapter = createPermapeopleAdapter(await resolvePermapeople());
      return adapter.search(query, signal);
    },
  });

  return (
    <div className="plant-picker">
      <input
        value={text}
        placeholder={
          hasPermapeople ? "Search plants (e.g. tomato)" : "Set Permapeople keys in Settings"
        }
        disabled={!hasPermapeople}
        onChange={(e) => setText(e.currentTarget.value)}
      />
      {isFetching && <p className="dim small">Searching…</p>}
      {error && (
        <p className="error-inline">
          {error instanceof Error ? error.message : "Search failed."}
        </p>
      )}
      {data && data.length > 0 && (
        <ul className="plant-results">
          {data.slice(0, 12).map((p) => (
            <li key={p.external_id}>
              <button
                disabled={busy}
                onClick={() => void addPlanting(p)}
                title="Add to this bed"
              >
                <span>{p.common_name}</span>
                {p.scientific_name && (
                  <em className="dim small"> {p.scientific_name}</em>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
      {data && data.length === 0 && query.length >= 2 && !isFetching && (
        <p className="dim small">No matches.</p>
      )}
    </div>
  );
}
