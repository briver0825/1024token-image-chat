import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MARKET_DRAFT_STORAGE_KEY } from "@/lib/image-chat/market-draft";
import type { MarketItemResponse } from "@/lib/image-chat/types";

const lightboxState = vi.hoisted(() => ({
  lastProps: null as null | Record<string, unknown>,
}));

const routerState = vi.hoisted(() => ({
  push: vi.fn(),
}));

vi.mock("yet-another-react-lightbox", () => ({
  default: (props: Record<string, unknown>) => {
    lightboxState.lastProps = props;

    return props.open ? <div data-testid="market-lightbox">lightbox-open</div> : null;
  },
}));

vi.mock("yet-another-react-lightbox/plugins/zoom", () => ({
  default: {},
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: routerState.push,
  }),
}));

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

import { MarketPageClient } from "@/components/chat/market-page-client";

const marketItem = {
  id: "market-1",
  prompt: "霓虹雨夜中的机械猫",
  settings: {
    size: "1024x1024",
    quality: "high",
    outputFormat: "png",
  },
  model: "gpt-image-2",
  image: {
    url: "/api/image-chat/market/market-1/image",
    mimeType: "image/png",
    width: 1024,
    height: 1024,
    bytes: 14,
    sha256: "sha256:fake",
  },
  createdAt: "2026-04-26T08:00:00.000Z",
} satisfies MarketItemResponse;

const secondMarketItem = {
  ...marketItem,
  id: "market-2",
  prompt: "火焰山上的赛博飞剑",
  image: {
    ...marketItem.image,
    url: "/api/image-chat/market/market-2/image",
    sha256: "sha256:fake-2",
  },
} satisfies MarketItemResponse;

beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
  routerState.push.mockClear();
  lightboxState.lastProps = null;
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("MarketPageClient", () => {
  it("opens a preview lightbox when clicking a market image", async () => {
    const user = userEvent.setup();

    render(<MarketPageClient initialItems={[marketItem]} initialNextCursor={null} />);

    await user.click(screen.getByRole("button", { name: "预览 霓虹雨夜中的机械猫" }));

    expect(screen.getByTestId("market-lightbox")).toBeInTheDocument();
    expect(lightboxState.lastProps?.slides).toEqual([
      {
        src: marketItem.image.url,
        alt: marketItem.prompt,
        width: marketItem.image.width,
        height: marketItem.image.height,
      },
    ]);
  });

  it("renders market items and saves a generation draft before returning home", async () => {
    const user = userEvent.setup();

    render(<MarketPageClient initialItems={[marketItem]} initialNextCursor={null} />);

    expect(screen.getByText("霓虹雨夜中的机械猫")).toBeInTheDocument();
    expect(screen.getByText("1024x1024 · high · png")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "管理删除" })
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "去生成" }));

    expect(JSON.parse(window.localStorage.getItem(MARKET_DRAFT_STORAGE_KEY)!)).toMatchObject({
      prompt: "霓虹雨夜中的机械猫",
      settings: marketItem.settings,
      model: "gpt-image-2",
      sourceMarketItemId: "market-1",
    });
    expect(routerState.push).toHaveBeenCalledWith("/");
  });

  it("opens a prompt detail dialog and copies the full prompt", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);

    Object.defineProperty(window.navigator, "clipboard", {
      value: {
        writeText,
      },
      configurable: true,
    });

    render(<MarketPageClient initialItems={[marketItem]} initialNextCursor={null} />);

    await user.click(screen.getByRole("button", { name: "查看提示词" }));

    const dialog = screen.getByRole("dialog", { name: "提示词详情" });

    expect(within(dialog).getByText("完整提示词")).toBeInTheDocument();
    expect(within(dialog).getByText("霓虹雨夜中的机械猫")).toBeInTheDocument();
    expect(within(dialog).getByText("模型：gpt-image-2")).toBeInTheDocument();
    expect(within(dialog).getByText("1024x1024 · high · png")).toBeInTheDocument();

    await user.click(within(dialog).getByRole("button", { name: "复制提示词" }));

    expect(writeText).toHaveBeenCalledWith("霓虹雨夜中的机械猫");
  });

  it("allows admins to enter top delete mode, select an item, and delete it", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));

    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(window, "prompt").mockReturnValue("secret-token");

    render(
      <MarketPageClient
        initialItems={[marketItem, secondMarketItem]}
        initialNextCursor={null}
      />
    );

    await user.click(screen.getByRole("button", { name: "删除作品" }));

    expect(
      screen.getByRole("checkbox", { name: "选择删除 霓虹雨夜中的机械猫" })
    ).toBeInTheDocument();

    await user.click(
      screen.getByRole("checkbox", { name: "选择删除 霓虹雨夜中的机械猫" })
    );
    await user.click(screen.getByRole("button", { name: "删除选中" }));

    await waitFor(() => {
      expect(screen.queryByText("霓虹雨夜中的机械猫")).not.toBeInTheDocument();
    });

    expect(screen.getByText("火焰山上的赛博飞剑")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith("/api/image-chat/market/market-1", {
      method: "DELETE",
      headers: {
        "x-image-chat-admin-token": "secret-token",
      },
    });
  });

  it("renders an empty state when there are no public items", () => {
    render(<MarketPageClient initialItems={[]} initialNextCursor={null} />);

    expect(screen.getByText("焚决市场还没有公开作品")).toBeInTheDocument();
  });
});
