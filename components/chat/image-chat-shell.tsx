"use client";

import Link from "next/link";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";

import {
  FlameIcon,
  ImagePlusIcon,
  ImagesIcon,
  PinIcon,
  PlusIcon,
  SearchIcon,
  Settings2Icon,
  SparklesIcon,
} from "lucide-react";

import { ChatComposer } from "@/components/chat/chat-composer";
import { ConversationListItem } from "@/components/chat/conversation-list-item";
import { ImageGalleryDialog } from "@/components/chat/image-gallery-dialog";
import {
  ImageMessageCard,
  type ImageMessageCardData,
} from "@/components/chat/image-message-card";
import { ParamsPanel } from "@/components/chat/params-panel";
import { ProviderConfigCard } from "@/components/chat/provider-config-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { Skeleton } from "@/components/ui/skeleton";
import { useImageChat } from "@/hooks/use-image-chat";
import { filterConversationsByQuery } from "@/lib/image-chat/conversation-filter";
import { MARKET_DRAFT_STORAGE_KEY } from "@/lib/image-chat/market-draft";
import type {
  ConversationSummaryRecord,
  MarketDraft,
} from "@/lib/image-chat/types";
import { formatTimestamp } from "@/lib/image-chat/utils";

function UserPromptCard({
  prompt,
  createdAt,
}: {
  prompt: string;
  createdAt: string;
}) {
  return (
    <div className="flex justify-end">
      <Card className="max-w-3xl border-border/60 bg-primary/10 p-4 shadow-lg shadow-black/10">
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <Badge className="rounded-full bg-primary text-primary-foreground">
              你的提示词
            </Badge>
            <span className="text-sm text-muted-foreground">
              {formatTimestamp(createdAt)}
            </span>
          </div>
          <p className="whitespace-pre-wrap text-sm leading-6 text-foreground">
            {prompt}
          </p>
        </div>
      </Card>
    </div>
  );
}

function EmptyState() {
  return (
    <Card className="border-border/60 bg-card/80 p-10 text-center shadow-xl shadow-black/10">
      <div className="mx-auto flex max-w-xl flex-col items-center gap-4">
        <div className="rounded-2xl bg-primary/15 p-4 text-primary">
          <ImagePlusIcon className="size-8" />
        </div>
        <div className="space-y-2">
          <h2 className="text-2xl font-semibold tracking-tight">
            用聊天方式生成你的第一张图片
          </h2>
          <p className="text-sm leading-6 text-muted-foreground">
            输入一句自然语言描述，例如“霓虹雨夜中的黑猫，电影感，写实摄影”，右侧参数可控制尺寸、质量和输出格式。
          </p>
        </div>
      </div>
    </Card>
  );
}

function LoadingState() {
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
      <Card className="border-border/60 bg-card/80 p-5 shadow-lg shadow-black/10">
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-sm text-primary">
            <SparklesIcon className="size-4" />
            正在恢复聊天工作台
          </div>
          <Skeleton className="h-6 w-1/3 rounded-full" />
          <Skeleton className="h-40 w-full rounded-3xl" />
          <Skeleton className="h-28 w-3/4 rounded-3xl" />
        </div>
      </Card>
      <Card className="border-border/60 bg-card/80 p-5 shadow-lg shadow-black/10">
        <div className="space-y-3">
          <Skeleton className="h-5 w-1/2" />
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
        </div>
      </Card>
    </div>
  );
}

function parseMarketDraft(value: string | null): MarketDraft | null {
  if (!value) {
    return null;
  }

  try {
    const parsed = JSON.parse(value) as Partial<MarketDraft>;

    if (!parsed.prompt || !parsed.settings) {
      return null;
    }

    return parsed as MarketDraft;
  } catch {
    return null;
  }
}

