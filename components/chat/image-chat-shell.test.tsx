import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { MARKET_DRAFT_STORAGE_KEY } from "@/lib/image-chat/market-draft";

const useImageChatState = vi.hoisted(() => ({
  value: {
    conversations: [],
    activeConversationId: null,
    activeConversation: null,
    renderedMessages: [],
    galleryImages: new Array(18).fill(null).map((_, index) => ({
      id: `gallery-${index}`,
      messageId: `message-${index}`,
      conversationId: `conversation-${index}`,
      conversationTitle: `会话 ${index}`,
      prompt: `图片 ${index}`,
      createdAt: "2026-04-24T00:00:00.000Z",
      settings: {
        size: "1024x1024",
        quality: "high",
        outputFormat: "png",
      },
      image: {
        src: `data:image/png;base64,${index}`,
        mimeType: "image/png",
        width: 1024,
        height: 1024,
      },
    })),
    selectedReferenceImage: null,
    selectedReferenceImages: [],
    settings: {
      size: "1024x1024",
      quality: "high",
      outputFormat: "png",
    },
    connectionConfig: {
      apiKey: "",
      baseUrl: "",
      model: "gpt-image-1",
    },
    rememberProviderConfig: false,
    publicKeyStatus: "ready",
    canSubmit: true,
    isBootstrapping: false,
    isSubmitting: false,
    updateSettings: vi.fn(),
    updateConnectionConfig: vi.fn(),
    updateRememberProviderConfig: vi.fn(),
    startNewConversation: vi.fn(),
    selectConversation: vi.fn(),
    deleteConversation: vi.fn(),
    toggleConversationPinned: vi.fn(),
    clearReferenceImage: vi.fn(),
    removeReferenceImage: vi.fn(),
    addReferenceImageFiles: vi.fn(),
    submitPrompt: vi.fn(),
    copyPrompt: vi.fn(),
    downloadImage: vi.fn(),
    regenerateMessage: vi.fn(),
    publishMessageToMarket: vi.fn(),
    useReferenceImage: vi.fn(),
  },
}));

const chatComposerState = vi.hoisted(() => ({
  lastProps: null as null | Record<string, unknown>,
}));

vi.mock("@/hooks/use-image-chat", () => ({
  useImageChat: () => useImageChatState.value,
}));

vi.mock("@/components/chat/chat-composer", () => ({
  ChatComposer: (props: Record<string, unknown>) => {
    chatComposerState.lastProps = props;

    return <div data-testid="chat-composer" />;
  },
}));

vi.mock("@/components/chat/conversation-list-item", () => ({
  ConversationListItem: () => <div data-testid="conversation-list-item" />,
}));

vi.mock("@/components/chat/image-gallery-dialog", () => ({
  ImageGalleryDialog: () => null,
}));

vi.mock("@/components/chat/image-message-card", () => ({
  ImageMessageCard: () => <div data-testid="image-message-card" />,
}));

vi.mock("@/components/chat/params-panel", () => ({
  ParamsPanel: () => <div data-testid="params-panel" />,
}));

vi.mock("@/components/chat/provider-config-card", () => ({
  ProviderConfigCard: () => <div data-testid="provider-config-card" />,
}));

import { ImageChatShell } from "@/components/chat/image-chat-shell";

describe("ImageChatShell", () => {
  beforeEach(() => {
    window.localStorage.clear();
    useImageChatState.value.activeConversationId = null;
    useImageChatState.value.activeConversation = null;
    useImageChatState.value.renderedMessages = [];
    useImageChatState.value.isBootstrapping = false;
    useImageChatState.value.updateSettings.mockClear();
    useImageChatState.value.startNewConversation.mockClear();
    chatComposerState.lastProps = null;
  });

  it("uses a stacked mobile header layout so the title does not collapse vertically", () => {
    render(<ImageChatShell />);

    const heading = screen.getByRole("heading", { name: "聊天生图工作台" });
    const headerInner = heading.closest("div")?.parentElement?.parentElement;
    const modelLabel = screen.getByText("gpt-image-1");
    const actionsRow = screen
      .getByRole("button", { name: /图片库/i })
      .parentElement;

    expect(headerInner).toHaveClass("flex-col");
    expect(headerInner).toHaveClass("sm:flex-row");
    expect(actionsRow).toHaveClass("flex-wrap");
    expect(modelLabel).toHaveClass("truncate");
    expect(modelLabel).toHaveClass("whitespace-nowrap");
    expect(screen.getAllByRole("link", { name: /焚决市场/i })).toHaveLength(2);
  });

  it("consumes a market draft into the composer and applies its generation settings", async () => {
    window.localStorage.setItem(
      MARKET_DRAFT_STORAGE_KEY,
      JSON.stringify({
        prompt: "来自焚决市场的提示词",
        settings: {
          size: "1536x1024",
          quality: "medium",
          outputFormat: "webp",
        },
        sourceMarketItemId: "market-1",
        model: "gpt-image-2",
        createdAt: "2026-04-26T08:00:00.000Z",
      })
    );

    render(<ImageChatShell />);

    await waitFor(() => {
      expect(chatComposerState.lastProps).toMatchObject({
        draftPrompt: "来自焚决市场的提示词",
        draftPromptKey: "market-1",
      });
    });
    expect(useImageChatState.value.updateSettings).toHaveBeenCalledWith({
      size: "1536x1024",
      quality: "medium",
      outputFormat: "webp",
    });
    expect(useImageChatState.value.startNewConversation).toHaveBeenCalledTimes(1);
    expect(window.localStorage.getItem(MARKET_DRAFT_STORAGE_KEY)).toBeNull();
  });

  it("scrolls to the latest message when an existing conversation is rendered", async () => {
    const scrollIntoView = vi.fn();

    Object.defineProperty(window.HTMLElement.prototype, "scrollIntoView", {
      value: scrollIntoView,
      configurable: true,
    });
    useImageChatState.value.activeConversationId = "conversation-1";
    useImageChatState.value.activeConversation = {
      conversation: {
        id: "conversation-1",
        title: "已有会话",
        createdAt: "2026-04-26T08:00:00.000Z",
        updatedAt: "2026-04-26T08:01:00.000Z",
        messageCount: 2,
      },
      messages: [],
      assets: [],
    };
    useImageChatState.value.renderedMessages = [
      {
        id: "message-user-1",
        role: "user",
        prompt: "第一条提示词",
        createdAt: "2026-04-26T08:00:00.000Z",
      },
      {
        id: "message-assistant-1",
        role: "assistant",
        prompt: "第一条提示词",
        createdAt: "2026-04-26T08:01:00.000Z",
        status: "completed",
        settings: {
          size: "1024x1024",
          quality: "high",
          outputFormat: "png",
        },
        image: {
          src: "data:image/png;base64,latest",
          mimeType: "image/png",
          width: 1024,
          height: 1024,
        },
      },
    ];

    render(<ImageChatShell />);

    await waitFor(() => {
      expect(scrollIntoView).toHaveBeenCalledWith({
        behavior: "auto",
        block: "end",
      });
    });
  });
});
