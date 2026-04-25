import { openDB, type DBSchema, type IDBPDatabase } from "idb";

import type {
  ConversationDetail,
  ConversationRecord,
  ConversationSummaryRecord,
  ImageAssetRecord,
  ImageGalleryRecord,
  MessageRecord,
} from "@/lib/image-chat/types";

export type {
  ConversationRecord,
  ConversationSummaryRecord,
  ImageAssetRecord,
  ImageGalleryRecord,
  MessageRecord,
} from "@/lib/image-chat/types";

interface ImageChatDBSchema extends DBSchema {
  conversations: {
    key: string;
    value: ConversationRecord;
  };
  messages: {
    key: string;
    value: MessageRecord;
    indexes: {
      "by-conversation": string;
      "by-asset-id": string;
    };
  };
  assets: {
    key: string;
    value: ImageAssetRecord;
    indexes: {
      "by-conversation": string;
      "by-message": string;
      "by-hash": string;
    };
  };
}

async function createDatabase(name: string) {
  return openDB<ImageChatDBSchema>(name, 2, {
    upgrade(database, _oldVersion, _newVersion, transaction) {
      const messages = database.objectStoreNames.contains("messages")
        ? transaction.objectStore("messages")
        : database.createObjectStore("messages", {
            keyPath: "id",
          });
      const assets = database.objectStoreNames.contains("assets")
        ? transaction.objectStore("assets")
        : database.createObjectStore("assets", {
            keyPath: "id",
          });

      if (!database.objectStoreNames.contains("conversations")) {
        database.createObjectStore("conversations", {
          keyPath: "id",
        });
      }

      if (!messages.indexNames.contains("by-conversation")) {
        messages.createIndex("by-conversation", "conversationId");
      }

      if (!messages.indexNames.contains("by-asset-id")) {
        messages.createIndex("by-asset-id", "assetId");
      }

      if (!assets.indexNames.contains("by-conversation")) {
        assets.createIndex("by-conversation", "conversationId");
      }

      if (!assets.indexNames.contains("by-message")) {
        assets.createIndex("by-message", "messageId");
      }

      if (!assets.indexNames.contains("by-hash")) {
        assets.createIndex("by-hash", "contentHash");
      }
    },
  });
}

function sortByDateAsc<T extends { createdAt: string }>(items: T[]) {
  return [...items].sort((left, right) =>
    left.createdAt.localeCompare(right.createdAt)
  );
}

function sortByDateDesc<T extends { createdAt: string }>(items: T[]) {
  return [...items].sort((left, right) =>
    right.createdAt.localeCompare(left.createdAt)
  );
}

function sortConversationsDesc(items: ConversationSummaryRecord[]) {
  return [...items].sort((left, right) => {
    const leftPinned = Boolean(left.pinned);
    const rightPinned = Boolean(right.pinned);

    if (leftPinned !== rightPinned) {
      return leftPinned ? -1 : 1;
    }

    return right.updatedAt.localeCompare(left.updatedAt);
  });
}

function mergeConversationRecord(
  existing: ConversationRecord | undefined,
  incoming: ConversationRecord
): ConversationRecord {
  return {
    ...existing,
    ...incoming,
    pinned: incoming.pinned ?? existing?.pinned ?? false,
  };
}

function getMessageAssetIds(message: MessageRecord) {
  return [
    ...(message.assetId ? [message.assetId] : []),
    ...(message.referenceAssetId ? [message.referenceAssetId] : []),
    ...(message.referenceAssetIds ?? []),
  ];
}

