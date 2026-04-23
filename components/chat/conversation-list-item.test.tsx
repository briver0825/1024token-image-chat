import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ConversationListItem } from "@/components/chat/conversation-list-item";

describe("ConversationListItem", () => {
  it("shows the title and emits selection", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();

    render(
      <ConversationListItem
        conversation={{
          id: "conv-1",
          title: "赛博朋克猫咪",
          updatedAt: "2026-04-23T12:00:00.000Z",
          createdAt: "2026-04-23T11:00:00.000Z",
          messageCount: 3,
        }}
        active
        onSelect={onSelect}
        onTogglePinned={vi.fn()}
        onDelete={vi.fn()}
      />
    );

    await user.click(screen.getByRole("button", { name: "赛博朋克猫咪" }));

    expect(onSelect).toHaveBeenCalledWith("conv-1");
    expect(screen.getByText("3 条消息")).toBeInTheDocument();
  });

  it("uses single-line truncation without line-clamp display behavior for longer titles", () => {
    const longTitle =
      "霓虹雨夜中的黑猫站在便利店门口，电影感构图与潮湿反光街道";

    render(
      <ConversationListItem
        conversation={{
          id: "conv-long",
          title: longTitle,
          updatedAt: "2026-04-23T12:00:00.000Z",
          createdAt: "2026-04-23T11:00:00.000Z",
          messageCount: 8,
        }}
        active={false}
        onSelect={vi.fn()}
        onTogglePinned={vi.fn()}
        onDelete={vi.fn()}
      />
    );

    expect(screen.getByText(longTitle)).toHaveClass("truncate");
    expect(screen.getByText(longTitle)).toHaveAttribute("title", longTitle);
    expect(screen.getByText(longTitle)).toHaveClass("min-w-0");
    expect(screen.getByText(longTitle)).toHaveClass("overflow-hidden");
  });

  it("supports deleting a conversation without triggering selection", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    const onTogglePinned = vi.fn();
    const onDelete = vi.fn();

    render(
      <ConversationListItem
        conversation={{
          id: "conv-2",
          title: "未来感城市夜景",
          updatedAt: "2026-04-23T12:00:00.000Z",
          createdAt: "2026-04-23T11:00:00.000Z",
          messageCount: 5,
        }}
        active={false}
        onSelect={onSelect}
        onTogglePinned={onTogglePinned}
        onDelete={onDelete}
      />
    );

    await user.click(
      screen.getByRole("button", { name: "会话操作 未来感城市夜景" })
    );
    await user.click(screen.getByRole("menuitem", { name: "删除会话" }));

    expect(onDelete).toHaveBeenCalledWith("conv-2");
    expect(onTogglePinned).not.toHaveBeenCalled();
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("supports pinning a conversation without triggering selection", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    const onTogglePinned = vi.fn();

    render(
      <ConversationListItem
        conversation={{
          id: "conv-3",
          title: "插画灵感板",
          updatedAt: "2026-04-23T12:00:00.000Z",
          createdAt: "2026-04-23T11:00:00.000Z",
          messageCount: 1,
          pinned: false,
        }}
        active={false}
        onSelect={onSelect}
        onTogglePinned={onTogglePinned}
        onDelete={vi.fn()}
      />
    );

    await user.click(screen.getByRole("button", { name: "会话操作 插画灵感板" }));
    await user.click(screen.getByRole("menuitem", { name: "置顶会话" }));

    expect(onTogglePinned).toHaveBeenCalledWith("conv-3", true);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("shows unpin action for pinned conversations", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    const onTogglePinned = vi.fn();

    render(
      <ConversationListItem
        conversation={{
          id: "conv-4",
          title: "品牌海报",
          updatedAt: "2026-04-23T12:00:00.000Z",
          createdAt: "2026-04-23T11:00:00.000Z",
          messageCount: 2,
          pinned: true,
        }}
        active={false}
        onSelect={onSelect}
        onTogglePinned={onTogglePinned}
        onDelete={vi.fn()}
      />
    );

    await user.click(screen.getByRole("button", { name: "会话操作 品牌海报" }));
    await user.click(screen.getByRole("menuitem", { name: "取消置顶" }));

    expect(onTogglePinned).toHaveBeenCalledWith("conv-4", false);
    expect(onSelect).not.toHaveBeenCalled();
  });
});
