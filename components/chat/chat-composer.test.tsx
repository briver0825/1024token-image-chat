import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ChatComposer } from "@/components/chat/chat-composer";

describe("ChatComposer", () => {
  it("renders the selected reference image and allows clearing it", async () => {
    const user = userEvent.setup();
    const onClearReference = vi.fn();

    render(
      <ChatComposer
        isSubmitting={false}
        onSubmit={vi.fn()}
        referenceImage={{
          prompt: "夜色里的机械猫",
          image: {
            src: "data:image/png;base64,cmVmZXJlbmNl",
            mimeType: "image/png",
            width: 1024,
            height: 1024,
          },
        }}
        onClearReference={onClearReference}
      />
    );

    expect(screen.getByText("当前参考图")).toBeInTheDocument();
    expect(screen.getByText("夜色里的机械猫")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "移除参考图" }));

    expect(onClearReference).toHaveBeenCalledTimes(1);
  });
});