export function ImageChatShell() {
  const {
    conversations,
    activeConversationId,
    activeConversation,
    renderedMessages,
    galleryImages,
    selectedReferenceImages,
    settings,
    connectionConfig,
    rememberProviderConfig,
    publicKeyStatus,
    canSubmit,
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
  } = useImageChat();
  const [conversationQuery, setConversationQuery] = useState("");
  const [isGalleryOpen, setIsGalleryOpen] = useState(false);
  const [marketDraft, setMarketDraft] = useState<{
    key: string;
    prompt: string;
  } | null>(null);
  const [pendingDeleteConversation, setPendingDeleteConversation] =
    useState<ConversationSummaryRecord | null>(null);
  const [isDeletingConversation, setIsDeletingConversation] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const hasMessages = renderedMessages.length > 0;
  const latestMessageId = renderedMessages.at(-1)?.id;
  const filteredConversations = useMemo(
    () => filterConversationsByQuery(conversations, conversationQuery),
    [conversations, conversationQuery]
  );
  const pinnedConversationCount = useMemo(
    () => conversations.filter((conversation) => conversation.pinned).length,
    [conversations]
  );

  useEffect(() => {
    if (isBootstrapping || !hasMessages) {
      return;
    }

    queueMicrotask(() => {
      messagesEndRef.current?.scrollIntoView({
        behavior: "auto",
        block: "end",
      });
    });
  }, [activeConversationId, hasMessages, isBootstrapping, latestMessageId]);

  useEffect(() => {
    if (isBootstrapping) {
      return;
    }

    let isCancelled = false;

    queueMicrotask(() => {
      void (async () => {
        if (isCancelled) {
          return;
        }

        const draft = parseMarketDraft(
          window.localStorage.getItem(MARKET_DRAFT_STORAGE_KEY)
        );

        if (!draft) {
          return;
        }

        window.localStorage.removeItem(MARKET_DRAFT_STORAGE_KEY);
        await startNewConversation();

        if (isCancelled) {
          return;
        }

        updateSettings(draft.settings);
        setMarketDraft({
          key: draft.sourceMarketItemId ?? draft.createdAt,
          prompt: draft.prompt,
        });
      })();
    });

    return () => {
      isCancelled = true;
    };
  }, [isBootstrapping, startNewConversation, updateSettings]);

  const handleRequestDeleteConversation = (conversationId: string) => {
    const targetConversation =
      conversations.find((conversation) => conversation.id === conversationId) ??
      null;

    setPendingDeleteConversation(targetConversation);
  };

  const handleConfirmDeleteConversation = async () => {
    if (!pendingDeleteConversation || isDeletingConversation) {
      return;
    }

    setIsDeletingConversation(true);

    try {
      await deleteConversation(pendingDeleteConversation.id);
      setPendingDeleteConversation(null);
    } finally {
      setIsDeletingConversation(false);
    }
  };

  const handleJumpToConversation = async (
    conversationId: string,
    messageId: string
  ) => {
    setIsGalleryOpen(false);
    await selectConversation(conversationId);

    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        document
          .getElementById(`chat-message-${messageId}`)
          ?.scrollIntoView({
            behavior: "smooth",
            block: "center",
          });
      });
    });
  };

  return (
    <SidebarProvider
      defaultOpen
      style={{ "--sidebar-width": "18rem" } as CSSProperties}
    >
      <Dialog
        open={Boolean(pendingDeleteConversation)}
        onOpenChange={(open) => {
          if (!open && !isDeletingConversation) {
            setPendingDeleteConversation(null);
          }
        }}
      >
        <Sidebar
          className="border-r border-sidebar-border/70"
          collapsible="offcanvas"
        >
        <SidebarHeader className="gap-2 border-b border-sidebar-border/70 p-3">
          <div className="space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-sm font-medium text-sidebar-foreground">
                  <SparklesIcon className="size-4 text-primary" />
                  image-chat
                </div>
                <p className="text-xs leading-5 text-sidebar-foreground/70">
                  GPT 图片聊天生成器
                </p>
              </div>
              <Button
                type="button"
                size="sm"
                className="h-8 px-2.5"
                onClick={() => void startNewConversation()}
              >
                <PlusIcon className="size-4" />
                新建
              </Button>
            </div>
            <div className="space-y-2">
              <Button
                asChild
                type="button"
                variant="outline"
                size="sm"
                className="w-full justify-start border-sidebar-border/70 bg-sidebar-accent/30 text-sidebar-foreground hover:bg-sidebar-accent"
              >
                <Link href="/market">
                  <FlameIcon className="size-4 text-primary" />
                  焚决市场
                </Link>
              </Button>
              <div className="relative">
                <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-sidebar-foreground/45" />
                <Input
                  value={conversationQuery}
                  onChange={(event) => setConversationQuery(event.target.value)}
                  placeholder="搜索会话"
                  className="h-8 border-sidebar-border/70 bg-sidebar-accent/30 pl-8 text-sm"
                />
              </div>
              {pinnedConversationCount > 0 ? (
                <div className="flex items-center gap-1.5 text-[11px] text-sidebar-foreground/60">
                  <PinIcon className="size-3" />
                  已置顶 {pinnedConversationCount} 个会话
                </div>
              ) : null}
            </div>
          </div>
        </SidebarHeader>
        <SidebarContent className="p-2.5">
          <ScrollArea className="h-full pr-0.5">
            <div className="space-y-1.5">
              {conversations.length === 0 ? (
                <div className="rounded-xl border border-dashed border-sidebar-border/80 px-3.5 py-5 text-[13px] leading-5 text-sidebar-foreground/70">
                  还没有会话。发送第一条提示词后，这里会显示历史记录。
                </div>
              ) : filteredConversations.length === 0 ? (
                <div className="rounded-xl border border-dashed border-sidebar-border/80 px-3.5 py-5 text-[13px] leading-5 text-sidebar-foreground/70">
                  没有找到匹配“{conversationQuery.trim()}”的会话。
                </div>
              ) : (
                filteredConversations.map((conversation) => (
                  <ConversationListItem
                    key={conversation.id}
                    conversation={conversation}
                    active={conversation.id === activeConversationId}
                    onSelect={(conversationId) => void selectConversation(conversationId)}
                    onTogglePinned={(conversationId, pinned) =>
                      void toggleConversationPinned(conversationId, pinned)
                    }
                    onDelete={handleRequestDeleteConversation}
                  />
                ))
              )}
            </div>
          </ScrollArea>
        </SidebarContent>
        </Sidebar>

        <SidebarInset className="h-svh overflow-hidden bg-background">
          <div className="flex h-full min-h-0 flex-col overflow-hidden">
            <header className="border-b border-border/70 bg-background/90 backdrop-blur">
              <div className="flex flex-col gap-3 px-4 py-3 md:px-6 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0 flex items-start gap-3">
                  <SidebarTrigger className="mt-0.5 shrink-0" />
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="truncate whitespace-nowrap text-xs font-medium uppercase tracking-[0.16em] text-primary sm:text-sm sm:tracking-[0.24em]">
                      {connectionConfig.model || "GPT-IMAGE-2"}
                    </div>
                    <h1 className="truncate text-base font-semibold sm:text-lg">
                      聊天生图工作台
                    </h1>
                    <p className="truncate text-xs text-muted-foreground">
                      {activeConversation?.conversation.title ??
                        "新会话，等待你的第一条提示词"}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2 sm:flex-nowrap sm:justify-end">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setIsGalleryOpen(true)}
                  >
                    <ImagesIcon className="size-4" />
                    图片库
                    {galleryImages.length > 0 ? (
                      <Badge
                        variant="secondary"
                        className="ml-1 rounded-full px-1.5 py-0 text-[10px]"
                      >
                        {galleryImages.length}
                      </Badge>
                    ) : null}
                  </Button>
                  <Button asChild variant="outline">
                    <Link href="/market">
                      <FlameIcon className="size-4" />
                      焚决市场
                    </Link>
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => void startNewConversation()}
                  >
                    <PlusIcon className="size-4" />
                    新建会话
                  </Button>
                  <Sheet>
                    <SheetTrigger asChild>
                      <Button type="button" variant="outline" className="xl:hidden">
                        <Settings2Icon className="size-4" />
                        参数
                      </Button>
                    </SheetTrigger>
                    <SheetContent
                      side="right"
                      className="flex h-full w-full max-w-md flex-col border-l border-border/70 bg-background p-0"
                    >
                      <ScrollArea className="min-h-0 flex-1">
                        <div className="space-y-4 p-4">
                          <ProviderConfigCard
                            value={connectionConfig}
                            rememberConfig={rememberProviderConfig}
                            publicKeyStatus={publicKeyStatus}
                            onChange={updateConnectionConfig}
                            onRememberConfigChange={updateRememberProviderConfig}
                          />
                          <ParamsPanel value={settings} onChange={updateSettings} />
                        </div>
                      </ScrollArea>
                    </SheetContent>
                  </Sheet>
                </div>
              </div>
            </header>

            <div className="flex min-h-0 flex-1 overflow-hidden">
              <main className="flex min-h-0 flex-1 flex-col overflow-hidden">
                <ScrollArea className="min-h-0 flex-1">
                  <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-6 md:px-6">
                    {isBootstrapping ? (
                      <LoadingState />
                    ) : !hasMessages ? (
                      <EmptyState />
                    ) : (
                      renderedMessages.map((message) =>
                        message.role === "user" ? (
                          <div key={message.id} id={`chat-message-${message.id}`}>
                            <UserPromptCard
                              prompt={message.prompt}
                              createdAt={message.createdAt}
                            />
                          </div>
                        ) : (
                          <div key={message.id} id={`chat-message-${message.id}`}>
                            <ImageMessageCard
                              message={message as ImageMessageCardData}
                              onCopyPrompt={copyPrompt}
                              onDownload={downloadImage}
                              onUseAsReference={useReferenceImage}
                              onRegenerate={(messageId) =>
                                void regenerateMessage(messageId)
                              }
                              onPublishToMarket={(messageId) =>
                                void publishMessageToMarket(messageId)
                              }
                            />
                          </div>
                        )
                      )
                    )}
                    <div ref={messagesEndRef} aria-hidden="true" />
                  </div>
                </ScrollArea>

                <Separator />

                <div className="shrink-0 px-4 py-4 md:px-6">
                  <div className="mx-auto max-w-5xl">
                    <ChatComposer
                      canSubmit={canSubmit}
                      disabledHint="请先在右侧填写 API Key、Base URL 和模型，并等待公钥就绪。"
                      isSubmitting={isSubmitting}
                      referenceImages={selectedReferenceImages}
                      draftPrompt={marketDraft?.prompt}
                      draftPromptKey={marketDraft?.key}
                      onClearReferences={clearReferenceImage}
                      onRemoveReference={removeReferenceImage}
                      onUploadReferenceImages={addReferenceImageFiles}
                      onSubmit={(prompt) => submitPrompt(prompt)}
                    />
                  </div>
                </div>
              </main>

              <aside className="hidden min-h-0 w-[360px] flex-col border-l border-border/70 bg-background/70 xl:flex">
                <ScrollArea className="min-h-0 flex-1">
                  <div className="space-y-4 p-4">
                    <ProviderConfigCard
                      value={connectionConfig}
                      rememberConfig={rememberProviderConfig}
                      publicKeyStatus={publicKeyStatus}
                      onChange={updateConnectionConfig}
                      onRememberConfigChange={updateRememberProviderConfig}
                    />
                    <ParamsPanel value={settings} onChange={updateSettings} />
                  </div>
                </ScrollArea>
              </aside>
            </div>
          </div>
        </SidebarInset>

        <ImageGalleryDialog
          open={isGalleryOpen}
          items={galleryImages}
          onOpenChange={setIsGalleryOpen}
          onDownload={downloadImage}
          onJumpToConversation={(conversationId, messageId) =>
            void handleJumpToConversation(conversationId, messageId)
          }
        />

        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>删除这个会话？</DialogTitle>
            <DialogDescription>
              {pendingDeleteConversation
                ? `会同时移除“${pendingDeleteConversation.title}”的消息和图片，本地历史无法恢复。`
                : "会同时移除该会话的消息和图片，本地历史无法恢复。"}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={isDeletingConversation}
              onClick={() => setPendingDeleteConversation(null)}
            >
              取消
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={isDeletingConversation}
              onClick={() => void handleConfirmDeleteConversation()}
            >
              {isDeletingConversation ? "删除中..." : "确认删除"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SidebarProvider>
  );
}
