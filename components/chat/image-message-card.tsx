"use client";

/* eslint-disable @next/next/no-img-element */

import { useState } from "react";
import {
  CopyIcon,
  DownloadIcon,
  FlameIcon,
  ImagePlusIcon,
  Loader2Icon,
  Maximize2Icon,
  RefreshCcwIcon,
  TriangleAlertIcon,
  XIcon,
} from "lucide-react";
import Lightbox from "yet-another-react-lightbox";
import Zoom from "yet-another-react-lightbox/plugins/zoom";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatTimestamp } from "@/lib/image-chat/utils";

export type ImageMessageCardData = {
  id: string;
  prompt: string;
  createdAt: string;
  status: "pending" | "completed" | "failed";
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

type ImageMessageCardProps = {
  message: ImageMessageCardData;
  onCopyPrompt: (messageId: string) => void;
  onDownload: (messageId: string) => void;
  onRegenerate: (messageId: string) => void;
  onUseAsReference: (messageId: string) => void;
  onPublishToMarket?: (messageId: string) => void;
};

function ImageActionButtons({
  messageId,
  onCopyPrompt,
  onDownload,
  onRegenerate,
  onUseAsReference,
  onPublishToMarket,
}: {
  messageId: string;
  onCopyPrompt: (messageId: string) => void;
  onDownload: (messageId: string) => void;
  onRegenerate: (messageId: string) => void;
  onUseAsReference: (messageId: string) => void;
  onPublishToMarket?: (messageId: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => onCopyPrompt(messageId)}
      >
        <CopyIcon className="size-4" />
        复制提示词
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => onDownload(messageId)}
      >
        <DownloadIcon className="size-4" />
        下载图片
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => onUseAsReference(messageId)}
      >
        <ImagePlusIcon className="size-4" />
        设为参考图
      </Button>
      {onPublishToMarket ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onPublishToMarket(messageId)}
        >
          <FlameIcon className="size-4" />
          提交市场
        </Button>
      ) : null}
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => onRegenerate(messageId)}
      >
        <RefreshCcwIcon className="size-4" />
        重新生成
      </Button>
    </div>
  );
}

function ReferenceImageSummary({
  images,
}: {
  images: NonNullable<ImageMessageCardData["referenceImages"]>;
}) {
  const isMultiple = images.length > 1;

  return (
    <div className="flex items-start gap-3 rounded-2xl border border-primary/15 bg-primary/5 p-3">
      <div className="flex max-w-32 -space-x-2 overflow-hidden rounded-xl border border-border/60 bg-background/70 p-1.5">
        {images.slice(0, 4).map((image, index) => (
          <img
            key={`${image.src}-${index}`}
            src={image.src}
            alt={`参考图缩略图 ${index + 1}`}
            width={image.width}
            height={image.height}
            className="h-14 w-14 rounded-lg border border-background object-cover"
          />
        ))}
      </div>
      <div className="min-w-0 space-y-1">
        <Badge className="rounded-full bg-primary/15 text-primary hover:bg-primary/15">
          {isMultiple ? `参考图续画 · ${images.length} 张` : "参考图续画"}
        </Badge>
        <p className="text-xs leading-5 text-muted-foreground">
          {isMultiple
            ? "本次生成会参考这些图片继续延展。"
            : "本次生成会参考这张图继续延展。"}
        </p>
      </div>
    </div>
  );
}

function LightboxToolbarButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
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

