"use client";

/* eslint-disable @next/next/no-img-element */

import { useMemo, useState, type ReactNode } from "react";
import {
  ArrowUpRightIcon,
  DownloadIcon,
  ImagesIcon,
  Maximize2Icon,
  XIcon,
} from "lucide-react";
import Lightbox from "yet-another-react-lightbox";
import Zoom from "yet-another-react-lightbox/plugins/zoom";

import { dedupeItemsByContentHash } from "@/lib/image-chat/asset-dedup";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  DialogClose,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { formatTimestamp } from "@/lib/image-chat/utils";

export type ImageGalleryDialogItem = {
  id: string;
  messageId: string;
  conversationId: string;
  conversationTitle: string;
  prompt: string;
  createdAt: string;
  contentHash?: string;
  image: {
    src: string;
    mimeType: string;
    width: number;
    height: number;
  };
};

type ImageGalleryDialogProps = {
  open: boolean;
  items: ImageGalleryDialogItem[];
  onOpenChange: (open: boolean) => void;
  onDownload: (messageId: string) => void;
  onJumpToConversation: (conversationId: string, messageId: string) => void;
};

function LightboxToolbarButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      className="yarl__button"
      aria-label={label}
      title={label}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

export function ImageGalleryDialog({
  open,
  items,
  onOpenChange,
  onDownload,
  onJumpToConversation,
}: ImageGalleryDialogProps) {
  const [previewIndex, setPreviewIndex] = useState<number>(-1);
  const sortedItems = useMemo(
    () => [...items].sort((left, right) => right.createdAt.localeCompare(left.createdAt)),
    [items]
  );
  const visibleItems = useMemo(
    () => dedupeItemsByContentHash(sortedItems),
    [sortedItems]
  );
  const activeItem = previewIndex >= 0 ? visibleItems[previewIndex] : null;
  const isPreviewOpen = open && previewIndex >= 0;
  const slides = useMemo(
    () =>
      visibleItems.map((item) => ({
        src: item.image.src,
        alt: item.prompt,
        width: item.image.width,
        height: item.image.height,
      })),
    [visibleItems]
  );

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(nextOpen) => {
          onOpenChange(nextOpen);

          if (!nextOpen) {
            setPreviewIndex(-1);
          }
        }}
      >
        <DialogContent
          showCloseButton={false}
          className="flex h-[88vh] max-h-[920px] max-w-[calc(100vw-2rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-6xl"
        >
          <DialogHeader className="shrink-0 border-b border-border/70 px-6 py-4">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-1">
                <DialogTitle className="flex items-center gap-2">
                  <ImagesIcon className="size-5 text-primary" />
                  图片总览
                </DialogTitle>
                <DialogDescription>
                  快速查看所有成功生成的图片，支持大图预览、下载和跳转到对应聊天记录。
                </DialogDescription>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="rounded-full">
                  {visibleItems.length} 张
                </Badge>
                <DialogClose asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label="关闭图片总览"
                    className="size-8 rounded-full text-muted-foreground hover:text-foreground"
                  >
                    <XIcon className="size-4" />
                  </Button>
                </DialogClose>
              </div>
            </div>
          </DialogHeader>

          <ScrollArea className="min-h-0 flex-1">
            {visibleItems.length === 0 ? (
              <div className="flex h-full min-h-[320px] items-center justify-center p-6">
                <Card className="max-w-lg border-dashed border-border/70 bg-card/70 p-8 text-center">
                  <div className="mx-auto flex max-w-sm flex-col items-center gap-3">
                    <div className="rounded-2xl bg-primary/10 p-4 text-primary">
                      <ImagesIcon className="size-8" />
                    </div>
                    <div className="space-y-1">
                      <h3 className="text-lg font-semibold">还没有成功生成的图片</h3>
                      <p className="text-sm leading-6 text-muted-foreground">
                        先去聊天区生成几张图片，之后就可以在这里统一浏览。
                      </p>
                    </div>
                  </div>
                </Card>
              </div>
            ) : (
              <div className="grid gap-4 p-4 sm:grid-cols-2 xl:grid-cols-3">
                {visibleItems.map((item, index) => (
                  <Card
                    key={`${item.messageId}-${item.id}`}
                    className="overflow-hidden border-border/60 bg-card/85 shadow-lg shadow-black/10"
                  >
                    <div className="space-y-3 p-3">
                      <button
                        type="button"
                        aria-label={`预览图片 ${item.conversationTitle}`}
                        onClick={() => setPreviewIndex(index)}
                        className="group block rounded-2xl border border-border/60 bg-background/50 p-2 text-left outline-none transition hover:border-primary/30 focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <span className="relative flex min-h-[220px] items-center justify-center overflow-hidden rounded-xl bg-black/20">
                          <img
                            src={item.image.src}
                            alt={item.prompt}
                            width={item.image.width}
                            height={item.image.height}
                            className="max-h-[240px] w-auto max-w-full object-contain transition duration-300 group-hover:scale-[1.02]"
                          />
                          <span className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center justify-between bg-gradient-to-t from-black/75 via-black/15 to-transparent px-3 py-3 text-white">
                            <span className="text-xs text-white/75">
                              {item.image.width} × {item.image.height}
                            </span>
                            <span className="rounded-full border border-white/15 bg-white/10 p-2 backdrop-blur">
                              <Maximize2Icon className="size-4" />
                            </span>
                          </span>
                        </span>
                      </button>

                      <div className="space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <Badge variant="outline" className="rounded-full">
                            {item.conversationTitle}
                          </Badge>
                          <span className="text-xs text-muted-foreground">
                            {formatTimestamp(item.createdAt)}
                          </span>
                        </div>
                        <p className="line-clamp-2 text-sm leading-6 text-foreground">
                          {item.prompt}
                        </p>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            onJumpToConversation(item.conversationId, item.messageId)
                          }
                        >
                          <ArrowUpRightIcon className="size-4" />
                          前往会话
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => onDownload(item.messageId)}
                        >
                          <DownloadIcon className="size-4" />
                          下载
                        </Button>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>

      <Lightbox
        open={isPreviewOpen}
        close={() => setPreviewIndex(-1)}
        index={previewIndex >= 0 ? previewIndex : 0}
        plugins={[Zoom]}
        zoom={{
          scrollToZoom: true,
          maxZoomPixelRatio: 3,
        }}
        slides={slides}
        carousel={{
          finite: true,
          padding: "48px",
          spacing: "24px",
          imageFit: "contain",
        }}
        render={{
          buttonClose: () => (
            <button
              type="button"
              className="yarl__button"
              aria-label="关闭预览"
              title="关闭预览"
              onClick={() => setPreviewIndex(-1)}
            >
              <XIcon className="size-6" />
            </button>
          ),
        }}
        toolbar={{
          buttons: activeItem
            ? [
                <LightboxToolbarButton
                  key="jump"
                  label="前往会话"
                  onClick={() =>
                    onJumpToConversation(
                      activeItem.conversationId,
                      activeItem.messageId
                    )
                  }
                >
                  <ArrowUpRightIcon className="size-6" />
                </LightboxToolbarButton>,
                <LightboxToolbarButton
                  key="download"
                  label="下载图片"
                  onClick={() => onDownload(activeItem.messageId)}
                >
                  <DownloadIcon className="size-6" />
                </LightboxToolbarButton>,
                "close",
              ]
            : ["close"],
        }}
        labels={{
          Close: "关闭预览",
          Lightbox: "图片总览预览",
          "Photo gallery": "图片总览预览",
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
    </>
  );
}
