import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ChatComposer } from "@/components/chat/chat-composer";

describe("ChatComposer", () => {
  it("loads a market draft prompt and submits the edited prompt", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();

    render(
      <ChatComposer
        isSubmitting={false}
        draftPrompt="来自焚决市场的提示词"
        draftPromptKey="market-item-1"
        onSubmit={onSubmit}
      />
    );

    const promptInput = screen.getByPlaceholderText("描述你想生成的画面...");

    await waitFor(() => {
      expect(promptInput).toHaveValue("来自焚决市场的提示词");
    });

    await user.type(promptInput, "，增加电影感");
    await user.click(screen.getByRole("button", { name: "发送生成" }));

    expect(onSubmit).toHaveBeenCalledWith("来自焚决市场的提示词，增加电影感");
  });

  it("renders selected reference images and allows removing or clearing them", async () => {
    const user = userEvent.setup();
    const onRemoveReference = vi.fn();
    const onClearReferences = vi.fn();

    render(
      <ChatComposer
        isSubmitting={false}
        onSubmit={vi.fn()}
        referenceImages={[
          {
            id: "ref-1",
            prompt: "夜色里的机械猫",
            image: {
              src: "data:image/png;base64,cmVmZXJlbmNl",
              mimeType: "image/png",
              width: 1024,
              height: 1024,
            },
          },
          {
            id: "ref-2",
            prompt: "雨夜玻璃橱窗",
            image: {
              src: "data:image/png;base64,cmVmZXJlbmNlMg==",
              mimeType: "image/png",
              width: 1536,
              height: 1024,
            },
          },
        ]}
        onRemoveReference={onRemoveReference}
        onClearReferences={onClearReferences}
      />
    );

    expect(screen.getByText("参考图 2 / 16")).toBeInTheDocument();
    expect(screen.getByText("夜色里的机械猫")).toBeInTheDocument();
    expect(screen.getByText("雨夜玻璃橱窗")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "移除参考图 1" }));
    await user.click(screen.getByRole("button", { name: "清空参考图" }));

    expect(onRemoveReference).toHaveBeenCalledWith("ref-1");
    expect(onClearReferences).toHaveBeenCalledTimes(1);
  });

  it("uploads multiple local reference images", async () => {
    const user = userEvent.setup();
    const onUploadReferenceImages = vi.fn();
    const files = [
      new File(["first"], "first.png", { type: "image/png" }),
      new File(["second"], "second.webp", { type: "image/webp" }),
    ];

    render(
      <ChatComposer
        isSubmitting={false}
        onSubmit={vi.fn()}
        referenceImages={[]}
        onUploadReferenceImages={onUploadReferenceImages}
      />
    );

    await user.upload(screen.getByLabelText("上传参考图"), files);

    expect(onUploadReferenceImages).toHaveBeenCalledWith(files);
  });

  it("uses a mobile-friendly footer layout for action buttons and helper text", () => {
    const { container } = render(
      <ChatComposer
        isSubmitting={false}
        onSubmit={vi.fn()}
        referenceImages={[]}
        onUploadReferenceImages={vi.fn()}
      />
    );

    const helperText = screen.getByText(/支持中文自然语言提示词/);
    const footer = helperText.parentElement;
    const actions = screen.getByRole("button", { name: "发送生成" }).parentElement;

    expect(footer).toHaveClass("flex-col-reverse");
    expect(footer).toHaveClass("lg:flex-row");
    expect(helperText).toHaveClass("w-full");
    expect(helperText).toHaveClass("text-xs");
    expect(actions).toHaveClass("grid");
    expect(actions).toHaveClass("grid-cols-2");
    expect(container.querySelector("label[for]")).toHaveClass("w-full");
  });

  it("keeps footer actions in one horizontal row on desktop", () => {
    const { container } = render(
      <ChatComposer
        isSubmitting={false}
        onSubmit={vi.fn()}
        referenceImages={[]}
        onUploadReferenceImages={vi.fn()}
      />
    );

    const helperText = screen.getByText(/支持中文自然语言提示词/);
    const footer = helperText.parentElement;
    const actions = screen.getByRole("button", { name: "发送生成" }).parentElement;
    const uploadLabel = container.querySelector("label[for]");

    expect(footer).toHaveClass("lg:flex-row");
    expect(footer).toHaveClass("lg:items-center");
    expect(actions).toHaveClass("lg:flex");
    expect(actions).toHaveClass("lg:flex-nowrap");
    expect(actions).toHaveClass("lg:w-auto");
    expect(uploadLabel).toHaveClass("lg:w-auto");
  });
});
