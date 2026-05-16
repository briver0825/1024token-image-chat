"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import {
  createMarketItem,
  createImageGenerationTask,
  fetchImageChatPublicKey,
  fetchImageGenerationTaskStatus,
  ImageGenerationRequestError,
} from "@/lib/image-chat/client";
import { computeBlobSha256 } from "@/lib/image-chat/asset-dedup";
import {
  DEFAULT_GENERATION_SETTINGS,
  normalizeGenerationSettings,
} from "@/lib/image-chat/generation-settings";
import {
  clearPersistedProviderConfig,
  loadPersistedProviderConfigPreference,
  persistProviderConfigPreference,
} from "@/lib/image-chat/provider-config-persistence";
import { createImageChatRepository } from "@/lib/image-chat/repository";
import { MAX_REFERENCE_IMAGES } from "@/lib/image-chat/types";
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
import { createUuid } from "@/lib/shared/uuid";

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
  referenceAssetIds?: string[];
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
  referenceImages?: Array<{
    src: string;
    mimeType: string;
    width: number;
    height: number;
  }>;
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
  id: string;
  assetId?: string;
  messageId?: string;
  prompt: string;
  blob: Blob;
  image: {
    src: string;
    mimeType: string;
    width: number;
    height: number;
  };
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

function normalizeReferenceAssetIds(referenceAssetIds?: string | string[]) {
  if (!referenceAssetIds) {
    return [];
  }

  return Array.isArray(referenceAssetIds) ? referenceAssetIds : [referenceAssetIds];
}

function getMessageReferenceAssetIds(message: Pick<MessageRecord, "referenceAssetId" | "referenceAssetIds">) {
  return [
    ...(message.referenceAssetIds ?? []),
    ...(message.referenceAssetId && !message.referenceAssetIds?.includes(message.referenceAssetId)
      ? [message.referenceAssetId]
      : []),
  ];
}

function isSupportedReferenceImage(file: File) {
  return /^image\/(png|jpeg|webp)$/i.test(file.type);
}

function readImageDimensions(src: string) {
  return new Promise<{ width: number; height: number }>((resolve, reject) => {
    const image = new Image();

    image.onload = () => {
      resolve({
        width: image.naturalWidth || image.width,
        height: image.naturalHeight || image.height,
      });
    };
    image.onerror = () => reject(new Error("Unable to load reference image."));
    image.src = src;
  });
}

function extractGenerationSettings(settings: Partial<GenerationSettings> | undefined) {
  return normalizeGenerationSettings(settings);
}

