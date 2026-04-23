"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import {
  createImageGenerationTask,
  fetchImageChatPublicKey,
  fetchImageGenerationTaskStatus,
  ImageGenerationRequestError,
} from "@/lib/image-chat/client";
import { computeBlobSha256 } from "@/lib/image-chat/asset-dedup";
import {
  clearPersistedProviderConfig,
  loadPersistedProviderConfigPreference,
  persistProviderConfigPreference,
} from "@/lib/image-chat/provider-config-persistence";
import { createImageChatRepository } from "@/lib/image-chat/repository";
import type {
  ConversationDetail,
  ConversationSummaryRecord,
  GenerationSettings,
  ImageAssetRecord,
  ImageGalleryRecord,
  MessageRecord,
  ProviderConnectionConfig,
  PublicKeyResponse,
} from "@/lib/image-chat/types";
import {
  base64ToBlob,
  blobToBase64,
  buildConversationTitle,
  createDownloadFileName,
} from "@/lib/image-chat/utils";
import { isTaskInProgress } from "@/lib/image-chat/task-polling";

const ACTIVE_CONVERSATION_STORAGE_KEY = "image-chat.active-conversation-id";
const GENERATION_SETTINGS_STORAGE_KEY = "image-chat.generation-settings";
const TASK_POLL_INTERVAL_MS = 2_500;
const MAX_TASK_POLL_ERRORS = 3;

export type RenderedUserMessage = {
  id: string;
  role: "user";
  prompt: string;
  createdAt: string;
};

export type RenderedAssistantMessage = {
  id: string;
  role: "assistant";
  prompt: string;
  createdAt: string;
  status: MessageRecord["status"];
  settings: GenerationSettings;
  assetId?: string;
  referenceAssetId?: string;
  errorMessage?: string;
  image?: {
    src: string;
    mimeType: string;
    width: number;
    height: number;
  };
  referenceImage?: {
    src: string;
    mimeType: string;
    width: number;
    height: number;
  };
};

export type RenderedChatMessage = RenderedUserMessage | RenderedAssistantMessage;

export type RenderedGalleryImage = {
  id: string;
  messageId: string;
  conversationId: string;
  conversationTitle: string;
  prompt: string;
  createdAt: string;
  settings: GenerationSettings;
  contentHash?: string;
  image: {
    src: string;
    mimeType: string;
    width: number;
    height: number;
  };
};

export type ComposerReferenceImage = {
  assetId: string;
  messageId: string;
  prompt: string;
  image: {
    src: string;
    mimeType: string;
    width: number;
    height: number;
  };
};

export const DEFAULT_GENERATION_SETTINGS: GenerationSettings = {
  size: "1024x1024",
  quality: "high",
  outputFormat: "png",
};

export const DEFAULT_PROVIDER_CONNECTION_CONFIG: ProviderConnectionConfig = {
  apiKey: "",
  baseUrl: "",
  model: "gpt-image-2",
};

function getStorageValue(key: string) {
  if (typeof window === "undefined") {
    return null;
  }

  return window.localStorage.getItem(key);
}

function setStorageValue(key: string, value: string | null) {
  if (typeof window === "undefined") {
    return;
  }

  if (value === null) {
    window.localStorage.removeItem(key);
    return;
  }

  window.localStorage.setItem(key, value);
}