export function createImageChatRepository(databaseName = "image-chat") {
  let databasePromise: Promise<IDBPDatabase<ImageChatDBSchema>> | null = null;

  const getDatabase = () => {
    databasePromise ??= createDatabase(databaseName);
    return databasePromise;
  };

  return {
    async upsertConversation(conversation: ConversationRecord) {
      const database = await getDatabase();
      const existing = await database.get("conversations", conversation.id);

      await database.put(
        "conversations",
        mergeConversationRecord(existing, conversation)
      );
    },

    async upsertMessage(message: MessageRecord) {
      const database = await getDatabase();
      await database.put("messages", message);
    },

    async upsertAsset(asset: ImageAssetRecord) {
      const database = await getDatabase();
      await database.put("assets", asset);
    },

    async getAssetByHash(contentHash: string): Promise<ImageAssetRecord | null> {
      const database = await getDatabase();
      const asset = await database.getFromIndex("assets", "by-hash", contentHash);

      return asset ?? null;
    },

    async deleteConversation(conversationId: string) {
      const database = await getDatabase();
      const messages = await database.getAllFromIndex(
        "messages",
        "by-conversation",
        conversationId
      );
      const assetIdsToPrune = [...new Set(messages.flatMap(getMessageAssetIds))];
      await database.delete("conversations", conversationId);

      await Promise.all(
        messages.map((message) => database.delete("messages", message.id))
      );

      const remainingMessages = await database.getAll("messages");

      for (const assetId of assetIdsToPrune) {
        const remainingReferences = remainingMessages.filter((message) =>
          getMessageAssetIds(message).includes(assetId)
        ).length;

        if (remainingReferences === 0) {
          await database.delete("assets", assetId);
        }
      }
    },

    async toggleConversationPinned(conversationId: string, pinned: boolean) {
      const database = await getDatabase();
      const existing = await database.get("conversations", conversationId);

      if (!existing) {
        return;
      }

      await database.put("conversations", {
        ...existing,
        pinned,
      });
    },

    async listConversationSummaries(): Promise<ConversationSummaryRecord[]> {
      const database = await getDatabase();
      const conversations = await database.getAll("conversations");

      const summaries = await Promise.all(
        conversations.map(async (conversation) => {
          const messageCount = await database
            .transaction("messages")
            .store.index("by-conversation")
            .count(conversation.id);

          return {
            ...conversation,
            pinned: Boolean(conversation.pinned),
            messageCount,
          };
        })
      );

      return sortConversationsDesc(summaries);
    },

    async getConversationDetail(
      conversationId: string
    ): Promise<ConversationDetail | null> {
      const database = await getDatabase();
      const conversation = await database.get("conversations", conversationId);

      if (!conversation) {
        return null;
      }

      const messages = await database.getAllFromIndex(
        "messages",
        "by-conversation",
        conversationId
      );
      const assets = (
        await Promise.all(
          [...new Set(messages.flatMap(getMessageAssetIds))].map((assetId) =>
            database.get("assets", assetId)
          )
        )
      ).filter((asset): asset is ImageAssetRecord => Boolean(asset));

      return {
        conversation: {
          ...conversation,
          pinned: Boolean(conversation.pinned),
          messageCount: messages.length,
        },
        messages: sortByDateAsc(messages),
        assets: sortByDateAsc(assets),
      };
    },

    async listPendingAssistantMessages(): Promise<MessageRecord[]> {
      const database = await getDatabase();
      const messages = await database.getAll("messages");

      return sortByDateAsc(
        messages.filter(
          (message) =>
            message.role === "assistant" &&
            message.status === "pending" &&
            Boolean(message.remoteTaskId)
        )
      );
    },

    async listImageGalleryItems(): Promise<ImageGalleryRecord[]> {
      const database = await getDatabase();
      const [messages, conversations] = await Promise.all([
        database.getAll("messages"),
        database.getAll("conversations"),
      ]);
      const assetIds = [
        ...new Set(
          messages.flatMap((message) => (message.assetId ? [message.assetId] : []))
        ),
      ];
      const assets = (
        await Promise.all(assetIds.map((assetId) => database.get("assets", assetId)))
      ).filter((asset): asset is ImageAssetRecord => Boolean(asset));

      const assetsById = new Map(assets.map((asset) => [asset.id, asset]));
      const conversationsById = new Map(
        conversations.map((conversation) => [conversation.id, conversation])
      );

      const galleryItems = messages.flatMap<ImageGalleryRecord>((message) => {
        const asset = message.assetId ? assetsById.get(message.assetId) : undefined;
        const conversation = conversationsById.get(message.conversationId);

        if (
          !message ||
          !conversation ||
          !asset ||
          message.role !== "assistant" ||
          message.status !== "completed"
        ) {
          return [];
        }

        return [
          {
            id: asset.id,
            conversationId: message.conversationId,
            conversationTitle: conversation.title,
            messageId: message.id,
            prompt: message.prompt,
            settings: message.settings,
            contentHash: asset.contentHash,
            blob: asset.blob,
            mimeType: asset.mimeType,
            width: asset.width,
            height: asset.height,
            createdAt: message.updatedAt,
          },
        ];
      });

      return sortByDateDesc(galleryItems);
    },
  };
}
