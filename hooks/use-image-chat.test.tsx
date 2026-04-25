import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useImageChat } from "@/hooks/use-image-chat";

const clientMocks = vi.hoisted(() => ({
  createImageGenerationTask: vi.fn(),
  fetchImageChatPublicKey: vi.fn(),
}));

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
    createImageGenerationTask: clientMocks.createImageGenerationTask,
    fetchImageChatPublicKey: clientMocks.fetchImageChatPublicKey,
  };
});

describe("useImageChat hydration", () => {
  beforeEach(() => {
    window.localStorage.clear();
    clientMocks.createImageGenerationTask.mockReset();
    clientMocks.createImageGenerationTask.mockResolvedValue({
      taskId: "task-1",
      status: "queued",
      createdAt: "2026-04-26T08:00:00.000Z",
    });
    clientMocks.fetchImageChatPublicKey.mockReset();
    clientMocks.fetchImageChatPublicKey.mockResolvedValue({
      keyId: "test-key",
      algorithm: "RSA-OAEP-256+A256GCM" as const,
      publicKey: "-----BEGIN PUBLIC KEY-----\ntest\n-----END PUBLIC KEY-----",
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
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

  it("clears composer reference images after submitting a referenced prompt", async () => {
    const user = userEvent.setup();

    class ImageMock {
      naturalWidth = 1024;
      naturalHeight = 1024;
      width = 1024;
      height = 1024;
      onload: (() => void) | null = null;

      set src(_value: string) {
        queueMicrotask(() => {
          this.onload?.();
        });
      }
    }

    vi.stubGlobal("Image", ImageMock);
    Object.defineProperty(window.URL, "createObjectURL", {
      configurable: true,
      value: vi.fn(() => "blob:reference-image"),
    });
    Object.defineProperty(window.URL, "revokeObjectURL", {
      configurable: true,
      value: vi.fn(),
    });

    function SubmitProbe() {
      const {
        addReferenceImageFiles,
        connectionConfig,
        isBootstrapping,
        publicKeyStatus,
        selectedReferenceImages,
        submitPrompt,
        updateConnectionConfig,
      } = useImageChat();

      return (
        <div>
          <span data-testid="status">{publicKeyStatus}</span>
          <span data-testid="bootstrapping">{String(isBootstrapping)}</span>
          <span data-testid="api-key">{connectionConfig.apiKey}</span>
          <span data-testid="reference-count">
            {selectedReferenceImages.length}
          </span>
          <button
            type="button"
            onClick={() =>
              updateConnectionConfig({
                apiKey: "sk-test",
                baseUrl: "https://provider.example/v1",
                model: "gpt-image-2",
              })
            }
          >
            配置服务
          </button>
          <button
            type="button"
            onClick={() =>
              void addReferenceImageFiles([
                new File(["reference"], "reference.png", {
                  type: "image/png",
                }),
              ])
            }
          >
            添加参考图
          </button>
          <button
            type="button"
            onClick={() => void submitPrompt("基于参考图生成机械猫")}
          >
            提交提示词
          </button>
        </div>
      );
    }

    render(<SubmitProbe />);

    await waitFor(() => {
      expect(screen.getByTestId("status")).toHaveTextContent("ready");
      expect(screen.getByTestId("bootstrapping")).toHaveTextContent("false");
    });

    await user.click(screen.getByRole("button", { name: "配置服务" }));

    await waitFor(() => {
      expect(screen.getByTestId("api-key")).toHaveTextContent("sk-test");
    });

    await user.click(screen.getByRole("button", { name: "添加参考图" }));

    await waitFor(() => {
      expect(screen.getByTestId("reference-count")).toHaveTextContent("1");
    });

    await user.click(screen.getByRole("button", { name: "提交提示词" }));

    await waitFor(() => {
      expect(screen.getByTestId("reference-count")).toHaveTextContent("0");
    });
    expect(clientMocks.createImageGenerationTask).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: "基于参考图生成机械猫",
        referenceImages: [
          {
            b64: "cmVmZXJlbmNl",
            mimeType: "image/png",
          },
        ],
      }),
      expect.objectContaining({
        apiKey: "sk-test",
      }),
      expect.any(Object)
    );
  });
});
