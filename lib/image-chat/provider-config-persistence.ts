import type { ProviderConnectionConfig } from "@/lib/image-chat/types";

const PROVIDER_CONFIG_STORAGE_KEY = "image-chat.provider-config.preference";

const DEFAULT_PROVIDER_CONFIG: ProviderConnectionConfig = {
  apiKey: "",
  baseUrl: "",
  model: "gpt-image-2",
};

export type ProviderConfigPreference = {
  remember: boolean;
  config: ProviderConnectionConfig;
};

function getDefaultPreference(): ProviderConfigPreference {
  return {
    remember: false,
    config: { ...DEFAULT_PROVIDER_CONFIG },
  };
}

function hasStorage() {
  return typeof window !== "undefined";
}

function sanitizeConfig(input?: Partial<ProviderConnectionConfig> | null): ProviderConnectionConfig {
  return {
    apiKey: typeof input?.apiKey === "string" ? input.apiKey : DEFAULT_PROVIDER_CONFIG.apiKey,
    baseUrl: typeof input?.baseUrl === "string" ? input.baseUrl : DEFAULT_PROVIDER_CONFIG.baseUrl,
    model:
      typeof input?.model === "string" && input.model.trim().length > 0
        ? input.model
        : DEFAULT_PROVIDER_CONFIG.model,
  };
}

export function loadPersistedProviderConfigPreference(): ProviderConfigPreference {
  if (!hasStorage()) {
    return getDefaultPreference();
  }

  const rawValue = window.localStorage.getItem(PROVIDER_CONFIG_STORAGE_KEY);

  if (!rawValue) {
    return getDefaultPreference();
  }

  try {
    const parsed = JSON.parse(rawValue) as Partial<ProviderConfigPreference>;

    if (parsed.remember !== true) {
      return getDefaultPreference();
    }

    return {
      remember: true,
      config: sanitizeConfig(parsed.config),
    };
  } catch {
    return getDefaultPreference();
  }
}

export function persistProviderConfigPreference(preference: ProviderConfigPreference) {
  if (!hasStorage()) {
    return;
  }

  if (!preference.remember) {
    clearPersistedProviderConfig();
    return;
  }

  window.localStorage.setItem(
    PROVIDER_CONFIG_STORAGE_KEY,
    JSON.stringify({
      remember: true,
      config: sanitizeConfig(preference.config),
    } satisfies ProviderConfigPreference)
  );
}

export function clearPersistedProviderConfig() {
  if (!hasStorage()) {
    return;
  }

  window.localStorage.removeItem(PROVIDER_CONFIG_STORAGE_KEY);
}
