"use client";

import { SlidersHorizontalIcon } from "lucide-react";

import { Card } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { GenerationSettings } from "@/lib/image-chat/types";

export const DEFAULT_GENERATION_SETTINGS: GenerationSettings = {
  size: "1024x1024",
  quality: "high",
  outputFormat: "png",
};

type ParamsPanelProps = {
  value: GenerationSettings;
  onChange: (settings: GenerationSettings) => void;
};

function normalizeSettings(nextSettings: GenerationSettings): GenerationSettings {
  if (nextSettings.outputFormat === "png") {
    const rest = { ...nextSettings };
    delete rest.outputCompression;
    return rest;
  }

  return nextSettings;
}

export function ParamsPanel({ value, onChange }: ParamsPanelProps) {
  const normalizedValue = normalizeSettings(value);

  function patchSettings(patch: Partial<GenerationSettings>) {
    onChange(
      normalizeSettings({
        ...normalizedValue,
        ...patch,
      })
    );
  }

  return (
    <Card className="h-full border-border/60 bg-card/80 p-5 shadow-lg shadow-black/10">
      <div className="space-y-5">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-sm font-medium text-foreground">
            <SlidersHorizontalIcon className="size-4 text-primary" />
            生成参数
          </div>
          <p className="text-sm text-muted-foreground">
            调整尺寸、质量与输出格式，新的生成请求会立即使用这些参数。
          </p>
        </div>

        <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">图片尺寸</label>
            <Select
              value={normalizedValue.size}
              onValueChange={(nextValue) =>
                patchSettings({
                  size: nextValue as GenerationSettings["size"],
                })
              }
            >
              <SelectTrigger aria-label="图片尺寸" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1024x1024">1024 × 1024</SelectItem>
                <SelectItem value="1536x1024">1536 × 1024</SelectItem>
                <SelectItem value="1024x1536">1024 × 1536</SelectItem>
                <SelectItem value="2048x2048">2048 × 2048</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">生成质量</label>
            <Select
              value={normalizedValue.quality}
              onValueChange={(nextValue) =>
                patchSettings({
                  quality: nextValue as GenerationSettings["quality"],
                })
              }
            >
              <SelectTrigger aria-label="生成质量" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">自动</SelectItem>
                <SelectItem value="low">低质量</SelectItem>
                <SelectItem value="medium">中质量</SelectItem>
                <SelectItem value="high">高质量</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">图片格式</label>
            <Select
              value={normalizedValue.outputFormat}
              onValueChange={(nextValue) =>
                patchSettings({
                  outputFormat: nextValue as GenerationSettings["outputFormat"],
                })
              }
            >
              <SelectTrigger aria-label="图片格式" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="png">PNG</SelectItem>
                <SelectItem value="jpeg">JPEG</SelectItem>
                <SelectItem value="webp">WebP</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium">压缩率</label>
              <span className="text-xs text-muted-foreground">
                {normalizedValue.outputFormat === "png"
                  ? "PNG 不支持压缩率"
                  : `${normalizedValue.outputCompression ?? 80}%`}
              </span>
            </div>
            <input
              aria-label="压缩率"
              type="range"
              min={10}
              max={100}
              step={1}
              disabled={normalizedValue.outputFormat === "png"}
              value={normalizedValue.outputCompression ?? 80}
              onChange={(event) =>
                patchSettings({
                  outputCompression: Number.parseInt(event.target.value, 10),
                })
              }
              className="w-full accent-primary disabled:cursor-not-allowed disabled:opacity-50"
            />
          </div>
        </div>
      </div>
    </Card>
  );
}
