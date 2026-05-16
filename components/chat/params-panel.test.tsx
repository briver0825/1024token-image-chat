import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import {
  DEFAULT_GENERATION_SETTINGS,
  ParamsPanel,
} from "@/components/chat/params-panel";

describe("ParamsPanel", () => {
  it("updates image format and quality", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(
      <ParamsPanel
        value={DEFAULT_GENERATION_SETTINGS}
        onChange={onChange}
      />
    );

    await user.click(screen.getByRole("combobox", { name: "图片格式" }));
    await user.click(screen.getByRole("option", { name: "WebP" }));

    expect(onChange).toHaveBeenCalledWith({
      ...DEFAULT_GENERATION_SETTINGS,
      outputFormat: "webp",
    });
  });
});
