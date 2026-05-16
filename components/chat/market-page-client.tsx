"use client";

/* eslint-disable @next/next/no-img-element */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import {
  ArrowLeftIcon,
  DownloadIcon,
  FlameIcon,
  Loader2Icon,
  Maximize2Icon,
  RefreshCwIcon,
  SparklesIcon,
  Trash2Icon,
} from "lucide-react";
import Lightbox from "yet-another-react-lightbox";
import Zoom from "yet-another-react-lightbox/plugins/zoom";
import { toast } from "sonner";

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
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  createMarketDraft,
  MARKET_DRAFT_STORAGE_KEY,
} from "@/lib/image-chat/market-draft";
import { formatGenerationSettings } from "@/lib/image-chat/generation-settings";
import type { MarketItemResponse } from "@/lib/image-chat/types";
import { formatTimestamp } from "@/lib/image-chat/utils";

const MARKET_ADMIN_TOKEN_STORAGE_KEY = "image-chat.market-admin-token";

type MarketPageClientProps = {
  initialItems: MarketItemResponse[];
  initialNextCursor: string | null;
};

type MarketListResponse = {
  items: MarketItemResponse[];
  nextCursor: string | null;
};

function formatSettings(item: MarketItemResponse) {
  return formatGenerationSettings(item.settings);
}

async function parseMarketListResponse(response: Response) {
  const body = (await response.json()) as MarketListResponse | {
    error?: {
      message?: string;
    };
  };

  if (!response.ok) {
    throw new Error(
      "error" in body && body.error?.message
        ? body.error.message
        : "加载焚决市场失败。"
    );
  }

  return body as MarketListResponse;
}

