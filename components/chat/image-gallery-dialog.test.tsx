import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

const galleryLightboxState = vi.hoisted(() => ({
  lastProps: null as null | Record<string, unknown>,
}));

vi.mock("yet-another-react-lightbox", () => ({
  default: (props: Record<string, unknown>) => {
    galleryLightboxState.lastProps = props;

    return props.open ? (
      <div data-testid="gallery-lightbox">gallery-lightbox-open</div>
    ) : null;
  },
}));

import { ImageGalleryDialog } from "@/components/chat/image-gallery-dialog";

describe("ImageGalleryDialog", () => {
  it("renders empty state when there are no generated images", () => {
    render(
      <ImageGalleryDialog
        open
        items={[]}
        onOpenChange={vi.fn()}
        onDownload={vi.fn()}
        onJumpToConversation={vi.fn()}
      />
    );

    expect(screen.getByText("还没有成功生成的图片")).toBeInTheDocument();
  });

  it("renders a dedicated close button instead of the default overlapping corner button", () => {
    render(
      <ImageGalleryDialog
        open
        items={[]}
        onOpenChange={vi.fn()}
        onDownload={vi.fn()}
        onJumpToConversation={vi.fn()}
      />
    );

    expect(
      screen.getByRole("button", { name: "关闭图片总览" })
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Close" })).not.toBeInTheDocument();
  });

  it("opens gallery preview from thumbnail", async () => {
    const user = userEvent.setup();

    render(
      <ImageGalleryDialog
        open
        items={[
          {
            id: "asset-1",
            messageId: "assistant-1",
            conversationId: "conv-1",
            conversationTitle: "城市海报",
            prompt: "赛博朋克城市",
            createdAt: "2026-04-24T10:00:00.000Z",
            image: {
              src: "data:image/png;base64,ZmFrZS1pbWFnZQ==",
              mimeType: "image/png",
              width: 1024,
              height: 1024,
            },
          },
        ]}
        onOpenChange={vi.fn()}
        onDownload={vi.fn()}
        onJumpToConversation={vi.fn()}
      />
    );

    await user.click(screen.getByRole("button", { name: "预览图片 城市海报" }));

    expect(screen.getByTestId("gallery-lightbox")).toBeInTheDocument();
    expect(galleryLightboxState.lastProps?.plugins).toHaveLength(1);
    expect(galleryLightboxState.lastProps?.zoom).toMatchObject({
      scrollToZoom: true,
    });
    expect(galleryLightboxState.lastProps?.render).not.toMatchObject({
      slideFooter: expect.any(Function),
    });
  });

  it("supports jumping from an image card to the chat conversation", async () => {
    const user = userEvent.setup();
    const onJumpToConversation = vi.fn();

    render(
      <ImageGalleryDialog
        open
        items={[
          {
            id: "asset-2",
            messageId: "assistant-2",
            conversationId: "conv-2",
            conversationTitle: "旅拍参考",
            prompt: "湖边木屋",
            createdAt: "2026-04-24T11:00:00.000Z",
            image: {
              src: "data:image/png;base64,ZmFrZS1pbWFnZQ==",
              mimeType: "image/png",
              width: 1536,
              height: 1024,
            },
          },
        ]}
        onOpenChange={vi.fn()}
        onDownload={vi.fn()}
        onJumpToConversation={onJumpToConversation}
      />
    );

    await user.click(screen.getByRole("button", { name: "前往会话" }));

    expect(onJumpToConversation).toHaveBeenCalledWith("conv-2", "assistant-2");
  });

  it("supports switching to a deduplicated gallery view", async () => {
    render(
      <ImageGalleryDialog
        open
        items={[
          {
            id: "asset-1",
            messageId: "assistant-1",
            conversationId: "conv-1",
            conversationTitle: "会话一",
            prompt: "重复图片 1",
            createdAt: "2026-04-24T09:00:00.000Z",
            contentHash: "sha256:same",
            image: {
              src: "data:image/png;base64,ZmFrZS1pbWFnZQ==",
              mimeType: "image/png",
              width: 1024,
              height: 1024,
            },
          },
          {
            id: "asset-2",
            messageId: "assistant-2",
            conversationId: "conv-2",
            conversationTitle: "会话二",
            prompt: "重复图片 2",
            createdAt: "2026-04-24T10:00:00.000Z",
            contentHash: "sha256:same",
            image: {
              src: "data:image/png;base64,ZmFrZS1pbWFnZQ==",
              mimeType: "image/png",
              width: 1024,
              height: 1024,
            },
          },
          {
            id: "asset-3",
            messageId: "assistant-3",
            conversationId: "conv-3",
            conversationTitle: "会话三",
            prompt: "唯一图片",
            createdAt: "2026-04-24T11:00:00.000Z",
            contentHash: "sha256:unique",
            image: {
              src: "data:image/png;base64,ZmFrZS1pbWFnZQ==",
              mimeType: "image/png",
              width: 1536,
              height: 1024,
            },
          },
        ]}
        onOpenChange={vi.fn()}
        onDownload={vi.fn()}
        onJumpToConversation={vi.fn()}
      />
    );

    expect(screen.getAllByRole("button", { name: /预览图片/ })).toHaveLength(2);
    expect(screen.queryByText("重复图片 1")).not.toBeInTheDocument();
    expect(screen.getByText("重复图片 2")).toBeInTheDocument();
    expect(screen.getByText("唯一图片")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /全部/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /去重/ })).not.toBeInTheDocument();
  });
});
