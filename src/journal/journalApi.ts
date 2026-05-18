import { invoke } from "@tauri-apps/api/core";
import type { ObservationRow } from "../coach/coachApi";

export interface ObservationInput {
  body: string;
  bed_id: number | null;
  planting_id: number | null;
  observed_at: string | null;
  photo_source_path: string | null;
}

export const journalApi = {
  list: () => invoke<ObservationRow[]>("observations_list"),
  create: (input: ObservationInput) =>
    invoke<ObservationRow>("observation_create", { input }),
  remove: (id: number) => invoke<void>("observation_delete", { id }),
  photoBytes: (photoPath: string) =>
    invoke<number[]>("observation_photo_read", { photoPath }),
};