export function MarketPageClient({
  initialItems,
  initialNextCursor,
}: MarketPageClientProps) {
  const router = useRouter();
  const [items, setItems] = useState(initialItems);
  const [nextCursor, setNextCursor] = useState(initialNextCursor);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isDeleteMode, setIsDeleteMode] = useState(false);
  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(
    () => new Set()
  );
  const [isDeletingSelected, setIsDeletingSelected] = useState(false);
  const [previewIndex, setPreviewIndex] = useState<number>(-1);
  const [promptDetailItem, setPromptDetailItem] =
    useState<MarketItemResponse | null>(null);
  const previewSlides = useMemo(
    () =>
      items.map((item) => ({
        src: item.image.url,
        alt: item.prompt,
        width: item.image.width,
        height: item.image.height,
      })),
    [items]
  );

  const handleUsePrompt = (item: MarketItemResponse) => {
    window.localStorage.setItem(
      MARKET_DRAFT_STORAGE_KEY,
      JSON.stringify(
        createMarketDraft({
          prompt: item.prompt,
          settings: item.settings,
          sourceMarketItemId: item.id,
          ...(item.model ? { model: item.model } : {}),
        })
      )
    );
    toast.success("已带入提示词，回到首页后可修改再生成");
    router.push("/");
  };

  const handleCopyPrompt = async (item: MarketItemResponse) => {
    try {
      if (!navigator.clipboard?.writeText) {
        throw new Error("clipboard_unavailable");
      }

      await navigator.clipboard.writeText(item.prompt);
      toast.success("提示词已复制");
    } catch {
      toast.error("复制失败，请手动选择提示词复制。");
    }
  };

  const handleLoadMore = async () => {
    if (!nextCursor || isLoadingMore) {
      return;
    }

    setIsLoadingMore(true);

    try {
      const response = await fetch(
        `/api/image-chat/market?cursor=${encodeURIComponent(nextCursor)}`,
        {
          cache: "no-store",
        }
      );
      const body = await parseMarketListResponse(response);

      setItems((current) => [...current, ...body.items]);
      setNextCursor(body.nextCursor);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "加载焚决市场失败。");
    } finally {
      setIsLoadingMore(false);
    }
  };

  const resolveAdminToken = () => {
    const cachedToken = window.sessionStorage.getItem(
      MARKET_ADMIN_TOKEN_STORAGE_KEY
    );

    if (cachedToken) {
      return cachedToken;
    }

    const nextToken = window.prompt("请输入焚决市场管理员口令");

    return nextToken?.trim() ?? "";
  };

  const handleToggleDeleteMode = () => {
    setIsDeleteMode((current) => {
      const next = !current;

      if (!next) {
        setSelectedItemIds(new Set());
      }

      return next;
    });
  };

  const handleToggleSelectedItem = (itemId: string, checked: boolean) => {
    setSelectedItemIds((current) => {
      const next = new Set(current);

      if (checked) {
        next.add(itemId);
      } else {
        next.delete(itemId);
      }

      return next;
    });
  };

  const handleDeleteSelected = async () => {
    const selectedItems = items.filter((item) => selectedItemIds.has(item.id));

    if (selectedItems.length === 0) {
      return;
    }

    const token = resolveAdminToken();

    if (!token) {
      return;
    }

    setIsDeletingSelected(true);

    try {
      const responses = await Promise.all(
        selectedItems.map((item) =>
          fetch(`/api/image-chat/market/${item.id}`, {
            method: "DELETE",
            headers: {
              "x-image-chat-admin-token": token,
            },
          })
        )
      );

      if (responses.some((response) => !response.ok)) {
        window.sessionStorage.removeItem(MARKET_ADMIN_TOKEN_STORAGE_KEY);
        throw new Error("管理员口令无效或部分作品不存在。");
      }

      const deletedItemIds = new Set(selectedItems.map((item) => item.id));

      window.sessionStorage.setItem(MARKET_ADMIN_TOKEN_STORAGE_KEY, token);
      setItems((current) =>
        current.filter((candidate) => !deletedItemIds.has(candidate.id))
      );
      setSelectedItemIds(new Set());
      setIsDeleteMode(false);
      toast.success(`已删除 ${selectedItems.length} 个市场作品`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "删除市场作品失败。");
    } finally {
      setIsDeletingSelected(false);
    }
  };

  return (
    <div className="flex min-h-svh flex-col bg-background text-foreground">
      <header className="border-b border-border/70 bg-background/90 backdrop-blur">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-4 py-5 md:px-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-2">
            <Button asChild variant="ghost" size="sm" className="-ml-2">
              <Link href="/">
                <ArrowLeftIcon className="size-4" />
                返回 image-chat
              </Link>
            </Button>
            <div className="flex items-center gap-3">
              <div className="rounded-2xl bg-primary/15 p-3 text-primary">
                <FlameIcon className="size-6" />
              </div>
              <div className="space-y-1">
                <p className="text-xs font-medium uppercase tracking-[0.24em] text-primary">
                  image-chat market
                </p>
                <h1 className="text-2xl font-semibold tracking-tight">
                  焚决市场
                </h1>
              </div>
            </div>
            <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
              浏览大家提交的提示词和生成效果，选择喜欢的作品后带回聊天区修改再生成。
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary" className="w-fit rounded-full px-3 py-1">
              {items.length} 个公开作品
            </Badge>
            {items.length > 0 ? (
              <Button
                type="button"
                variant={isDeleteMode ? "secondary" : "outline"}
                size="sm"
                onClick={handleToggleDeleteMode}
              >
                <Trash2Icon className="size-4" />
                {isDeleteMode ? "退出删除" : "删除作品"}
              </Button>
            ) : null}
          </div>
        </div>
      </header>

      <ScrollArea className="min-h-0 flex-1">
        <main className="mx-auto w-full max-w-7xl px-4 py-6 md:px-6">
          {items.length === 0 ? (
            <Card className="mx-auto max-w-xl border-dashed border-border/70 bg-card/70 p-10 text-center">
              <div className="mx-auto flex max-w-sm flex-col items-center gap-3">
                <div className="rounded-2xl bg-primary/10 p-4 text-primary">
                  <FlameIcon className="size-8" />
                </div>
                <div className="space-y-1">
                  <h2 className="text-lg font-semibold">
                    焚决市场还没有公开作品
                  </h2>
                  <p className="text-sm leading-6 text-muted-foreground">
                    回到聊天区生成图片后，可从图片卡片提交到市场。
                  </p>
                </div>
              </div>
            </Card>
         ) : (
            <div className="space-y-6">
              {isDeleteMode ? (
                <div className="flex flex-col gap-3 rounded-2xl border border-destructive/30 bg-destructive/5 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-foreground">
                      管理员删除模式
                    </p>
                    <p className="text-xs text-muted-foreground">
                      勾选需要删除的市场作品后，点击删除选中。
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs text-muted-foreground">
                      已选择 {selectedItemIds.size} 个作品
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={isDeletingSelected}
                      onClick={handleToggleDeleteMode}
                    >
                      取消
                    </Button>
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      disabled={
                        selectedItemIds.size === 0 || isDeletingSelected
                      }
                      onClick={() => void handleDeleteSelected()}
                    >
                      {isDeletingSelected ? (
                        <Loader2Icon className="size-4 animate-spin" />
                      ) : (
                        <Trash2Icon className="size-4" />
                      )}
                      删除选中
                    </Button>
                  </div>
                </div>
              ) : null}

              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {items.map((item, index) => (
                  <Card
                    key={item.id}
                    className="overflow-hidden border-border/60 bg-card/85 shadow-lg shadow-black/10"
                  >
                    <div className="space-y-3 p-3">
                      <div className="relative rounded-2xl border border-border/60 bg-background/50 p-2">
                        {isDeleteMode ? (
                          <label className="absolute left-4 top-4 z-10 flex cursor-pointer items-center gap-2 rounded-full border border-destructive/30 bg-background/90 px-3 py-1.5 text-xs font-medium text-foreground shadow-lg backdrop-blur">
                            <input
                              type="checkbox"
                              aria-label={`选择删除 ${item.prompt}`}
                              checked={selectedItemIds.has(item.id)}
                              className="size-4 accent-destructive"
                              onChange={(event) =>
                                handleToggleSelectedItem(
                                  item.id,
                                  event.currentTarget.checked
                                )
                              }
                            />
                            删除
                          </label>
                        ) : null}
                        <button
                          type="button"
                          aria-label={`预览 ${item.prompt}`}
                          onClick={() => setPreviewIndex(index)}
                          className="group relative flex min-h-[240px] w-full items-center justify-center overflow-hidden rounded-xl bg-black/20 outline-none transition focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          <img
                            src={item.image.url}
                            alt={item.prompt}
                            width={item.image.width}
                            height={item.image.height}
                            className="max-h-[280px] w-auto max-w-full object-contain transition duration-300 group-hover:scale-[1.02]"
                          />
                          <span className="pointer-events-none absolute rounded-full border border-white/15 bg-black/35 p-2 text-white opacity-0 backdrop-blur transition group-hover:opacity-100">
                            <Maximize2Icon className="size-4" />
                          </span>
                        </button>
                      </div>

                      <div className="space-y-2">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <Badge variant="outline" className="rounded-full">
                            {formatSettings(item)}
                          </Badge>
                          <span className="text-xs text-muted-foreground">
                            {formatTimestamp(item.createdAt)}
                          </span>
                        </div>
                        {item.model ? (
                          <p className="text-xs text-muted-foreground">
                            模型：{item.model}
                          </p>
                        ) : null}
                        <p className="line-clamp-3 text-sm leading-6 text-foreground">
                          {item.prompt}
                        </p>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setPromptDetailItem(item)}
                        >
                          查看提示词
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          onClick={() => handleUsePrompt(item)}
                        >
                          <SparklesIcon className="size-4" />
                          去生成
                        </Button>
                        <Button asChild variant="outline" size="sm">
                          <a href={item.image.url} download>
                            <DownloadIcon className="size-4" />
                            下载
                          </a>
                        </Button>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>

              {nextCursor ? (
                <div className="flex justify-center">
                  <Button
                    type="button"
                    variant="outline"
                    disabled={isLoadingMore}
                    onClick={() => void handleLoadMore()}
                  >
                    {isLoadingMore ? (
                      <Loader2Icon className="size-4 animate-spin" />
                    ) : (
                      <RefreshCwIcon className="size-4" />
                    )}
                    加载更多
                  </Button>
                </div>
              ) : null}
            </div>
          )}
        </main>
      </ScrollArea>

      <Lightbox
        open={previewIndex >= 0}
        close={() => setPreviewIndex(-1)}
        index={previewIndex >= 0 ? previewIndex : 0}
        plugins={[Zoom]}
        zoom={{
          scrollToZoom: true,
          maxZoomPixelRatio: 3,
        }}
        slides={previewSlides}
        carousel={{
          finite: true,
          padding: "48px",
          spacing: "24px",
          imageFit: "contain",
        }}
        labels={{
          Close: "关闭预览",
          Lightbox: "焚决市场图片预览",
          "Photo gallery": "焚决市场图片预览",
          "Zoom in": "放大",
          "Zoom out": "缩小",
        }}
        styles={{
          container: {
            backgroundColor: "rgba(6, 7, 12, 0.96)",
            backdropFilter: "blur(12px)",
          },
        }}
      />

      <Dialog
        open={promptDetailItem !== null}
        onOpenChange={(open) => {
          if (!open) {
            setPromptDetailItem(null);
          }
        }}
      >
        {promptDetailItem ? (
          <DialogContent className="max-h-[calc(100svh-2rem)] overflow-hidden sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle>提示词详情</DialogTitle>
              <DialogDescription>
                查看完整提示词和生成参数，可复制后自行改写，或直接带回首页生成。
              </DialogDescription>
            </DialogHeader>

            <div className="min-h-0 space-y-4 overflow-y-auto pr-1">
              <section className="rounded-2xl border border-border/70 bg-muted/30 p-4">
                <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
                  完整提示词
                </p>
                <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6 text-foreground">
                  {promptDetailItem.prompt}
                </p>
              </section>

              <section className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl border border-border/70 bg-background/60 p-4">
                  <p className="text-xs text-muted-foreground">生成参数</p>
                  <Badge variant="outline" className="mt-2 rounded-full">
                    {formatSettings(promptDetailItem)}
                  </Badge>
                </div>

                <div className="rounded-2xl border border-border/70 bg-background/60 p-4">
                  <p className="text-xs text-muted-foreground">模型</p>
                  <p className="mt-2 text-sm font-medium text-foreground">
                    {promptDetailItem.model
                      ? `模型：${promptDetailItem.model}`
                      : "模型：未记录"}
                  </p>
                </div>

                <div className="rounded-2xl border border-border/70 bg-background/60 p-4">
                  <p className="text-xs text-muted-foreground">发布时间</p>
                  <p className="mt-2 text-sm font-medium text-foreground">
                    {formatTimestamp(promptDetailItem.createdAt)}
                  </p>
                </div>

                <div className="rounded-2xl border border-border/70 bg-background/60 p-4">
                  <p className="text-xs text-muted-foreground">图片信息</p>
                  <p className="mt-2 text-sm font-medium text-foreground">
                    {promptDetailItem.image.width}×{promptDetailItem.image.height}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {promptDetailItem.image.mimeType}
                  </p>
                </div>
              </section>
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => void handleCopyPrompt(promptDetailItem)}
              >
                复制提示词
              </Button>
              <Button type="button" onClick={() => handleUsePrompt(promptDetailItem)}>
                <SparklesIcon className="size-4" />
                去生成
              </Button>
            </DialogFooter>
          </DialogContent>
        ) : null}
      </Dialog>
    </div>
  );
}
