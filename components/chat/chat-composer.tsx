"use client";

/* eslint-disable @next/next/no-img-element */

import {
  ImagePlusIcon,
  Loader2Icon,
  Maximize2Icon,
  SparklesIcon,
  XIcon,
} from "lucide-react";
import {
  useEffect,
  useId,
  useMemo,
  useState,
  type ClipboardEvent,
} from "react";
import Lightbox from "yet-another-react-lightbox";
import Zoom from "yet-another-react-lightbox/plugins/zoom";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { MAX_REFERENCE_IMAGES } from "@/lib/image-chat/types";

type ReferenceImagePreview = {
  id: string;
  prompt: string;
  image: {
    src: string;
    mimeType: string;
    width: number;
    height: number;
  };
};

type ChatComposerProps = {
  isSubmitting: boolean;
  canSubmit?: boolean;
  disabledHint?: string;
  draftPrompt?: string;
  draftPromptKey?: string;
  referenceImage?: ReferenceImagePreview | null;
  referenceImages?: ReferenceImagePreview[] | null;
  onClearReference?: () => void;
  onClearReferences?: () => void;
  onRemoveReference?: (referenceId: string) => void;
  onUploadReferenceImages?: (files: File[]) => void | Promise<void>;
  onSubmit: (prompt: string) => Promise<void> | void;
};

