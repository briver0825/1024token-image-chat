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

  it("allows selecting 4K landscape and portrait sizes", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(
      <ParamsPanel
        value={DEFAULT_GENERATION_SETTINGS}
        onChange={onChange}
      />
    );

    await user.click(screen.getByRole("combobox", { name: "图片尺寸" }));
    await user.click(screen.getByRole("option", { name: "3840 × 2160" }));

    expect(onChange).toHaveBeenLastCalledWith({
      ...DEFAULT_GENERATION_SETTINGS,
      size: "3840x2160",
    });

    await user.click(screen.getByRole("combobox", { name: "图片尺寸" }));
    await user.click(screen.getByRole("option", { name: "2160 × 3840" }));

    expect(onChange).toHaveBeenLastCalledWith({
      ...DEFAULT_GENERATION_SETTINGS,
      size: "2160x3840",
    });
  });
});
