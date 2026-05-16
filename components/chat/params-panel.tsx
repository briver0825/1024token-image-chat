"use client";

import {
  RectangleHorizontalIcon,
  RectangleVerticalIcon,
  SlidersHorizontalIcon,
  SquareIcon,
} from "lucide-react";

import { Card } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { normalizeGenerationSettings } from "@/lib/image-chat/generation-settings";
import type {
  GenerationSettings,
  ImageAspectRatio,
  ImageResolution,
} from "@/lib/image-chat/types";

type ParamsPanelProps = {
  value: GenerationSettings;
  onChange: (settings: GenerationSettings) => void;
};

const ASPECT_RATIO_OPTIONS: Array<{
  value: ImageAspectRatio;
  label: string;
  icon: typeof RectangleHorizontalIcon;
}> = [
  {
    value: "16:9",
    label: "16:9",
    icon: RectangleHorizontalIcon,
  },
  {
    value: "4:3",
    label: "4:3",
    icon: RectangleHorizontalIcon,
  },
  {
    value: "1:1",
    label: "1:1",
    icon: SquareIcon,
  },
  {
    value: "3:4",
    label: "3:4",
    icon: RectangleVerticalIcon,
  },
  {
    value: "9:16",
    label: "9:16",
    icon: RectangleVerticalIcon,
  },
];

const RESOLUTION_OPTIONS: Array<{
  value: ImageResolution;
  label: string;
}> = [
  {
    value: "1k",
    label: "1K",
  },
  {
    value: "2k",
    label: "2K",
  },
  {
    value: "4k",
    label: "4K",
  },
];

export function ParamsPanel({ value, onChange }: ParamsPanelProps) {
  const normalizedValue = normalizeGenerationSettings(value);

  function patchSettings(patch: Partial<GenerationSettings>) {
    onChange(
      normalizeGenerationSettings({
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
            调整比例、输出规格与图片格式，新的生成请求会立即使用这些参数。
          </p>
        </div>

        <div className="space-y-4">
          <div className="space-y-2">
            <div className="text-sm font-medium">图片比例</div>
            <div
              role="radiogroup"
              aria-label="图片比例"
              className="grid grid-cols-5 gap-1 rounded-2xl border border-border/60 bg-background/55 p-1"
            >
              {ASPECT_RATIO_OPTIONS.map((option) => {
                const Icon = option.icon;
                const isSelected = normalizedValue.aspectRatio === option.value;

                return (
                  <button
                    key={option.value}
                    type="button"
                    role="radio"
                    aria-checked={isSelected}
                    aria-label={option.label}
                    onClick={() => patchSettings({ aspectRatio: option.value })}
                    className={[
                      "flex min-h-16 flex-col items-center justify-center gap-1 rounded-lg px-2 text-sm font-semibold transition-colors",
                      isSelected
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                    ].join(" ")}
                  >
                    <Icon className="size-5" />
                    <span>{option.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-2">
            <div className="text-sm font-medium">输出规格</div>
            <div
              role="radiogroup"
              aria-label="输出规格"
              className="grid grid-cols-3 gap-1 rounded-2xl border border-border/60 bg-background/55 p-1"
            >
              {RESOLUTION_OPTIONS.map((option) => {
                const isSelected = normalizedValue.resolution === option.value;

                return (
                  <button
                    key={option.value}
                    type="button"
                    role="radio"
                    aria-checked={isSelected}
                    aria-label={option.label}
                    onClick={() => patchSettings({ resolution: option.value })}
                    className={[
                      "h-10 rounded-lg px-3 text-sm font-semibold transition-colors",
                      isSelected
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                    ].join(" ")}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
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
        </div>
      </div>
    </Card>
  );
}
