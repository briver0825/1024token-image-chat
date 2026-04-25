"use client";

/* eslint-disable @next/next/no-img-element */

import { ImagePlusIcon, Loader2Icon, SparklesIcon, XIcon } from "lucide-react";
import { useEffect, useId, useState } from "react";

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
  const uploadInputId = useId();
  const normalizedValue = value.trim();
  const selectedReferenceImages =
    referenceImages ?? (referenceImage ? [referenceImage] : []);
  const hasReferenceImages = selectedReferenceImages.length > 0;
  const canUploadMoreReferences =
    Boolean(onUploadReferenceImages) &&
    selectedReferenceImages.length < MAX_REFERENCE_IMAGES;

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

  function handleClearReferences() {
    if (onClearReferences) {
      onClearReferences();
      return;
    }

    onClearReference?.();
  }

  return (
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
                  className="group relative flex items-start gap-2 overflow-hidden rounded-xl border border-border/60 bg-background/70 p-2"
                >
                  <img
                    src={item.image.src}
                    alt={`参考图 ${index + 1}`}
                    width={item.image.width}
                    height={item.image.height}
                    className="h-14 w-14 shrink-0 rounded-lg object-cover"
                  />
                  <p className="line-clamp-2 min-w-0 pr-6 text-xs leading-5 text-foreground">
                    {item.prompt}
                  </p>
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
  );
}
