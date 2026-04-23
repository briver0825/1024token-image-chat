import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ProviderConfigCard } from "@/components/chat/provider-config-card";

describe("ProviderConfigCard", () => {
  it("updates api key, base url, model selection and remember preference", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const onRememberConfigChange = vi.fn();

    render(
      <ProviderConfigCard
        value={{
          apiKey: "",
          baseUrl: "",
          model: "gpt-image-2",
        }}
        rememberConfig={false}
        publicKeyStatus="ready"
        onChange={onChange}
        onRememberConfigChange={onRememberConfigChange}
      />
    );

    await user.type(screen.getByLabelText("API Key"), "sk-user");
    await user.type(screen.getByLabelText("Base URL"), "https://demo.example/v1");
    await user.click(screen.getByRole("combobox", { name: "模型选择" }));
    await user.click(screen.getByRole("option", { name: "自定义模型" }));
    await user.clear(screen.getByLabelText("模型"));
    await user.type(screen.getByLabelText("模型"), "my-image-model");
    await user.click(screen.getByRole("switch", { name: "记住此设备上的调用配置" }));

    expect(onChange).toHaveBeenCalled();
    expect(onRememberConfigChange).toHaveBeenCalledWith(true);
    expect(
      screen.getByText(/仅保存在当前页面内存中/)
    ).toBeInTheDocument();
  });
});