export function ImageMessageCard({
  message,
  onCopyPrompt,
  onDownload,
  onRegenerate,
  onUseAsReference,
  onPublishToMarket,
}: ImageMessageCardProps) {
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const referenceImages =
    message.referenceImages ??
    (message.referenceImage ? [message.referenceImage] : []);

  if (message.status === "pending") {
    return (
      <Card className="overflow-hidden border-border/60 bg-card/90 shadow-lg shadow-black/10">
        <div className="space-y-4 p-4">
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="rounded-full">
              <Loader2Icon className="size-3.5 animate-spin" />
              正在生成
            </Badge>
            <span className="text-sm text-muted-foreground">
              {formatTimestamp(message.createdAt)}
            </span>
          </div>
          {referenceImages.length > 0 ? (
            <ReferenceImageSummary images={referenceImages} />
          ) : null}
          <div className="relative overflow-hidden rounded-2xl border border-border/60 bg-gradient-to-br from-primary/10 via-background to-primary/5 p-5">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.08),transparent_45%)]" />
            <div className="relative grid gap-4 md:grid-cols-[minmax(0,1fr)_220px] md:items-center">
              <div className="space-y-3">
                <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-sm text-primary">
                  <Loader2Icon className="size-4 animate-spin" />
                  正在把提示词变成图像
                </div>
                <p className="text-sm leading-6 text-muted-foreground">
                  我们正在向图片模型提交请求并等待返回结果。生成完成后，这里会自动替换成图片卡片。
                </p>
                <div className="grid gap-2 text-xs text-muted-foreground sm:grid-cols-3">
                  <div className="rounded-xl border border-border/60 bg-background/60 px-3 py-2">
                    1. 加密配置
                  </div>
                  <div className="rounded-xl border border-border/60 bg-background/60 px-3 py-2">
                    2. 请求模型
                  </div>
                  <div className="rounded-xl border border-border/60 bg-background/60 px-3 py-2">
                    3. 回填结果
                  </div>
                </div>
              </div>
              <div className="space-y-3">
                <Skeleton className="h-[240px] w-full rounded-2xl" />
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-4 w-full" />
              </div>
            </div>
          </div>
        </div>
      </Card>
    );
  }

  if (message.status === "failed" || !message.image) {
    return (
      <Card className="border-destructive/30 bg-card/90 p-4 shadow-lg shadow-black/10">
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <Badge variant="destructive" className="rounded-full">
              生成失败
            </Badge>
            <span className="text-sm text-muted-foreground">
              {formatTimestamp(message.createdAt)}
            </span>
          </div>
          <Alert variant="destructive">
            <TriangleAlertIcon className="size-4" />
            <AlertTitle>图片没有生成成功</AlertTitle>
            <AlertDescription className="max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-md pr-2 font-mono text-xs leading-5">
              {message.errorMessage ?? "请调整提示词或稍后重试。"}
            </AlertDescription>
          </Alert>
          {referenceImages.length > 0 ? (
            <ReferenceImageSummary images={referenceImages} />
          ) : null}
          <div className="flex justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={() => onRegenerate(message.id)}
            >
              <RefreshCcwIcon className="size-4" />
              重新生成
            </Button>
          </div>
        </div>
      </Card>
    );
  }

  const image = message.image;

  return (
    <div className="self-start max-w-full">
      <Card className="w-fit max-w-full overflow-hidden border-border/60 bg-card/90 shadow-lg shadow-black/10">
        <div className="space-y-4 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-center gap-2">
              <Badge className="rounded-full bg-primary/15 text-primary hover:bg-primary/15">
                已生成
              </Badge>
              <span className="text-sm text-muted-foreground">
                {formatTimestamp(message.createdAt)}
              </span>
            </div>
            <ImageActionButtons
              messageId={message.id}
              onCopyPrompt={onCopyPrompt}
              onDownload={onDownload}
              onRegenerate={onRegenerate}
              onUseAsReference={onUseAsReference}
              onPublishToMarket={onPublishToMarket}
            />
          </div>

          {referenceImages.length > 0 ? (
            <ReferenceImageSummary images={referenceImages} />
          ) : null}

          <button
            type="button"
            aria-label="打开图片预览"
            onClick={() => setIsPreviewOpen(true)}
            className="group flex w-fit max-w-full justify-center rounded-2xl border border-border/60 bg-background/50 p-3 text-left outline-none transition focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span className="relative inline-flex max-w-full overflow-hidden rounded-xl">
              <img
                src={image.src}
                alt="生成结果预览"
                width={image.width}
                height={image.height}
                className="max-h-[260px] w-auto max-w-full object-contain transition duration-300 group-hover:scale-[1.02] md:max-h-[320px]"
              />
              <span className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center justify-between bg-gradient-to-t from-black/70 via-black/15 to-transparent px-4 py-3 text-white">
                <span>
                  <span className="text-sm font-medium">点击查看大图</span>
                  <span className="block text-xs text-white/75">
                    {image.width} × {image.height}
                  </span>
                </span>
                <span className="rounded-full border border-white/20 bg-white/10 p-2 backdrop-blur">
                  <Maximize2Icon className="size-4" />
                </span>
              </span>
            </span>
          </button>

          <p className="max-w-[48rem] line-clamp-3 text-sm leading-6 text-muted-foreground">
            {message.prompt}
          </p>
        </div>
      </Card>

      <Lightbox
        open={isPreviewOpen}
        close={() => setIsPreviewOpen(false)}
        plugins={[Zoom]}
        zoom={{
          scrollToZoom: true,
          maxZoomPixelRatio: 3,
        }}
        slides={[
          {
            src: message.image.src,
            alt: message.prompt,
            width: message.image.width,
            height: message.image.height,
          },
        ]}
        carousel={{
          finite: true,
          padding: "48px",
          spacing: "24px",
          imageFit: "contain",
        }}
        render={{
          buttonPrev: () => null,
          buttonNext: () => null,
          buttonClose: () => (
            <button
              type="button"
              className="yarl__button"
              aria-label="关闭预览"
              title="关闭预览"
              onClick={() => setIsPreviewOpen(false)}
            >
              <XIcon className="size-6" />
            </button>
          ),
        }}
        toolbar={{
          buttons: [
            <LightboxToolbarButton
              key="copy"
              label="复制提示词"
              onClick={() => onCopyPrompt(message.id)}
            >
              <CopyIcon className="size-6" />
            </LightboxToolbarButton>,
            <LightboxToolbarButton
              key="download"
              label="下载图片"
              onClick={() => onDownload(message.id)}
            >
              <DownloadIcon className="size-6" />
            </LightboxToolbarButton>,
            "close",
          ],
        }}
        labels={{
          Close: "关闭预览",
          Lightbox: "图片预览",
          "Photo gallery": "图片预览",
          "Zoom in": "放大",
          "Zoom out": "缩小",
        }}
        styles={{
          container: {
            backgroundColor: "rgba(6, 7, 12, 0.96)",
            backdropFilter: "blur(12px)",
          },
          button: {
            filter: "drop-shadow(0 8px 24px rgba(0,0,0,0.45))",
          },
        }}
      />
    </div>
  );
}
