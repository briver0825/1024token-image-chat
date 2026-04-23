import type { ConversationSummaryRecord } from "@/lib/image-chat/types";

export function filterConversationsByQuery(
  conversations: ConversationSummaryRecord[],
  query: string
) {
  const normalizedQuery = query.trim().toLocaleLowerCase();

  if (!normalizedQuery) {
    return conversations;
  }

  return conversations.filter((conversation) =>
    conversation.title.toLocaleLowerCase().includes(normalizedQuery)
  );
}
