import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import {
  DEFAULT_GENERATION_SETTINGS,
  ParamsPanel,
} from "@/components/chat/params-panel";
import { normalizeGenerationSettings } from "@/lib/image-chat/generation-settings";

describe("ParamsPanel", () => {
  it("updates image format and resolution", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(
      <ParamsPanel
        value={DEFAULT_GENERATION_SETTINGS}
        onChange={onChange}
      />
    );

    await user.click(screen.getByRole("radio", { name: "2K" }));

    expect(onChange).toHaveBeenCalledWith(
      normalizeGenerationSettings({
        ...DEFAULT_GENERATION_SETTINGS,
        resolution: "2k",
      })
    );

    await user.click(screen.getByRole("combobox", { name: "图片格式" }));
    await user.click(screen.getByRole("option", { name: "WebP" }));

    expect(onChange).toHaveBeenLastCalledWith(
      normalizeGenerationSettings({
        ...DEFAULT_GENERATION_SETTINGS,
        outputFormat: "webp",
      })
    );
  });

  it("allows selecting common aspect ratios without exposing pixel sizes", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(
      <ParamsPanel
        value={DEFAULT_GENERATION_SETTINGS}
        onChange={onChange}
      />
    );

    expect(screen.queryByRole("combobox", { name: "图片尺寸" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("压缩率")).not.toBeInTheDocument();

    await user.click(screen.getByRole("radio", { name: "16:9" }));

    expect(onChange).toHaveBeenLastCalledWith(
      normalizeGenerationSettings({
        ...DEFAULT_GENERATION_SETTINGS,
        aspectRatio: "16:9",
      })
    );

    await user.click(screen.getByRole("radio", { name: "9:16" }));

    expect(onChange).toHaveBeenLastCalledWith(
      normalizeGenerationSettings({
        ...DEFAULT_GENERATION_SETTINGS,
        aspectRatio: "9:16",
      })
    );
  });
});