export function ChatComposer({
  isSubmitting,
  canSubmit = true,
  disabledHint,
  draftPrompt,
  draftPromptKey,
  referenceImage,
  referenceImages,
  onClearReference,
  onClearReferences,
  onRemoveReference,
  onUploadReferenceImages,
  onSubmit,
}: ChatComposerProps) {
  const [value, setValue] = useState("");
  const [previewIndex, setPreviewIndex] = useState(-1);
  const uploadInputId = useId();
  const normalizedValue = value.trim();
  const selectedReferenceImages = useMemo(
    () => referenceImages ?? (referenceImage ? [referenceImage] : []),
    [referenceImage, referenceImages]
  );
  const hasReferenceImages = selectedReferenceImages.length > 0;
  const canUploadMoreReferences =
    Boolean(onUploadReferenceImages) &&
    selectedReferenceImages.length < MAX_REFERENCE_IMAGES;
  const referencePreviewSlides = useMemo(
    () =>
      selectedReferenceImages.map((item) => ({
        src: item.image.src,
        alt: item.prompt,
        width: item.image.width,
        height: item.image.height,
      })),
    [selectedReferenceImages]
  );
  const isReferencePreviewOpen =
    previewIndex >= 0 && previewIndex < referencePreviewSlides.length;

  useEffect(() => {
    if (draftPrompt === undefined) {
      return;
    }

    let isCancelled = false;

    queueMicrotask(() => {
      if (!isCancelled) {
        setValue(draftPrompt);
      }
    });

    return () => {
      isCancelled = true;
    };
  }, [draftPrompt, draftPromptKey]);

  async function handleSubmit() {
    if (!normalizedValue || isSubmitting || !canSubmit) {
      return;
    }

    await onSubmit(normalizedValue);
    setValue("");
  }

  function handleUploadFiles(files: FileList | null) {
    const nextFiles = Array.from(files ?? []);

    if (nextFiles.length === 0 || !onUploadReferenceImages) {
      return;
    }

    void onUploadReferenceImages(nextFiles);
  }

  function handlePaste(event: ClipboardEvent<HTMLTextAreaElement>) {
    if (!onUploadReferenceImages) {
      return;
    }

    const pastedImageFiles = Array.from(event.clipboardData.items)
      .filter((item) => item.kind === "file" && item.type.startsWith("image/"))
      .map((item) => item.getAsFile())
      .filter((file): file is File => Boolean(file));

    if (pastedImageFiles.length === 0) {
      return;
    }

    event.preventDefault();
    void onUploadReferenceImages(pastedImageFiles);
  }

  function handleClearReferences() {
    if (onClearReferences) {
      onClearReferences();
      return;
    }

    onClearReference?.();
  }

  return (
    <>
    <Card className="border-border/60 bg-card/80 p-4 shadow-lg shadow-black/10 backdrop-blur">
      <div className="space-y-3">
        {hasReferenceImages ? (
          <div className="space-y-3 rounded-2xl border border-primary/20 bg-primary/5 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="space-y-1">
                <Badge className="rounded-full bg-primary/15 text-primary hover:bg-primary/15">
                  参考图 {selectedReferenceImages.length} / {MAX_REFERENCE_IMAGES}
                </Badge>
                <p className="text-xs leading-5 text-muted-foreground">
                  下一条提示词会基于这些图片继续生成。
                </p>
              </div>
              {onClearReferences || onClearReference ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleClearReferences}
                  className="shrink-0"
                  aria-label="清空参考图"
                >
                  清空
                </Button>
              ) : null}
            </div>

            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {selectedReferenceImages.map((item, index) => (
                <div
                  key={item.id}
                  className="group relative overflow-hidden rounded-xl border border-border/60 bg-background/70"
                >
                  <button
                    type="button"
                    aria-label={`预览参考图 ${index + 1}`}
                    onClick={() => setPreviewIndex(index)}
                    className="flex w-full items-start gap-2 p-2 pr-10 text-left outline-none transition hover:bg-accent/30 focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <span className="relative h-14 w-14 shrink-0 overflow-hidden rounded-lg">
                      <img
                        src={item.image.src}
                        alt={`参考图 ${index + 1}`}
                        width={item.image.width}
                        height={item.image.height}
                        className="h-full w-full object-cover"
                      />
                      <span className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/35 text-white opacity-0 transition group-hover:opacity-100 group-focus-within:opacity-100">
                        <Maximize2Icon className="size-4" />
                      </span>
                    </span>
                    <p className="line-clamp-2 min-w-0 text-xs leading-5 text-foreground">
                      {item.prompt}
                    </p>
                  </button>
                  {onRemoveReference ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      onClick={() => onRemoveReference(item.id)}
                      className="absolute right-1.5 top-1.5 bg-background/80 opacity-90"
                      aria-label={`移除参考图 ${index + 1}`}
                    >
                      <XIcon className="size-3" />
                    </Button>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        ) : null}
        <Textarea
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onPaste={handlePaste}
          placeholder="描述你想生成的画面..."
          className="min-h-32 resize-none border-border/60 bg-background/70 text-base"
          onKeyDown={(event) => {
            if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
              event.preventDefault();
              void handleSubmit();
            }
          }}
        />
        <div className="flex flex-col-reverse gap-3 lg:flex-row lg:items-center lg:justify-between">
          <p className="w-full text-xs leading-5 text-muted-foreground lg:w-auto lg:text-sm">
            {canSubmit
              ? (
                  <>
                    支持中文自然语言提示词。按{" "}
                    <span className="font-medium">⌘ / Ctrl + Enter</span> 快速发送。
                  </>
              )
              : disabledHint ?? "请先填写并准备好调用配置后再发送。"}
          </p>
          <div
            className={
              onUploadReferenceImages
                ? "grid w-full shrink-0 grid-cols-2 gap-2 lg:flex lg:w-auto lg:flex-nowrap lg:justify-end"
                : "flex w-full shrink-0 justify-end gap-2 lg:w-auto"
            }
          >
            {onUploadReferenceImages ? (
              <>
                <input
                  id={uploadInputId}
                  type="file"
                  multiple
                  accept="image/png,image/jpeg,image/webp"
                  className="sr-only"
                  aria-label="上传参考图"
                  disabled={!canUploadMoreReferences}
                  onChange={(event) => {
                    handleUploadFiles(event.currentTarget.files);
                    event.currentTarget.value = "";
                  }}
                />
                <Button
                  asChild
                  variant="outline"
                  className={
                    !canUploadMoreReferences
                      ? "pointer-events-none w-full opacity-50 lg:w-auto"
                      : "w-full lg:w-auto"
                  }
                >
                  <label
                    htmlFor={uploadInputId}
                    aria-disabled={!canUploadMoreReferences}
                  >
                    <ImagePlusIcon className="size-4" />
                    上传参考图
                  </label>
                </Button>
              </>
            ) : null}
            <Button
              type="button"
              onClick={() => void handleSubmit()}
              disabled={!normalizedValue || isSubmitting || !canSubmit}
              className="w-full lg:min-w-32 lg:w-auto"
            >
              {isSubmitting ? (
                <>
                  <Loader2Icon className="size-4 animate-spin" />
                  正在生成
                </>
              ) : (
                <>
                  <SparklesIcon className="size-4" />
                  发送生成
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </Card>

    <Lightbox
      open={isReferencePreviewOpen}
      close={() => setPreviewIndex(-1)}
      index={isReferencePreviewOpen ? previewIndex : 0}
      plugins={[Zoom]}
      zoom={{
        scrollToZoom: true,
        maxZoomPixelRatio: 3,
      }}
      slides={referencePreviewSlides}
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
      labels={{
        Close: "关闭预览",
        Lightbox: "参考图预览",
        "Photo gallery": "参考图预览",
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
    </>
  );
}
