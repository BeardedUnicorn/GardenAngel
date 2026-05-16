import { create } from "zustand";
import type { ModelConfig } from "../ai/types";
import type { PermapeopleConfig } from "../plants/permapeopleAdapter";
import type { CoachVoice } from "../coach/prompts/systemPrompts";
import {
  SECRET_API_KEY,
  SECRET_PP_KEY_ID,
  SECRET_PP_KEY_SECRET,
  SETTING_BASE_URL,
  SETTING_COACH_VOICE,
  SETTING_MODEL,
  settingsApi,
} from "./settingsApi";

const DEFAULT_BASE_URL = "https://api.openai.com/v1";
const DEFAULT_MODEL = "gpt-4o-mini";

interface SettingsState {
  baseUrl: string;
  model: string;
  coachVoice: CoachVoice;
  hasApiKey: boolean;
  hasPermapeople: boolean;
  isOpen: boolean;
  isBusy: boolean;
  lastError: string | null;

  open: () => void;
  close: () => void;
  load: () => Promise<void>;
  saveConfig: (baseUrl: string, model: string) => Promise<void>;
  setApiKey: (key: string) => Promise<void>;
  clearApiKey: () => Promise<void>;
  setPermapeopleKeys: (keyId: string, keySecret: string) => Promise<void>;
  clearPermapeopleKeys: () => Promise<void>;
  setCoachVoice: (voice: CoachVoice) => Promise<void>;
  /** Transiently fetch the full config (incl. key) for an API call. */
  resolveConfig: () => Promise<ModelConfig>;
  resolvePermapeople: () => Promise<PermapeopleConfig>;
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
  coachVoice: "mystical",
  hasApiKey: false,
  hasPermapeople: false,
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
      const hasPermapeople =
        (await settingsApi.secretHas(SECRET_PP_KEY_ID)) &&
        (await settingsApi.secretHas(SECRET_PP_KEY_SECRET));
      set({
        baseUrl: all[SETTING_BASE_URL] || DEFAULT_BASE_URL,
        model: all[SETTING_MODEL] || DEFAULT_MODEL,
        coachVoice: all[SETTING_COACH_VOICE] === "plain" ? "plain" : "mystical",
        hasApiKey,
        hasPermapeople,
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

  async setPermapeopleKeys(keyId, keySecret) {
    set({ isBusy: true, lastError: null });
    try {
      await settingsApi.secretSet(SECRET_PP_KEY_ID, keyId);
      await settingsApi.secretSet(SECRET_PP_KEY_SECRET, keySecret);
      set({ hasPermapeople: true });
    } catch (err) {
      set({ lastError: errToString(err) });
    } finally {
      set({ isBusy: false });
    }
  },

  async clearPermapeopleKeys() {
    set({ isBusy: true, lastError: null });
    try {
      await settingsApi.secretDelete(SECRET_PP_KEY_ID);
      await settingsApi.secretDelete(SECRET_PP_KEY_SECRET);
      set({ hasPermapeople: false });
    } catch (err) {
      set({ lastError: errToString(err) });
    } finally {
      set({ isBusy: false });
    }
  },

  async setCoachVoice(voice) {
    try {
      await settingsApi.set(SETTING_COACH_VOICE, voice);
      set({ coachVoice: voice });
    } catch (err) {
      set({ lastError: errToString(err) });
    }
  },

  async resolveConfig(): Promise<ModelConfig> {
    const { baseUrl, model } = get();
    const apiKey = (await settingsApi.secretGet(SECRET_API_KEY)) ?? "";
    return { baseUrl, model, apiKey };
  },

  async resolvePermapeople(): Promise<PermapeopleConfig> {
    const keyId = (await settingsApi.secretGet(SECRET_PP_KEY_ID)) ?? "";
    const keySecret = (await settingsApi.secretGet(SECRET_PP_KEY_SECRET)) ?? "";
    return { keyId, keySecret };
  },
}));
