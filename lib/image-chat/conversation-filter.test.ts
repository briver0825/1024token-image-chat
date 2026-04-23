import { describe, expect, it } from "vitest";

import { filterConversationsByQuery } from "@/lib/image-chat/conversation-filter";
import type { ConversationSummaryRecord } from "@/lib/image-chat/types";

const conversations: ConversationSummaryRecord[] = [
  {
    id: "conv-1",
    title: "赛博朋克夜景",
    createdAt: "2026-04-23T10:00:00.000Z",
    updatedAt: "2026-04-23T12:00:00.000Z",
    messageCount: 2,
  },
  {
    id: "conv-2",
    title: "Product mockup",
    createdAt: "2026-04-23T11:00:00.000Z",
    updatedAt: "2026-04-23T13:00:00.000Z",
    messageCount: 4,
    pinned: true,
  },
];

describe("filterConversationsByQuery", () => {
  it("returns all conversations when the query is empty", () => {
    expect(filterConversationsByQuery(conversations, "   ")).toEqual(conversations);
  });

  it("filters conversations by trimmed case-insensitive title match", () => {
    expect(filterConversationsByQuery(conversations, "  mock ")).toEqual([
      conversations[1],
    ]);
    expect(filterConversationsByQuery(conversations, "夜景")).toEqual([
      conversations[0],
    ]);
  });
});
