import { create } from "zustand";
import type { ModelConfig } from "../ai/types";
import {
  SECRET_API_KEY,
  SETTING_BASE_URL,
  SETTING_MODEL,
  settingsApi,
} from "./settingsApi";

const DEFAULT_BASE_URL = "https://api.openai.com/v1";
const DEFAULT_MODEL = "gpt-4o-mini";

interface SettingsState {
  baseUrl: string;
  model: string;
  hasApiKey: boolean;
  isOpen: boolean;
  isBusy: boolean;
  lastError: string | null;

  open: () => void;
  close: () => void;
  load: () => Promise<void>;
  saveConfig: (baseUrl: string, model: string) => Promise<void>;
  setApiKey: (key: string) => Promise<void>;
  clearApiKey: () => Promise<void>;
  /** Transiently fetch the full config (incl. key) for an API call. */
  resolveConfig: () => Promise<ModelConfig>;
  clearError: () => void;
}

function errToString(err: unknown): string {
  if (typeof err === "string") return err;
  if (err instanceof Error) return err.message;
  return JSON.stringify(err);
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  baseUrl: DEFAULT_BASE_URL,
  model: DEFAULT_MODEL,
  hasApiKey: false,
  isOpen: false,
  isBusy: false,
  lastError: null,

  open: () => set({ isOpen: true }),
  close: () => set({ isOpen: false }),
  clearError: () => set({ lastError: null }),

  async load() {
    try {
      const all = await settingsApi.getAll();
      const hasApiKey = await settingsApi.secretHas(SECRET_API_KEY);
      set({
        baseUrl: all[SETTING_BASE_URL] || DEFAULT_BASE_URL,
        model: all[SETTING_MODEL] || DEFAULT_MODEL,
        hasApiKey,
      });
    } catch (err) {
      set({ lastError: errToString(err) });
    }
  },

  async saveConfig(baseUrl, model) {
    set({ isBusy: true, lastError: null });
    try {
      await settingsApi.set(SETTING_BASE_URL, baseUrl);
      await settingsApi.set(SETTING_MODEL, model);
      set({ baseUrl, model });
    } catch (err) {
      set({ lastError: errToString(err) });
    } finally {
      set({ isBusy: false });
    }
  },

  async setApiKey(key) {
    set({ isBusy: true, lastError: null });
    try {
      await settingsApi.secretSet(SECRET_API_KEY, key);
      set({ hasApiKey: true });
    } catch (err) {
      set({ lastError: errToString(err) });
    } finally {
      set({ isBusy: false });
    }
  },

  async clearApiKey() {
    set({ isBusy: true, lastError: null });
    try {
      await settingsApi.secretDelete(SECRET_API_KEY);
      set({ hasApiKey: false });
    } catch (err) {
      set({ lastError: errToString(err) });
    } finally {
      set({ isBusy: false });
    }
  },

  async resolveConfig(): Promise<ModelConfig> {
    const { baseUrl, model } = get();
    const apiKey = (await settingsApi.secretGet(SECRET_API_KEY)) ?? "";
    return { baseUrl, model, apiKey };
  },
}));
