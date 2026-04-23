import { describe, expect, it } from "vitest";

import {
  clearPersistedProviderConfig,
  loadPersistedProviderConfigPreference,
  persistProviderConfigPreference,
} from "@/lib/image-chat/provider-config-persistence";

describe("provider-config-persistence", () => {
  it("defaults to remember disabled with empty config", () => {
    expect(loadPersistedProviderConfigPreference()).toEqual({
      remember: false,
      config: {
        apiKey: "",
        baseUrl: "",
        model: "gpt-image-2",
      },
    });
  });

  it("persists config only when remember is enabled", () => {
    persistProviderConfigPreference({
      remember: true,
      config: {
        apiKey: "sk-local",
        baseUrl: "https://example.com/v1",
        model: "gpt-image-2",
      },
    });

    expect(loadPersistedProviderConfigPreference()).toEqual({
      remember: true,
      config: {
        apiKey: "sk-local",
        baseUrl: "https://example.com/v1",
        model: "gpt-image-2",
      },
    });
  });

  it("clears persisted config", () => {
    persistProviderConfigPreference({
      remember: true,
      config: {
        apiKey: "sk-local",
        baseUrl: "https://example.com/v1",
        model: "gpt-image-2",
      },
    });

    clearPersistedProviderConfig();

    expect(loadPersistedProviderConfigPreference()).toEqual({
      remember: false,
      config: {
        apiKey: "",
        baseUrl: "",
        model: "gpt-image-2",
      },
    });
  });
});
