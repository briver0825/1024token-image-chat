import { render, screen, waitFor } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useImageChat } from "@/hooks/use-image-chat";

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

vi.mock("@/lib/image-chat/client", async () => {
  const actual = await vi.importActual<typeof import("@/lib/image-chat/client")>(
    "@/lib/image-chat/client"
  );

  return {
    ...actual,
    fetchImageChatPublicKey: vi.fn(async () => ({
      keyId: "test-key",
      algorithm: "RSA-OAEP-256+A256GCM" as const,
      publicKey: "-----BEGIN PUBLIC KEY-----\ntest\n-----END PUBLIC KEY-----",
    })),
  };
});

describe("useImageChat hydration", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("renders SSR-safe defaults before applying persisted browser preferences", async () => {
    window.localStorage.setItem(
      "image-chat.provider-config.preference",
      JSON.stringify({
        remember: true,
        config: {
          apiKey: "sk-local",
          baseUrl: "https://example.com/v1",
          model: "gpt-image-1",
        },
      })
    );

    function PreferenceProbe() {
      const { connectionConfig, rememberProviderConfig } = useImageChat();

      return (
        <div>
          <span data-testid="model">{connectionConfig.model}</span>
          <span data-testid="remember">{String(rememberProviderConfig)}</span>
        </div>
      );
    }

    const serverMarkup = renderToString(<PreferenceProbe />);

    expect(serverMarkup).toContain("gpt-image-2");
    expect(serverMarkup).toContain("false");

    render(<PreferenceProbe />);

    await waitFor(() => {
      expect(screen.getByTestId("model")).toHaveTextContent("gpt-image-1");
      expect(screen.getByTestId("remember")).toHaveTextContent("true");
    });
  });
});
