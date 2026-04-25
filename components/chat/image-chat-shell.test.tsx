import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

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
    useReferenceImage: vi.fn(),
  },
}));

vi.mock("@/hooks/use-image-chat", () => ({
  useImageChat: () => useImageChatState.value,
}));

vi.mock("@/components/chat/chat-composer", () => ({
  ChatComposer: () => <div data-testid="chat-composer" />,
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
  });
});