export function useImageChat() {
  const repositoryRef = useRef(createImageChatRepository());
  const messageObjectUrlsRef = useRef<string[]>([]);
  const galleryObjectUrlsRef = useRef<string[]>([]);
  const referenceObjectUrlsRef = useRef(new Map<string, string>());
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
  const [selectedReferenceImages, setSelectedReferenceImages] = useState<
    ComposerReferenceImage[]
  >([]);
  const [settings, setSettings] = useState<GenerationSettings>(() => {
    return DEFAULT_GENERATION_SETTINGS;
  });
  const [rememberProviderConfig, setRememberProviderConfig] = useState(
    false
  );
  const [connectionConfig, setConnectionConfig] = useState<ProviderConnectionConfig>(
    DEFAULT_PROVIDER_CONNECTION_CONFIG
  );
  const [hasLoadedBrowserPreferences, setHasLoadedBrowserPreferences] =
    useState(false);
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
    referenceObjectUrlsRef.current.forEach((objectUrl) => {
      URL.revokeObjectURL(objectUrl);
    });
    referenceObjectUrlsRef.current.clear();
    setSelectedReferenceImages([]);
  }, []);

  const removeReferenceImage = useCallback((referenceId: string) => {
    const objectUrl = referenceObjectUrlsRef.current.get(referenceId);

    if (objectUrl) {
      URL.revokeObjectURL(objectUrl);
      referenceObjectUrlsRef.current.delete(referenceId);
    }

    setSelectedReferenceImages((current) =>
      current.filter((referenceImage) => referenceImage.id !== referenceId)
    );
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
        const referenceAssetIds = getMessageReferenceAssetIds(message);
        const referenceAssets = referenceAssetIds
          .map((referenceAssetId) => assetsById.get(referenceAssetId))
          .filter((asset): asset is ImageAssetRecord => Boolean(asset));
        const objectUrl = asset ? URL.createObjectURL(asset.blob) : undefined;
        const referenceImages = referenceAssets.map((referenceAsset) => {
          const referenceObjectUrl = URL.createObjectURL(referenceAsset.blob);

          nextObjectUrls.push(referenceObjectUrl);

          return {
            src: referenceObjectUrl,
            mimeType: referenceAsset.mimeType,
            width: referenceAsset.width,
            height: referenceAsset.height,
          };
        });

        if (objectUrl) {
          nextObjectUrls.push(objectUrl);
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
          referenceAssetIds,
          errorMessage: message.errorMessage,
          image: asset
            ? {
                src: objectUrl!,
                mimeType: asset.mimeType,
                width: asset.width,
                height: asset.height,
              }
            : undefined,
          referenceImage: referenceImages[0],
          referenceImages: referenceImages.length > 0 ? referenceImages : undefined,
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
        const referenceAssetIds = assistantMessage
          ? getMessageReferenceAssetIds(assistantMessage)
          : [];
        const blob = base64ToBlob(
          taskStatus.image.b64,
          taskStatus.image.mimeType
        );
        const contentHash = await computeBlobSha256(blob);
        const existingAsset = await repository.getAssetByHash(contentHash);
        const assetId = existingAsset?.id ?? createUuid();
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
          referenceAssetId: referenceAssetIds[0],
          referenceAssetIds:
            referenceAssetIds.length > 0 ? referenceAssetIds : undefined,
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

      const referenceAssetIds = assistantMessage
        ? getMessageReferenceAssetIds(assistantMessage)
        : [];

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
        referenceAssetId: referenceAssetIds[0],
        referenceAssetIds:
          referenceAssetIds.length > 0 ? referenceAssetIds : undefined,
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
      const referenceAssetIds = assistantMessage
        ? getMessageReferenceAssetIds(assistantMessage)
        : [];
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
        referenceAssetId: referenceAssetIds[0],
        referenceAssetIds:
          referenceAssetIds.length > 0 ? referenceAssetIds : undefined,
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
    let isCancelled = false;

    queueMicrotask(() => {
      if (isCancelled) {
        return;
      }

      const savedSettings = getStorageValue(GENERATION_SETTINGS_STORAGE_KEY);

      if (savedSettings) {
        try {
          const parsed = JSON.parse(savedSettings) as GenerationSettings;

          setSettings(normalizeGenerationSettings(parsed));
        } catch {
          setSettings(DEFAULT_GENERATION_SETTINGS);
        }
      }

      const persistedProviderPreference = loadPersistedProviderConfigPreference();

      setRememberProviderConfig(persistedProviderPreference.remember);
      setConnectionConfig(persistedProviderPreference.config);
      setHasLoadedBrowserPreferences(true);
    });

    return () => {
      isCancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!hasLoadedBrowserPreferences) {
      return;
    }

    if (rememberProviderConfig) {
      persistProviderConfigPreference({
        remember: true,
        config: connectionConfig,
      });
      return;
    }

    clearPersistedProviderConfig();
  }, [connectionConfig, hasLoadedBrowserPreferences, rememberProviderConfig]);

  const updateSettings = useCallback((nextSettings: GenerationSettings) => {
    const normalizedSettings = normalizeGenerationSettings(nextSettings);

    setSettings(normalizedSettings);
    setStorageValue(
      GENERATION_SETTINGS_STORAGE_KEY,
      JSON.stringify(normalizedSettings)
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

  const addReferenceImageFiles = useCallback(
    async (files: File[]) => {
      const supportedFiles = files.filter(isSupportedReferenceImage);
      const availableSlots = MAX_REFERENCE_IMAGES - selectedReferenceImages.length;

      if (files.length > supportedFiles.length) {
        toast.error("参考图仅支持 PNG、JPEG 或 WebP。");
      }

      if (availableSlots <= 0) {
        toast.error(`最多只能选择 ${MAX_REFERENCE_IMAGES} 张参考图。`);
        return;
      }

      const filesToAdd = supportedFiles.slice(0, availableSlots);

      if (supportedFiles.length > availableSlots) {
        toast.error(`最多只能选择 ${MAX_REFERENCE_IMAGES} 张参考图。`);
      }

      const additions: ComposerReferenceImage[] = [];

      for (const file of filesToAdd) {
        const referenceId = createUuid();
        const objectUrl = URL.createObjectURL(file);

        try {
          const dimensions = await readImageDimensions(objectUrl);

          referenceObjectUrlsRef.current.set(referenceId, objectUrl);
          additions.push({
            id: referenceId,
            prompt: file.name || "上传参考图",
            blob: file,
            image: {
              src: objectUrl,
              mimeType: file.type,
              width: dimensions.width,
              height: dimensions.height,
            },
          });
        } catch {
          URL.revokeObjectURL(objectUrl);
          toast.error(`无法读取参考图：${file.name || "未命名图片"}`);
        }
      }

      if (additions.length === 0) {
        return;
      }

      setSelectedReferenceImages((current) => [...current, ...additions]);
      toast.success(`已添加 ${additions.length} 张参考图`);
    },
    [selectedReferenceImages.length]
  );

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

      if (
        selectedReferenceImages.some(
          (referenceImage) => referenceImage.assetId === asset.id
        )
      ) {
        toast.error("这张图片已经在参考图中。");
        return;
      }

      if (selectedReferenceImages.length >= MAX_REFERENCE_IMAGES) {
        toast.error(`最多只能选择 ${MAX_REFERENCE_IMAGES} 张参考图。`);
        return;
      }

      const objectUrl = URL.createObjectURL(asset.blob);
      referenceObjectUrlsRef.current.set(asset.id, objectUrl);

      setSelectedReferenceImages((current) => [
        ...current,
        {
          id: asset.id,
          assetId: asset.id,
          messageId,
          prompt: assistantMessage.prompt,
          blob: asset.blob,
          image: {
            src: objectUrl,
            mimeType: asset.mimeType,
            width: asset.width,
            height: asset.height,
          },
        },
      ]);
      toast.success("已添加到参考图，下一条提示词会基于它继续生成");
    },
    [activeConversation, selectedReferenceImages]
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
      referenceAssetIds?: string | string[]
    ) => {
      const repository = repositoryRef.current;
      const normalizedPrompt = prompt.trim();
      const appliedSettings = requestSettings ?? settings;
      const explicitReferenceAssetIds =
        normalizeReferenceAssetIds(referenceAssetIds);
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

      const referenceInputs = explicitReferenceAssetIds.length
        ? explicitReferenceAssetIds.map((referenceAssetId) => {
            const asset = activeConversation?.assets.find(
              (candidate) => candidate.id === referenceAssetId
            );

            return asset
              ? {
                  assetId: asset.id,
                  blob: asset.blob,
                  mimeType: asset.mimeType,
                  width: asset.width,
                  height: asset.height,
                  createdAt: asset.createdAt,
                }
              : null;
          })
        : selectedReferenceImages.map((referenceImage) => ({
            assetId: referenceImage.assetId,
            blob: referenceImage.blob,
            mimeType: referenceImage.image.mimeType,
            width: referenceImage.image.width,
            height: referenceImage.image.height,
            createdAt: new Date().toISOString(),
          }));

      if (referenceInputs.some((referenceInput) => !referenceInput)) {
        toast.error("参考图不可用，请重新选择后再试。");
        return;
      }

      if (referenceInputs.length > MAX_REFERENCE_IMAGES) {
        toast.error(`最多只能选择 ${MAX_REFERENCE_IMAGES} 张参考图。`);
        return;
      }

      const resolvedReferenceInputs = referenceInputs.filter(
        (referenceInput): referenceInput is NonNullable<typeof referenceInput> =>
          Boolean(referenceInput)
      );

      setIsSubmitting(true);

      const now = new Date().toISOString();
      const assistantCreatedAt = new Date(Date.parse(now) + 1).toISOString();
      const conversationId = activeConversationId ?? createUuid();
      const existingConversation = activeConversation?.conversation;
      const conversationCreatedAt = existingConversation?.createdAt ?? now;
      const conversationTitle =
        existingConversation?.title ?? buildConversationTitle(normalizedPrompt);
      const userMessageId = createUuid();
      const assistantMessageId = createUuid();
      const resolvedReferenceAssetIds = resolvedReferenceInputs.map(
        (referenceInput) => referenceInput.assetId ?? createUuid()
      );
      const referenceImages = await Promise.all(
        resolvedReferenceInputs.map(async (referenceInput) => ({
          b64: await blobToBase64(referenceInput.blob),
          mimeType: referenceInput.mimeType,
        }))
      );

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
        referenceAssetId: resolvedReferenceAssetIds[0],
        referenceAssetIds:
          resolvedReferenceAssetIds.length > 0
            ? resolvedReferenceAssetIds
            : undefined,
        remoteTaskId: undefined,
        createdAt: assistantCreatedAt,
        updatedAt: assistantCreatedAt,
      });
      await Promise.all(
        resolvedReferenceInputs.map((referenceInput, index) => {
          if (referenceInput.assetId) {
            return Promise.resolve();
          }

          return repository.upsertAsset({
            id: resolvedReferenceAssetIds[index]!,
            conversationId,
            messageId: assistantMessageId,
            blob: referenceInput.blob,
            mimeType: referenceInput.mimeType,
            width: referenceInput.width,
            height: referenceInput.height,
            createdAt: now,
          });
        })
      );

      await syncConversationState(conversationId);
      if (
        explicitReferenceAssetIds.length === 0 &&
        selectedReferenceImages.length > 0
      ) {
        clearReferenceImage();
      }

      try {
        const task = await createImageGenerationTask(
          {
            prompt: normalizedPrompt,
            ...appliedSettings,
            ...(referenceImages.length > 0 ? { referenceImages } : {}),
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
          referenceAssetId: resolvedReferenceAssetIds[0],
          referenceAssetIds:
            resolvedReferenceAssetIds.length > 0
              ? resolvedReferenceAssetIds
              : undefined,
          remoteTaskId: task.taskId,
          createdAt: assistantCreatedAt,
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
          referenceAssetId: resolvedReferenceAssetIds[0],
          referenceAssetIds:
            resolvedReferenceAssetIds.length > 0
              ? resolvedReferenceAssetIds
              : undefined,
          errorMessage: message,
          remoteTaskId: undefined,
          createdAt: assistantCreatedAt,
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
      clearReferenceImage,
      connectionConfig,
      isSubmitting,
      pollTaskUntilSettled,
      publicKeyResponse,
      publicKeyStatus,
      selectedReferenceImages,
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
        message.referenceAssetIds ?? message.referenceAssetId
      );
    },
    [activeAssistantMessages, submitPrompt]
  );

  const publishMessageToMarket = useCallback(
    async (messageId: string) => {
      const message = activeAssistantMessages.find(
        (candidate) => candidate.id === messageId
      );

      if (!message?.assetId) {
        toast.error("这张图片暂时无法提交到焚决市场。");
        return;
      }

      const asset = activeConversation?.assets.find(
        (candidate) => candidate.id === message.assetId
      );

      if (!asset) {
        toast.error("这张图片暂时无法提交到焚决市场。");
        return;
      }

      try {
        await createMarketItem({
          prompt: message.prompt,
          settings: message.settings,
          model: connectionConfig.model,
          image: asset.blob,
          width: asset.width,
          height: asset.height,
        });
        toast.success("已提交到焚决市场");
      } catch (error) {
        const message =
          error instanceof ImageGenerationRequestError
            ? error.message
            : "提交焚决市场失败，请稍后再试。";

        toast.error(message);
      }
    },
    [activeAssistantMessages, activeConversation?.assets, connectionConfig.model]
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
    selectedReferenceImage: selectedReferenceImages[0] ?? null,
    selectedReferenceImages,
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
    removeReferenceImage,
    addReferenceImageFiles,
    submitPrompt,
    copyPrompt,
    downloadImage,
    regenerateMessage,
    publishMessageToMarket,
    useReferenceImage,
  };
}
