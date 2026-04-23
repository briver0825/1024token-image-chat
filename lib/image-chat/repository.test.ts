import { Blob } from "node:buffer";

import { describe, expect, it } from "vitest";

import {
  createImageChatRepository,
  type ImageAssetRecord,
  type MessageRecord,
} from "@/lib/image-chat/repository";

describe("createImageChatRepository", () => {
  it("persists conversations, messages and assets together", async () => {
    const repository = createImageChatRepository("image-chat-test-persist");

    await repository.upsertConversation({
      id: "conv-1",
      title: "霓虹猫",
      createdAt: "2026-04-23T12:00:00.000Z",
      updatedAt: "2026-04-23T12:00:00.000Z",
    });

    const userMessage: MessageRecord = {
      id: "user-1",
      conversationId: "conv-1",
      role: "user",
      status: "completed",
      prompt: "一只在东京雨夜里的黑猫",
      createdAt: "2026-04-23T12:00:00.000Z",
      updatedAt: "2026-04-23T12:00:00.000Z",
    };
    const asset: ImageAssetRecord = {
      id: "asset-1",
      conversationId: "conv-1",
      messageId: "assistant-1",
      blob: new Blob(["fake-image"], { type: "image/png" }),
      mimeType: "image/png",
      width: 1024,
      height: 1024,
      createdAt: "2026-04-23T12:01:00.000Z",
    };

    await repository.upsertMessage(userMessage);
    await repository.upsertMessage({
      id: "assistant-1",
      conversationId: "conv-1",
      role: "assistant",
      status: "completed",
      prompt: userMessage.prompt,
      assetId: asset.id,
      createdAt: "2026-04-23T12:01:00.000Z",
      updatedAt: "2026-04-23T12:01:00.000Z",
    });
    await repository.upsertAsset(asset);

    const conversations = await repository.listConversationSummaries();
    const detail = await repository.getConversationDetail("conv-1");

    expect(conversations).toEqual([
      {
        id: "conv-1",
        title: "霓虹猫",
        createdAt: "2026-04-23T12:00:00.000Z",
        updatedAt: "2026-04-23T12:00:00.000Z",
        messageCount: 2,
        pinned: false,
      },
    ]);

    expect(detail?.messages.map((message) => message.id)).toEqual([
      "user-1",
      "assistant-1",
    ]);
    expect(detail?.assets[0]).toMatchObject({
      id: "asset-1",
      mimeType: "image/png",
      width: 1024,
      height: 1024,
    });
  });

  it("deletes a conversation together with its messages and assets", async () => {
    const repository = createImageChatRepository("image-chat-test-delete");

    await repository.upsertConversation({
      id: "conv-delete",
      title: "待删除会话",
      createdAt: "2026-04-23T12:00:00.000Z",
      updatedAt: "2026-04-23T12:00:00.000Z",
    });
    await repository.upsertMessage({
      id: "assistant-delete",
      conversationId: "conv-delete",
      role: "assistant",
      status: "pending",
      prompt: "待删除图片",
      remoteTaskId: "task-delete",
      createdAt: "2026-04-23T12:00:01.000Z",
      updatedAt: "2026-04-23T12:00:01.000Z",
    });
    await repository.upsertAsset({
      id: "asset-delete",
      conversationId: "conv-delete",
      messageId: "assistant-delete",
      blob: new Blob(["fake-image"], { type: "image/png" }),
      mimeType: "image/png",
      width: 512,
      height: 512,
      createdAt: "2026-04-23T12:00:02.000Z",
    });

    await repository.deleteConversation("conv-delete");

    await expect(repository.getConversationDetail("conv-delete")).resolves.toBeNull();
    await expect(repository.listConversationSummaries()).resolves.toEqual([]);
    await expect(repository.listPendingAssistantMessages()).resolves.toEqual([]);
  });

  it("keeps pinned conversations first and preserves pin state across updates", async () => {
    const repository = createImageChatRepository("image-chat-test-pinned");

    await repository.upsertConversation({
      id: "conv-a",
      title: "普通会话",
      createdAt: "2026-04-23T09:00:00.000Z",
      updatedAt: "2026-04-23T12:00:00.000Z",
    });
    await repository.upsertConversation({
      id: "conv-b",
      title: "置顶旧会话",
      createdAt: "2026-04-23T09:30:00.000Z",
      updatedAt: "2026-04-23T12:30:00.000Z",
      pinned: true,
    });
    await repository.upsertConversation({
      id: "conv-c",
      title: "置顶新会话",
      createdAt: "2026-04-23T10:00:00.000Z",
      updatedAt: "2026-04-23T13:00:00.000Z",
      pinned: true,
    });

    await repository.upsertConversation({
      id: "conv-b",
      title: "置顶旧会话（已更新）",
      createdAt: "2026-04-23T09:30:00.000Z",
      updatedAt: "2026-04-23T12:45:00.000Z",
    });

    await repository.toggleConversationPinned("conv-a", true);

    await expect(repository.listConversationSummaries()).resolves.toEqual([
      {
        id: "conv-c",
        title: "置顶新会话",
        createdAt: "2026-04-23T10:00:00.000Z",
        updatedAt: "2026-04-23T13:00:00.000Z",
        messageCount: 0,
        pinned: true,
      },
      {
        id: "conv-b",
        title: "置顶旧会话（已更新）",
        createdAt: "2026-04-23T09:30:00.000Z",
        updatedAt: "2026-04-23T12:45:00.000Z",
        messageCount: 0,
        pinned: true,
      },
      {
        id: "conv-a",
        title: "普通会话",
        createdAt: "2026-04-23T09:00:00.000Z",
        updatedAt: "2026-04-23T12:00:00.000Z",
        messageCount: 0,
        pinned: true,
      },
    ]);

    await repository.toggleConversationPinned("conv-b", false);

    await expect(repository.listConversationSummaries()).resolves.toEqual([
      {
        id: "conv-c",
        title: "置顶新会话",
        createdAt: "2026-04-23T10:00:00.000Z",
        updatedAt: "2026-04-23T13:00:00.000Z",
        messageCount: 0,
        pinned: true,
      },
      {
        id: "conv-a",
        title: "普通会话",
        createdAt: "2026-04-23T09:00:00.000Z",
        updatedAt: "2026-04-23T12:00:00.000Z",
        messageCount: 0,
        pinned: true,
      },
      {
        id: "conv-b",
        title: "置顶旧会话（已更新）",
        createdAt: "2026-04-23T09:30:00.000Z",
        updatedAt: "2026-04-23T12:45:00.000Z",
        messageCount: 0,
        pinned: false,
      },
    ]);
  });

  it("lists generated images across conversations in reverse chronological order", async () => {
    const repository = createImageChatRepository("image-chat-test-gallery");

    await repository.upsertConversation({
      id: "conv-gallery-a",
      title: "会话 A",
      createdAt: "2026-04-23T09:00:00.000Z",
      updatedAt: "2026-04-23T10:00:00.000Z",
    });
    await repository.upsertConversation({
      id: "conv-gallery-b",
      title: "会话 B",
      createdAt: "2026-04-23T11:00:00.000Z",
      updatedAt: "2026-04-23T12:00:00.000Z",
    });

    await repository.upsertMessage({
      id: "assistant-gallery-a",
      conversationId: "conv-gallery-a",
      role: "assistant",
      status: "completed",
      prompt: "海边日落",
      assetId: "asset-gallery-a",
      createdAt: "2026-04-23T10:00:00.000Z",
      updatedAt: "2026-04-23T10:00:00.000Z",
    });
    await repository.upsertMessage({
      id: "assistant-gallery-b",
      conversationId: "conv-gallery-b",
      role: "assistant",
      status: "completed",
      prompt: "山野清晨",
      assetId: "asset-gallery-b",
      createdAt: "2026-04-23T12:00:00.000Z",
      updatedAt: "2026-04-23T12:00:00.000Z",
    });
    await repository.upsertAsset({
      id: "asset-gallery-a",
      conversationId: "conv-gallery-a",
      messageId: "assistant-gallery-a",
      blob: new Blob(["image-a"], { type: "image/png" }),
      mimeType: "image/png",
      width: 1024,
      height: 1024,
      createdAt: "2026-04-23T10:00:00.000Z",
    });
    await repository.upsertAsset({
      id: "asset-gallery-b",
      conversationId: "conv-gallery-b",
      messageId: "assistant-gallery-b",
      blob: new Blob(["image-b"], { type: "image/png" }),
      mimeType: "image/png",
      width: 1536,
      height: 1024,
      createdAt: "2026-04-23T12:00:00.000Z",
    });

    await expect(repository.listImageGalleryItems()).resolves.toMatchObject([
      {
        id: "asset-gallery-b",
        conversationId: "conv-gallery-b",
        conversationTitle: "会话 B",
        messageId: "assistant-gallery-b",
        prompt: "山野清晨",
        contentHash: undefined,
        createdAt: "2026-04-23T12:00:00.000Z",
        mimeType: "image/png",
        width: 1536,
        height: 1024,
      },
      {
        id: "asset-gallery-a",
        conversationId: "conv-gallery-a",
        conversationTitle: "会话 A",
        messageId: "assistant-gallery-a",
        prompt: "海边日落",
        contentHash: undefined,
        createdAt: "2026-04-23T10:00:00.000Z",
        mimeType: "image/png",
        width: 1024,
        height: 1024,
      },
    ]);
  });

  it("keeps shared hashed assets until no remaining messages reference them", async () => {
    const repository = createImageChatRepository("image-chat-test-shared-assets");

    await repository.upsertConversation({
      id: "conv-shared-a",
      title: "会话一",
      createdAt: "2026-04-24T08:00:00.000Z",
      updatedAt: "2026-04-24T08:30:00.000Z",
    });
    await repository.upsertConversation({
      id: "conv-shared-b",
      title: "会话二",
      createdAt: "2026-04-24T09:00:00.000Z",
      updatedAt: "2026-04-24T09:30:00.000Z",
    });

    await repository.upsertAsset({
      id: "asset-shared",
      conversationId: "conv-shared-a",
      messageId: "assistant-shared-a",
      blob: new Blob(["shared-image"], { type: "image/png" }),
      mimeType: "image/png",
      width: 1024,
      height: 1024,
      createdAt: "2026-04-24T08:30:00.000Z",
      contentHash: "sha256:shared",
    });
    await repository.upsertMessage({
      id: "assistant-shared-a",
      conversationId: "conv-shared-a",
      role: "assistant",
      status: "completed",
      prompt: "共享图片 A",
      assetId: "asset-shared",
      createdAt: "2026-04-24T08:30:00.000Z",
      updatedAt: "2026-04-24T08:30:00.000Z",
    });
    await repository.upsertMessage({
      id: "assistant-shared-b",
      conversationId: "conv-shared-b",
      role: "assistant",
      status: "completed",
      prompt: "共享图片 B",
      assetId: "asset-shared",
      createdAt: "2026-04-24T09:30:00.000Z",
      updatedAt: "2026-04-24T09:30:00.000Z",
    });

    await expect(repository.getAssetByHash("sha256:shared")).resolves.toMatchObject({
      id: "asset-shared",
      contentHash: "sha256:shared",
    });
    await expect(repository.listImageGalleryItems()).resolves.toMatchObject([
      {
        id: "asset-shared",
        messageId: "assistant-shared-b",
        conversationId: "conv-shared-b",
        contentHash: "sha256:shared",
      },
      {
        id: "asset-shared",
        messageId: "assistant-shared-a",
        conversationId: "conv-shared-a",
        contentHash: "sha256:shared",
      },
    ]);

    await repository.deleteConversation("conv-shared-a");

    await expect(repository.getAssetByHash("sha256:shared")).resolves.toMatchObject({
      id: "asset-shared",
      contentHash: "sha256:shared",
    });
    await expect(repository.getConversationDetail("conv-shared-b")).resolves.toMatchObject({
      assets: [
        {
          id: "asset-shared",
          contentHash: "sha256:shared",
        },
      ],
    });

    await repository.deleteConversation("conv-shared-b");

    await expect(repository.getAssetByHash("sha256:shared")).resolves.toBeNull();
  });
});
