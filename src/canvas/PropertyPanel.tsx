import { useCanvasStore } from "./canvasStore";
import type { Bed, PathShape, Structure, StructureKind, SunExposure } from "./types";

const SUN_OPTIONS: SunExposure[] = ["full", "partial", "shade"];
const STRUCTURE_KINDS: StructureKind[] = [
  "shed",
  "fence",
  "water",
  "compost",
  "tree",
  "other",
];

export function PropertyPanel() {
  const selection = useCanvasStore((s) => s.selection);
  const beds = useCanvasStore((s) => s.beds);
  const paths = useCanvasStore((s) => s.paths);
  const structures = useCanvasStore((s) => s.structures);

  if (!selection) {
    return (
      <aside className="property-panel">
        <h2>Properties</h2>
        <p className="dim">Select a shape to edit its properties.</p>
      </aside>
    );
  }

  if (selection.kind === "bed") {
    const bed = beds.find((b) => b.id === selection.id);
    if (!bed) return <EmptyPanel />;
    return <BedEditor bed={bed} />;
  }
  if (selection.kind === "path") {
    const path = paths.find((p) => p.id === selection.id);
    if (!path) return <EmptyPanel />;
    return <PathEditor path={path} />;
  }
  const structure = structures.find((s) => s.id === selection.id);
  if (!structure) return <EmptyPanel />;
  return <StructureEditor structure={structure} />;
}

function EmptyPanel() {
  return (
    <aside className="property-panel">
      <h2>Properties</h2>
      <p className="dim">Selection not found.</p>
    </aside>
  );
}

function BedEditor({ bed }: { bed: Bed }) {
  const updateBed = useCanvasStore((s) => s.updateBed);
  const deleteBed = useCanvasStore((s) => s.deleteBed);

  return (
    <aside className="property-panel">
      <h2>Bed</h2>
      <label>
        Name
        <input
          value={bed.name ?? ""}
          onChange={(e) =>
            void updateBed(bed.id, {
              name: e.currentTarget.value || null,
              shape_type: bed.shape_type,
              geometry: bed.geometry,
              soil_notes: bed.soil_notes,
              sun_exposure: bed.sun_exposure,
            })
          }
        />
      </label>
      <label>
        Sun
        <select
          value={bed.sun_exposure ?? ""}
          onChange={(e) =>
            void updateBed(bed.id, {
              name: bed.name,
              shape_type: bed.shape_type,
              geometry: bed.geometry,
              soil_notes: bed.soil_notes,
              sun_exposure: (e.currentTarget.value || null) as SunExposure | null,
            })
          }
        >
          <option value="">—</option>
          {SUN_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </label>
      <label>
        Soil notes
        <textarea
          value={bed.soil_notes ?? ""}
          rows={3}
          onChange={(e) =>
            void updateBed(bed.id, {
              name: bed.name,
              shape_type: bed.shape_type,
              geometry: bed.geometry,
              soil_notes: e.currentTarget.value || null,
              sun_exposure: bed.sun_exposure,
            })
          }
        />
      </label>
      <p className="dim small">{bed.shape_type} · updated {shortTime(bed.updated_at)}</p>
      <button className="danger" onClick={() => void deleteBed(bed.id)}>
        Delete bed
      </button>
    </aside>
  );
}

function PathEditor({ path }: { path: PathShape }) {
  const updatePath = useCanvasStore((s) => s.updatePath);
  const deletePath = useCanvasStore((s) => s.deletePath);

  return (
    <aside className="property-panel">
      <h2>Path</h2>
      <label>
        Name
        <input
          value={path.name ?? ""}
          onChange={(e) =>
            void updatePath(path.id, {
              name: e.currentTarget.value || null,
              points: path.points,
              width: path.width,
              material: path.material,
            })
          }
        />
      </label>
      <label>
        Width (px)
        <input
          type="number"
          min={4}
          max={120}
          step={2}
          value={path.width}
          onChange={(e) =>
            void updatePath(path.id, {
              name: path.name,
              points: path.points,
              width: Number(e.currentTarget.value) || path.width,
              material: path.material,
            })
          }
        />
      </label>
      <label>
        Material
        <input
          value={path.material ?? ""}
          onChange={(e) =>
            void updatePath(path.id, {
              name: path.name,
              points: path.points,
              width: path.width,
              material: e.currentTarget.value || null,
            })
          }
        />
      </label>
      <p className="dim small">
        {path.points.length} vertices · updated {shortTime(path.updated_at)}
      </p>
      <button className="danger" onClick={() => void deletePath(path.id)}>
        Delete path
      </button>
    </aside>
  );
}

function StructureEditor({ structure }: { structure: Structure }) {
  const updateStructure = useCanvasStore((s) => s.updateStructure);
  const deleteStructure = useCanvasStore((s) => s.deleteStructure);

  return (
    <aside className="property-panel">
      <h2>Structure</h2>
      <label>
        Name
        <input
          value={structure.name ?? ""}
          onChange={(e) =>
            void updateStructure(structure.id, {
              name: e.currentTarget.value || null,
              kind: structure.kind,
              geometry: structure.geometry,
              notes: structure.notes,
            })
          }
        />
      </label>
      <label>
        Kind
        <select
          value={structure.kind}
          onChange={(e) =>
            void updateStructure(structure.id, {
              name: structure.name,
              kind: e.currentTarget.value as StructureKind,
              geometry: structure.geometry,
              notes: structure.notes,
            })
          }
        >
          {STRUCTURE_KINDS.map((k) => (
            <option key={k} value={k}>
              {k}
            </option>
          ))}
        </select>
      </label>
      <label>
        Notes
        <textarea
          value={structure.notes ?? ""}
          rows={3}
          onChange={(e) =>
            void updateStructure(structure.id, {
              name: structure.name,
              kind: structure.kind,
              geometry: structure.geometry,
              notes: e.currentTarget.value || null,
            })
          }
        />
      </label>
      <p className="dim small">updated {shortTime(structure.updated_at)}</p>
      <button className="danger" onClick={() => void deleteStructure(structure.id)}>
        Delete structure
      </button>
    </aside>
  );
}

function shortTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  } catch {
    return iso;
  }
}
