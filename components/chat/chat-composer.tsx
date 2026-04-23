"use client";

/* eslint-disable @next/next/no-img-element */

import { Loader2Icon, SparklesIcon } from "lucide-react";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";

type ChatComposerProps = {
  isSubmitting: boolean;
  canSubmit?: boolean;
  disabledHint?: string;
  referenceImage?: {
    prompt: string;
    image: {
      src: string;
      mimeType: string;
      width: number;
      height: number;
    };
  } | null;
  onClearReference?: () => void;
  onSubmit: (prompt: string) => Promise<void> | void;
};

export function ChatComposer({
  isSubmitting,
  canSubmit = true,
  disabledHint,
  referenceImage,
  onClearReference,
  onSubmit,
}: ChatComposerProps) {
  const [value, setValue] = useState("");
  const normalizedValue = value.trim();

  async function handleSubmit() {
    if (!normalizedValue || isSubmitting || !canSubmit) {
      return;
    }

    await onSubmit(normalizedValue);
    setValue("");
  }

  return (
    <Card className="border-border/60 bg-card/80 p-4 shadow-lg shadow-black/10 backdrop-blur">
      <div className="space-y-3">
        {referenceImage ? (
          <div className="flex items-start gap-3 rounded-2xl border border-primary/20 bg-primary/5 p-3">
            <div className="overflow-hidden rounded-xl border border-border/60 bg-background/70 p-1.5">
              <img
                src={referenceImage.image.src}
                alt="当前参考图"
                width={referenceImage.image.width}
                height={referenceImage.image.height}
                className="h-14 w-auto max-w-24 object-contain"
              />
            </div>
            <div className="min-w-0 flex-1 space-y-1">
              <Badge className="rounded-full bg-primary/15 text-primary hover:bg-primary/15">
                当前参考图
              </Badge>
              <p className="line-clamp-2 text-sm text-foreground">
                {referenceImage.prompt}
              </p>
              <p className="text-xs leading-5 text-muted-foreground">
                下一条提示词会基于这张图继续生成。
              </p>
            </div>
            {onClearReference ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={onClearReference}
                className="shrink-0"
                aria-label="移除参考图"
              >
                移除
              </Button>
            ) : null}
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
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            {canSubmit
              ? (
                  <>
                    支持中文自然语言提示词。按{" "}
                    <span className="font-medium">⌘ / Ctrl + Enter</span> 快速发送。
                  </>
                )
              : disabledHint ?? "请先填写并准备好调用配置后再发送。"}
          </p>
          <Button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={!normalizedValue || isSubmitting || !canSubmit}
            className="min-w-32"
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
    </Card>
  );
}
