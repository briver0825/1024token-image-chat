import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { isValidElement, type ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";

const lightboxState = vi.hoisted(() => ({
  lastProps: null as null | Record<string, unknown>,
}));

type LightboxToolbarButtonElement = ReactElement<{ label: string }>;

function isLightboxToolbarButtonElement(
  button: unknown
): button is LightboxToolbarButtonElement {
  return isValidElement<{ label?: unknown }>(button) && typeof button.props.label === "string";
}

vi.mock("yet-another-react-lightbox", () => ({
  default: (props: Record<string, unknown>) => {
    lightboxState.lastProps = props;

    return props.open ? <div data-testid="lightbox-root">lightbox-open</div> : null;
  },
}));

import { ImageMessageCard } from "@/components/chat/image-message-card";

describe("ImageMessageCard", () => {
  it("renders image actions and forwards callbacks", async () => {
    const user = userEvent.setup();
    const onCopyPrompt = vi.fn();
    const onDownload = vi.fn();
    const onRegenerate = vi.fn();
    const onUseAsReference = vi.fn();
    const onPublishToMarket = vi.fn();

    render(
      <ImageMessageCard
        message={{
          id: "assistant-1",
          prompt: "一只会发光的机械猫",
          createdAt: "2026-04-23T12:00:00.000Z",
          status: "completed",
          image: {
            src: "data:image/png;base64,ZmFrZS1pbWFnZQ==",
            mimeType: "image/png",
            width: 1024,
            height: 1024,
          },
        }}
        onCopyPrompt={onCopyPrompt}
        onDownload={onDownload}
        onRegenerate={onRegenerate}
        onUseAsReference={onUseAsReference}
        onPublishToMarket={onPublishToMarket}
      />
    );

    expect(screen.getByAltText("生成结果预览")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "复制提示词" }));
    await user.click(screen.getByRole("button", { name: "下载图片" }));
    await user.click(screen.getByRole("button", { name: "设为参考图" }));
    await user.click(screen.getByRole("button", { name: "提交市场" }));
    await user.click(screen.getByRole("button", { name: "重新生成" }));

    expect(onCopyPrompt).toHaveBeenCalledWith("assistant-1");
    expect(onDownload).toHaveBeenCalledWith("assistant-1");
    expect(onUseAsReference).toHaveBeenCalledWith("assistant-1");
    expect(onPublishToMarket).toHaveBeenCalledWith("assistant-1");
    expect(onRegenerate).toHaveBeenCalledWith("assistant-1");
  });

  it("opens preview in lightbox from thumbnail", async () => {
    const user = userEvent.setup();

    render(
      <ImageMessageCard
        message={{
          id: "assistant-2",
          prompt: "夜色中的未来城市",
          createdAt: "2026-04-23T12:00:00.000Z",
          status: "completed",
          image: {
            src: "data:image/png;base64,ZmFrZS1pbWFnZQ==",
            mimeType: "image/png",
            width: 1024,
            height: 1024,
          },
        }}
        onCopyPrompt={vi.fn()}
        onDownload={vi.fn()}
        onRegenerate={vi.fn()}
        onUseAsReference={vi.fn()}
      />
    );

    await user.click(screen.getByRole("button", { name: "打开图片预览" }));

    expect(screen.getByTestId("lightbox-root")).toBeInTheDocument();
    expect(lightboxState.lastProps?.plugins).toHaveLength(1);
    expect(lightboxState.lastProps?.zoom).toMatchObject({
      scrollToZoom: true,
    });
    expect(lightboxState.lastProps?.render).not.toMatchObject({
      slideFooter: expect.any(Function),
    });

    const toolbarButtons = (
      lightboxState.lastProps?.toolbar as
        | { buttons?: Array<unknown> }
        | undefined
    )?.buttons;
    const customButtonLabels =
      toolbarButtons
        ?.filter(isLightboxToolbarButtonElement)
        .map((button) => button.props.label) ?? [];

    expect(customButtonLabels).not.toContain("重新生成");
  });

  it("renders thumbnail with capped height while preserving its original aspect ratio", () => {
    render(
      <ImageMessageCard
        message={{
          id: "assistant-3",
          prompt: "竖版海报风格的人像",
          createdAt: "2026-04-23T12:00:00.000Z",
          status: "completed",
          image: {
            src: "data:image/png;base64,ZmFrZS1pbWFnZQ==",
            mimeType: "image/png",
            width: 1024,
            height: 1536,
          },
        }}
        onCopyPrompt={vi.fn()}
        onDownload={vi.fn()}
        onRegenerate={vi.fn()}
        onUseAsReference={vi.fn()}
      />
    );

    const thumbnail = screen.getByAltText("生成结果预览");

    expect(thumbnail).toHaveClass("w-auto");
    expect(thumbnail).toHaveClass("max-w-full");
    expect(thumbnail).toHaveClass("object-contain");
    expect(thumbnail).not.toHaveClass("w-full");
  });

  it("sizes completed message card by content instead of forcing full width", () => {
    const { container } = render(
      <ImageMessageCard
        message={{
          id: "assistant-4",
          prompt: "横版电影海报",
          createdAt: "2026-04-23T12:00:00.000Z",
          status: "completed",
          image: {
            src: "data:image/png;base64,ZmFrZS1pbWFnZQ==",
            mimeType: "image/png",
            width: 1536,
            height: 1024,
          },
        }}
        onCopyPrompt={vi.fn()}
        onDownload={vi.fn()}
        onRegenerate={vi.fn()}
        onUseAsReference={vi.fn()}
      />
    );

    const card = container.querySelector('[data-slot="card"]');

    expect(card).toHaveClass("w-fit");
    expect(card).toHaveClass("max-w-full");
    expect(card).not.toHaveClass("w-full");
  });

  it("shows the reference image summary when this result was generated from another image", () => {
    render(
      <ImageMessageCard
        message={{
          id: "assistant-5",
          prompt: "把它改成红色机甲版本",
          createdAt: "2026-04-23T12:00:00.000Z",
          status: "completed",
          image: {
            src: "data:image/png;base64,ZmFrZS1pbWFnZQ==",
            mimeType: "image/png",
            width: 1024,
            height: 1024,
          },
          referenceImage: {
            src: "data:image/png;base64,cmVmZXJlbmNl",
            mimeType: "image/png",
            width: 1024,
            height: 1024,
          },
        }}
        onCopyPrompt={vi.fn()}
        onDownload={vi.fn()}
        onRegenerate={vi.fn()}
        onUseAsReference={vi.fn()}
      />
    );

    expect(screen.getByText("参考图续画")).toBeInTheDocument();
    expect(screen.getByText("本次生成会参考这张图继续延展。")).toBeInTheDocument();
  });

  it("shows long generation errors without line clamping", () => {
    const longErrorMessage = [
      "Provider returned validation details.",
      "request_id=req_long_error",
      "upstream trace ".repeat(120),
      "final actionable detail",
    ].join("\n");

    render(
      <ImageMessageCard
        message={{
          id: "assistant-failed",
          prompt: "生成失败的提示词",
          createdAt: "2026-04-23T12:00:00.000Z",
          status: "failed",
          errorMessage: longErrorMessage,
        }}
        onCopyPrompt={vi.fn()}
        onDownload={vi.fn()}
        onRegenerate={vi.fn()}
        onUseAsReference={vi.fn()}
      />
    );

    const errorMessage = screen
      .getByText((content) => content.includes("request_id=req_long_error"))
      .closest('[data-slot="alert-description"]');

    expect(errorMessage).not.toBeNull();
    expect(errorMessage!).toHaveTextContent("final actionable detail");
    expect(errorMessage!).toHaveClass("max-h-72");
    expect(errorMessage!).toHaveClass("overflow-auto");
    expect(errorMessage!).toHaveClass("whitespace-pre-wrap");
    expect(errorMessage!).not.toHaveClass("line-clamp-1");
    expect(errorMessage!).not.toHaveClass("line-clamp-2");
    expect(errorMessage!).not.toHaveClass("line-clamp-3");
  });
});
