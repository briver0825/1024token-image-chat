import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ChatComposer } from "@/components/chat/chat-composer";

describe("ChatComposer", () => {
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
});
