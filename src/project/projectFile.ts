import { invoke } from "@tauri-apps/api/core";

export interface ProjectMeta {
  path: string;
  garden_id: number;
  name: string;
  created_at: string;
  format_version: number;
  app_version: string;
}

export async function projectNew(path: string): Promise<ProjectMeta> {
  return invoke<ProjectMeta>("project_new", { path });
}

export async function projectOpen(path: string): Promise<ProjectMeta> {
  return invoke<ProjectMeta>("project_open", { path });
}

export async function projectSave(): Promise<void> {
  await invoke("project_save");
}

export async function projectClose(): Promise<void> {
  await invoke("project_close");
}

export async function projectCurrent(): Promise<ProjectMeta | null> {
  return invoke<ProjectMeta | null>("project_current");
}
