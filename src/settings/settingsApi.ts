import { invoke } from "@tauri-apps/api/core";

// Non-secret config lives in the project DB `settings` table; the API key
// lives in the OS Keychain (ADR-001). Keep these key names stable.
export const SETTING_BASE_URL = "ai_base_url";
export const SETTING_MODEL = "ai_model";
export const SECRET_API_KEY = "coach-api-key";

export const settingsApi = {
  getAll: () => invoke<Record<string, string>>("settings_get_all"),
  set: (key: string, value: string) => invoke<void>("setting_set", { key, value }),

  secretSet: (account: string, value: string) =>
    invoke<void>("secret_set", { account, value }),
  secretHas: (account: string) => invoke<boolean>("secret_has", { account }),
  secretGet: (account: string) => invoke<string | null>("secret_get", { account }),
  secretDelete: (account: string) => invoke<void>("secret_delete", { account }),
};