function sleep(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function extractGenerationSettings(settings: Partial<GenerationSettings> | undefined) {
  return {
    size: settings?.size ?? DEFAULT_GENERATION_SETTINGS.size,
    quality: settings?.quality ?? DEFAULT_GENERATION_SETTINGS.quality,
    outputFormat: settings?.outputFormat ?? DEFAULT_GENERATION_SETTINGS.outputFormat,
    ...(settings?.outputCompression !== undefined
      ? { outputCompression: settings.outputCompression }
      : {}),
  } satisfies GenerationSettings;
}

export function useImageChat() {
  const repositoryRef = useRef(createImageChatRepository());
  const messageObjectUrlsRef = useRef<string[]>([]);
  const galleryObjectUrlsRef = useRef<string[]>([]);
  const referenceObjectUrlRef = useRef<string | null>(null);
  const activeConversationIdRef = useRef<string | null>(null);
  const pollingTaskIdsRef = useRef(new Set<string>());
  const isDisposedRef = useRef(false);
  const [conversations, setConversations] = useState<ConversationSummaryRecord[]>(
    []
  );
  const [activeConversationId, setActiveConversationId] = useState<string | null>(
    null
  );
  const [activeConversation, setActiveConversation] =
    useState<ConversationDetail | null>(null);
  const [renderedMessages, setRenderedMessages] = useState<RenderedChatMessage[]>(
    []
  );
  const [galleryImages, setGalleryImages] = useState<RenderedGalleryImage[]>([]);
  const [selectedReferenceImage, setSelectedReferenceImage] =
    useState<ComposerReferenceImage | null>(null);
  const [settings, setSettings] = useState<GenerationSettings>(() => {
    const savedSettings = getStorageValue(GENERATION_SETTINGS_STORAGE_KEY);

    if (!savedSettings) {
      return DEFAULT_GENERATION_SETTINGS;
    }

    try {
      const parsed = JSON.parse(savedSettings) as GenerationSettings;

      return {
        ...DEFAULT_GENERATION_SETTINGS,
        ...parsed,
      };
    } catch {
      return DEFAULT_GENERATION_SETTINGS;
    }
  });
  const [rememberProviderConfig, setRememberProviderConfig] = useState(
    () => loadPersistedProviderConfigPreference().remember
  );
  const [connectionConfig, setConnectionConfig] = useState<ProviderConnectionConfig>(
    () => loadPersistedProviderConfigPreference().config
  );
  const [publicKeyResponse, setPublicKeyResponse] =
    useState<PublicKeyResponse | null>(null);
  const [publicKeyStatus, setPublicKeyStatus] = useState<
    "loading" | "ready" | "error"
  >("loading");
  const [isBootstrapping, setIsBootstrapping] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const revokeMessageObjectUrls = useCallback(() => {
    messageObjectUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    messageObjectUrlsRef.current = [];
  }, []);

  const revokeGalleryObjectUrls = useCallback(() => {
    galleryObjectUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    galleryObjectUrlsRef.current = [];
  }, []);

  const clearReferenceImage = useCallback(() => {
    if (referenceObjectUrlRef.current) {
      URL.revokeObjectURL(referenceObjectUrlRef.current);
      referenceObjectUrlRef.current = null;
    }

    setSelectedReferenceImage(null);
  }, []);

  const hydrateRenderedMessages = useCallback(
    async (detail: ConversationDetail | null) => {
      revokeMessageObjectUrls();

      if (!detail) {
        setRenderedMessages([]);
        return;
      }

      const assetsById = new Map<string, ImageAssetRecord>();
      const nextObjectUrls: string[] = [];

      detail.assets.forEach((asset) => {
        assetsById.set(asset.id, asset);
      });

      const nextMessages = detail.messages.map<RenderedChatMessage>((message) => {
        if (message.role === "user") {
          return {
            id: message.id,
            role: "user",
            prompt: message.prompt,
            createdAt: message.createdAt,
          };
        }

        const asset = message.assetId ? assetsById.get(message.assetId) : undefined;
        const referenceAsset = message.referenceAssetId
          ? assetsById.get(message.referenceAssetId)
          : undefined;
        const objectUrl = asset ? URL.createObjectURL(asset.blob) : undefined;
        const referenceObjectUrl = referenceAsset
          ? URL.createObjectURL(referenceAsset.blob)
          : undefined;

        if (objectUrl) {
          nextObjectUrls.push(objectUrl);
        }

        if (referenceObjectUrl) {
          nextObjectUrls.push(referenceObjectUrl);
        }

        return {
          id: message.id,
          role: "assistant",
          prompt: message.prompt,
          createdAt: message.createdAt,
          status: message.status,
          settings: extractGenerationSettings(message.settings),
          assetId: message.assetId,
          referenceAssetId: message.referenceAssetId,
          errorMessage: message.errorMessage,
          image: asset
            ? {
                src: objectUrl!,
                mimeType: asset.mimeType,
                width: asset.width,
                height: asset.height,
              }
            : undefined,
          referenceImage: referenceAsset
            ? {
                src: referenceObjectUrl!,
                mimeType: referenceAsset.mimeType,
                width: referenceAsset.width,
                height: referenceAsset.height,
              }
            : undefined,
        };
      });

      messageObjectUrlsRef.current = nextObjectUrls;
      setRenderedMessages(nextMessages);
    },
    [revokeMessageObjectUrls]
  );

  const hydrateGalleryImages = useCallback(
    async (items: ImageGalleryRecord[]) => {
      revokeGalleryObjectUrls();

      const nextObjectUrls: string[] = [];
      const nextGalleryImages = items.map<RenderedGalleryImage>((item) => {
        const objectUrl = URL.createObjectURL(item.blob);
        nextObjectUrls.push(objectUrl);

        return {
          id: item.id,
          messageId: item.messageId,
          conversationId: item.conversationId,
          conversationTitle: item.conversationTitle,
          prompt: item.prompt,
          createdAt: item.createdAt,
          settings: extractGenerationSettings(item.settings),
          contentHash: item.contentHash,
          image: {
            src: objectUrl,
            mimeType: item.mimeType,
            width: item.width,
            height: item.height,
          },
        };
      });

      galleryObjectUrlsRef.current = nextObjectUrls;
      setGalleryImages(nextGalleryImages);
    },
    [revokeGalleryObjectUrls]
  );

  const syncConversationState = useCallback(
    async (preferredConversationId?: string | null) => {
      const repository = repositoryRef.current;
      const [summaries, galleryItems] = await Promise.all([
        repository.listConversationSummaries(),
        repository.listImageGalleryItems(),
      ]);
      const storedConversationId = getStorageValue(
        ACTIVE_CONVERSATION_STORAGE_KEY
      );
      const resolvedConversationId =
        preferredConversationId !== undefined
          ? preferredConversationId
          : activeConversationIdRef.current ??
            storedConversationId ??
            summaries[0]?.id ??
            null;

      setConversations(summaries);
      await hydrateGalleryImages(galleryItems);

      if (!resolvedConversationId) {
        activeConversationIdRef.current = null;
        setActiveConversationId(null);
        setActiveConversation(null);
        await hydrateRenderedMessages(null);
        setStorageValue(ACTIVE_CONVERSATION_STORAGE_KEY, null);
        return;
      }

      const detail = await repository.getConversationDetail(resolvedConversationId);

      if (!detail) {
        activeConversationIdRef.current = null;
        setActiveConversationId(null);
        setActiveConversation(null);
        await hydrateRenderedMessages(null);
        setStorageValue(ACTIVE_CONVERSATION_STORAGE_KEY, null);
        return;
      }

      activeConversationIdRef.current = resolvedConversationId;
      setActiveConversationId(resolvedConversationId);
      setActiveConversation(detail);
      await hydrateRenderedMessages(detail);
      setStorageValue(ACTIVE_CONVERSATION_STORAGE_KEY, resolvedConversationId);
    },
    [hydrateGalleryImages, hydrateRenderedMessages]
  );

  const completePendingTask = useCallback(
    async ({
      taskId,
      conversationId,
      assistantMessageId,
      successToast = true,
    }: {
      taskId: string;
      conversationId: string;
      assistantMessageId: string;
      successToast?: boolean;
    }) => {
      const repository = repositoryRef.current;
      const detail = await repository.getConversationDetail(conversationId);

      if (!detail) {
        return true;
      }

      const assistantMessage = detail.messages.find(
        (message) => message.id === assistantMessageId
      );
      const taskStatus = await fetchImageGenerationTaskStatus(taskId);

      if (isTaskInProgress(taskStatus.status)) {
        return false;
      }

      const conversationRecord = detail?.conversation ?? {
        id: conversationId,
        title: buildConversationTitle(assistantMessage?.prompt ?? "新的图片会话"),
        createdAt: assistantMessage?.createdAt ?? new Date().toISOString(),
        updatedAt: assistantMessage?.updatedAt ?? new Date().toISOString(),
        messageCount: detail?.messages.length ?? 0,
      };

      if (taskStatus.status === "completed") {
        const blob = base64ToBlob(
          taskStatus.image.b64,
          taskStatus.image.mimeType
        );
        const contentHash = await computeBlobSha256(blob);
        const existingAsset = await repository.getAssetByHash(contentHash);
        const assetId = existingAsset?.id ?? crypto.randomUUID();
        const resolvedSettings = extractGenerationSettings(taskStatus.params);

        await repository.upsertConversation({
          id: conversationRecord.id,
          title: conversationRecord.title,
          createdAt: conversationRecord.createdAt,
          updatedAt: taskStatus.createdAt,
        });
        if (!existingAsset) {
          await repository.upsertAsset({
            id: assetId,
            conversationId,
            messageId: assistantMessageId,
            contentHash,
            blob,
            mimeType: taskStatus.image.mimeType,
            width: taskStatus.image.width,
            height: taskStatus.image.height,
            createdAt: taskStatus.createdAt,
          });
        }
        await repository.upsertMessage({
          id: assistantMessageId,
          conversationId,
          role: "assistant",
          status: "completed",
          prompt: taskStatus.params.prompt,
          settings: resolvedSettings,
          assetId,
          referenceAssetId: assistantMessage?.referenceAssetId,
          remoteTaskId: undefined,
          createdAt: assistantMessage?.createdAt ?? taskStatus.createdAt,
          updatedAt: taskStatus.createdAt,
        });

        if (successToast) {
          toast.success("图片生成完成");
        }

        await syncConversationState(activeConversationIdRef.current ?? undefined);
        return true;
      }

      if (taskStatus.status !== "failed") {
        return false;
      }

      await repository.upsertConversation({
        id: conversationRecord.id,
        title: conversationRecord.title,
        createdAt: conversationRecord.createdAt,
        updatedAt: taskStatus.createdAt,
      });
      await repository.upsertMessage({
        id: assistantMessageId,
        conversationId,
        role: "assistant",
        status: "failed",
        prompt: assistantMessage?.prompt ?? "",
        settings: extractGenerationSettings(assistantMessage?.settings),
        referenceAssetId: assistantMessage?.referenceAssetId,
        errorMessage: taskStatus.error.message,
        remoteTaskId: undefined,
        createdAt: assistantMessage?.createdAt ?? taskStatus.createdAt,
        updatedAt: taskStatus.createdAt,
      });
      toast.error(taskStatus.error.message);

      await syncConversationState(activeConversationIdRef.current ?? undefined);
      return true;
    },
    [syncConversationState]
  );

  const markPendingTaskAsFailed = useCallback(
    async ({
      conversationId,
      assistantMessageId,
      errorMessage,
      prompt,
      settings: failureSettings,
      updatedAt,
    }: {
      conversationId: string;
      assistantMessageId: string;
      errorMessage: string;
      prompt: string;
      settings: GenerationSettings;
      updatedAt?: string;
    }) => {
      const repository = repositoryRef.current;
      const detail = await repository.getConversationDetail(conversationId);
      const assistantMessage = detail?.messages.find(
        (message) => message.id === assistantMessageId
      );
      const failedAt = updatedAt ?? new Date().toISOString();
      const conversationRecord = detail?.conversation ?? {
        id: conversationId,
        title: buildConversationTitle(prompt),
        createdAt: failedAt,
        updatedAt: failedAt,
        messageCount: detail?.messages.length ?? 0,
      };

      await repository.upsertConversation({
        id: conversationRecord.id,
        title: conversationRecord.title,
        createdAt: conversationRecord.createdAt,
        updatedAt: failedAt,
      });
      await repository.upsertMessage({
        id: assistantMessageId,
        conversationId,
        role: "assistant",
        status: "failed",
        prompt,
        settings: extractGenerationSettings(assistantMessage?.settings ?? failureSettings),
        referenceAssetId: assistantMessage?.referenceAssetId,
        errorMessage,
        remoteTaskId: undefined,
        createdAt: assistantMessage?.createdAt ?? failedAt,
        updatedAt: failedAt,
      });
      await syncConversationState(activeConversationIdRef.current ?? undefined);
    },
    [syncConversationState]
  );

  const pollTaskUntilSettled = useCallback(
    async ({
      taskId,
      conversationId,
      assistantMessageId,
      prompt,
      settings: pendingSettings,
      successToast = true,
    }: {
      taskId: string;
      conversationId: string;
      assistantMessageId: string;
      prompt: string;
      settings: GenerationSettings;
      successToast?: boolean;
    }) => {
      if (!taskId || pollingTaskIdsRef.current.has(taskId)) {
        return;
      }

      pollingTaskIdsRef.current.add(taskId);
      let failedPollCount = 0;

      try {
        while (!isDisposedRef.current) {
          try {
            const completed = await completePendingTask({
              taskId,
              conversationId,
              assistantMessageId,
              successToast,
            });

            if (completed) {
              return;
            }

            failedPollCount = 0;
          } catch (error) {
            failedPollCount += 1;

            if (
              error instanceof ImageGenerationRequestError &&
              error.code === "task_not_found"
            ) {
              await markPendingTaskAsFailed({
                conversationId,
                assistantMessageId,
                errorMessage: "任务不存在或已过期，请重新生成。",
                prompt,
                settings: pendingSettings,
              });
              toast.error("任务不存在或已过期，请重新生成。");
              return;
            }

            if (failedPollCount >= MAX_TASK_POLL_ERRORS) {
              const message =
                error instanceof ImageGenerationRequestError
                  ? error.message
                  : "无法同步图片生成状态，请稍后重试。";

              await markPendingTaskAsFailed({
                conversationId,
                assistantMessageId,
                errorMessage: message,
                prompt,
                settings: pendingSettings,
              });
              toast.error(message);
              return;
            }
          }

          await sleep(TASK_POLL_INTERVAL_MS);
        }
      } finally {
        pollingTaskIdsRef.current.delete(taskId);
      }
    },
    [completePendingTask, markPendingTaskAsFailed]
  );

  useEffect(() => {
    isDisposedRef.current = false;

    fetchImageChatPublicKey()
      .then((response) => {
        setPublicKeyResponse(response);
        setPublicKeyStatus("ready");
      })
      .catch((error) => {
        console.error(error);
        setPublicKeyStatus("error");
        toast.error("无法获取加密公钥，请稍后刷新页面重试。");
      });

    syncConversationState()
      .then(async () => {
        const pendingMessages =
          await repositoryRef.current.listPendingAssistantMessages();

        pendingMessages.forEach((message) => {
          if (!message.remoteTaskId) {
            return;
          }

          void pollTaskUntilSettled({
            taskId: message.remoteTaskId,
            conversationId: message.conversationId,
            assistantMessageId: message.id,
            prompt: message.prompt,
            settings: extractGenerationSettings(message.settings),
            successToast: false,
          });
        });
      })
      .catch((error) => {
        console.error(error);
        toast.error("初始化本地会话失败，请刷新页面重试。");
      })
      .finally(() => {
        if (!isDisposedRef.current) {
          setIsBootstrapping(false);
        }
      });

    return () => {
      isDisposedRef.current = true;
      clearReferenceImage();
      revokeMessageObjectUrls();
      revokeGalleryObjectUrls();
    };
  }, [
    clearReferenceImage,
    pollTaskUntilSettled,
    revokeGalleryObjectUrls,
    revokeMessageObjectUrls,
    syncConversationState,
  ]);

  useEffect(() => {
    if (rememberProviderConfig) {
      persistProviderConfigPreference({
        remember: true,
        config: connectionConfig,
      });
      return;
    }

    clearPersistedProviderConfig();
  }, [connectionConfig, rememberProviderConfig]);

  const updateSettings = useCallback((nextSettings: GenerationSettings) => {
    setSettings(nextSettings);
    setStorageValue(
      GENERATION_SETTINGS_STORAGE_KEY,
      JSON.stringify(nextSettings)
    );
  }, []);

  const updateConnectionConfig = useCallback(
    (nextConnectionConfig: ProviderConnectionConfig) => {
      setConnectionConfig(nextConnectionConfig);
    },
    []
  );

  const updateRememberProviderConfig = useCallback((remember: boolean) => {
    setRememberProviderConfig(remember);
  }, []);

  const useReferenceImage = useCallback(
    (messageId: string) => {
      const currentConversation = activeConversation;

      if (!currentConversation) {
        return;
      }

      const assistantMessage = currentConversation.messages.find(
        (message) =>
          message.id === messageId &&
          message.role === "assistant" &&
          message.status === "completed" &&
          Boolean(message.assetId)
      );

      if (!assistantMessage?.assetId) {
        return;
      }

      const asset = currentConversation.assets.find(
        (candidate) => candidate.id === assistantMessage.assetId
      );

      if (!asset) {
        toast.error("这张图片暂时无法作为参考图，请稍后重试。");
        return;
      }

      if (referenceObjectUrlRef.current) {
        URL.revokeObjectURL(referenceObjectUrlRef.current);
      }

      const objectUrl = URL.createObjectURL(asset.blob);
      referenceObjectUrlRef.current = objectUrl;

      setSelectedReferenceImage({
        assetId: asset.id,
        messageId,
        prompt: assistantMessage.prompt,
        image: {
          src: objectUrl,
          mimeType: asset.mimeType,
          width: asset.width,
          height: asset.height,
        },
      });
      toast.success("已设为参考图，下一条提示词会基于它继续生成");
    },
    [activeConversation]
  );

  const startNewConversation = useCallback(async () => {
    clearReferenceImage();
    activeConversationIdRef.current = null;
    setActiveConversationId(null);
    setActiveConversation(null);
    await hydrateRenderedMessages(null);
    setStorageValue(ACTIVE_CONVERSATION_STORAGE_KEY, null);
  }, [clearReferenceImage, hydrateRenderedMessages]);

  const selectConversation = useCallback(
    async (conversationId: string) => {
      clearReferenceImage();
      await syncConversationState(conversationId);
    },
    [clearReferenceImage, syncConversationState]
  );

  const deleteConversation = useCallback(
    async (conversationId: string) => {
      const repository = repositoryRef.current;

      clearReferenceImage();
      await repository.deleteConversation(conversationId);

      const summaries = await repository.listConversationSummaries();
      const nextConversationId =
        activeConversationIdRef.current === conversationId
          ? summaries[0]?.id ?? null
          : activeConversationIdRef.current;

      await syncConversationState(nextConversationId);
      toast.success("会话已删除");
    },
    [clearReferenceImage, syncConversationState]
  );

  const toggleConversationPinned = useCallback(
    async (conversationId: string, pinned: boolean) => {
      const repository = repositoryRef.current;

      await repository.toggleConversationPinned(conversationId, pinned);
      await syncConversationState(activeConversationIdRef.current ?? undefined);
      toast.success(pinned ? "会话已置顶" : "已取消置顶");
    },
    [syncConversationState]
  );

  const submitPrompt = useCallback(
    async (
      prompt: string,
      requestSettings?: GenerationSettings,
      referenceAssetId?: string
    ) => {
      const repository = repositoryRef.current;
      const normalizedPrompt = prompt.trim();
      const appliedSettings = requestSettings ?? settings;
      const resolvedReferenceAssetId =
        referenceAssetId ?? selectedReferenceImage?.assetId;
      const hasConnectionConfig =
        connectionConfig.apiKey.trim().length > 0 &&
        connectionConfig.baseUrl.trim().length > 0 &&
        connectionConfig.model.trim().length > 0;

      if (!normalizedPrompt || isSubmitting) {
        return;
      }

      if (!hasConnectionConfig) {
        toast.error("请先填写 API Key、Base URL 和模型。");
        return;
      }

      if (!publicKeyResponse || publicKeyStatus !== "ready") {
        toast.error("当前无法获取加密公钥，请稍后重试。");
        return;
      }

      const referenceAsset = resolvedReferenceAssetId
        ? activeConversation?.assets.find(
            (asset) => asset.id === resolvedReferenceAssetId
          )
        : undefined;

      if (resolvedReferenceAssetId && !referenceAsset) {
        toast.error("参考图不可用，请重新选择后再试。");
        return;
      }

      setIsSubmitting(true);

      const now = new Date().toISOString();
      const conversationId = activeConversationId ?? crypto.randomUUID();
      const existingConversation = activeConversation?.conversation;
      const conversationCreatedAt = existingConversation?.createdAt ?? now;
      const conversationTitle =
        existingConversation?.title ?? buildConversationTitle(normalizedPrompt);
      const userMessageId = crypto.randomUUID();
      const assistantMessageId = crypto.randomUUID();
      const referenceImage = referenceAsset
        ? {
            b64: await blobToBase64(referenceAsset.blob),
            mimeType: referenceAsset.mimeType,
          }
        : undefined;

      const baseConversation = {
        id: conversationId,
        title: conversationTitle,
        createdAt: conversationCreatedAt,
        updatedAt: now,
      };

      await repository.upsertConversation(baseConversation);
      await repository.upsertMessage({
        id: userMessageId,
        conversationId,
        role: "user",
        status: "completed",
        prompt: normalizedPrompt,
        createdAt: now,
        updatedAt: now,
      });
      await repository.upsertMessage({
        id: assistantMessageId,
        conversationId,
        role: "assistant",
        status: "pending",
        prompt: normalizedPrompt,
        settings: appliedSettings,
        referenceAssetId: resolvedReferenceAssetId,
        remoteTaskId: undefined,
        createdAt: now,
        updatedAt: now,
      });

      await syncConversationState(conversationId);

      try {
        const task = await createImageGenerationTask(
          {
            prompt: normalizedPrompt,
            ...appliedSettings,
            ...(referenceImage ? { referenceImage } : {}),
          },
          connectionConfig,
          publicKeyResponse
        );

        await repository.upsertMessage({
          id: assistantMessageId,
          conversationId,
          role: "assistant",
          status: "pending",
          prompt: normalizedPrompt,
          settings: appliedSettings,
          referenceAssetId: resolvedReferenceAssetId,
          remoteTaskId: task.taskId,
          createdAt: now,
          updatedAt: task.createdAt,
        });
        await repository.upsertConversation({
          ...baseConversation,
          updatedAt: task.createdAt,
        });
        await syncConversationState(conversationId);

        toast.success("生成任务已提交，正在后台处理");

        void pollTaskUntilSettled({
          taskId: task.taskId,
          conversationId,
          assistantMessageId,
          prompt: normalizedPrompt,
          settings: appliedSettings,
        });
      } catch (error) {
        const message =
          error instanceof ImageGenerationRequestError
            ? error.message
            : "图片生成失败，请稍后重试。";
        const failedAt = new Date().toISOString();

        await repository.upsertConversation({
          ...baseConversation,
          updatedAt: failedAt,
        });
        await repository.upsertMessage({
          id: assistantMessageId,
          conversationId,
          role: "assistant",
          status: "failed",
          prompt: normalizedPrompt,
          settings: appliedSettings,
          referenceAssetId: resolvedReferenceAssetId,
          errorMessage: message,
          remoteTaskId: undefined,
          createdAt: now,
          updatedAt: failedAt,
        });

        await syncConversationState(conversationId);
        toast.error(message);
      } finally {
        setIsSubmitting(false);
      }
    },
    [
      activeConversation?.conversation,
      activeConversation?.assets,
      activeConversationId,
      connectionConfig,
      isSubmitting,
      pollTaskUntilSettled,
      publicKeyResponse,
      publicKeyStatus,
      selectedReferenceImage?.assetId,
      settings,
      syncConversationState,
    ]
  );

  const activeAssistantMessages = useMemo(
    () =>
      renderedMessages.filter(
        (message): message is RenderedAssistantMessage =>
          message.role === "assistant"
      ),
    [renderedMessages]
  );

  const copyPrompt = useCallback(
    async (messageId: string) => {
      const message = activeAssistantMessages.find(
        (candidate) => candidate.id === messageId
      );

      if (!message) {
        return;
      }

      await navigator.clipboard.writeText(message.prompt);
      toast.success("提示词已复制");
    },
    [activeAssistantMessages]
  );

  const downloadImage = useCallback(
    (messageId: string) => {
      const message = activeAssistantMessages.find(
        (candidate) => candidate.id === messageId
      ) ?? galleryImages.find((candidate) => candidate.messageId === messageId);

      if (!message?.image) {
        return;
      }

      const anchor = document.createElement("a");
      anchor.href = message.image.src;
      anchor.download = createDownloadFileName(message.prompt, message.settings);
      anchor.click();
      toast.success("下载已开始");
    },
    [activeAssistantMessages, galleryImages]
  );

  const regenerateMessage = useCallback(
    async (messageId: string) => {
      const message = activeAssistantMessages.find(
        (candidate) => candidate.id === messageId
      );

      if (!message) {
        return;
      }

      await submitPrompt(
        message.prompt,
        message.settings,
        message.referenceAssetId
      );
    },
    [activeAssistantMessages, submitPrompt]
  );

  const hasConnectionConfig = useMemo(
    () =>
      connectionConfig.apiKey.trim().length > 0 &&
      connectionConfig.baseUrl.trim().length > 0 &&
      connectionConfig.model.trim().length > 0,
    [connectionConfig]
  );

  return {
    conversations,
    activeConversationId,
    activeConversation,
    renderedMessages,
    galleryImages,
    selectedReferenceImage,
    settings,
    connectionConfig,
    rememberProviderConfig,
    publicKeyStatus,
    canSubmit:
      publicKeyStatus === "ready" && hasConnectionConfig && !isBootstrapping,
    isBootstrapping,
    isSubmitting,
    updateSettings,
    updateConnectionConfig,
    updateRememberProviderConfig,
    startNewConversation,
    selectConversation,
    deleteConversation,
    toggleConversationPinned,
    clearReferenceImage,
    submitPrompt,
    copyPrompt,
    downloadImage,
    regenerateMessage,
    useReferenceImage,
  };
}
