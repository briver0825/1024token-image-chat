"use client";

import { useState } from "react";
import { KeyRoundIcon, ShieldCheckIcon, ShieldOffIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import type { ProviderConnectionConfig } from "@/lib/image-chat/types";

const CUSTOM_MODEL_VALUE = "__custom__";
const MODEL_PRESETS = ["gpt-image-2", "gpt-image-1", "dall-e-3"] as const;

type ProviderConfigCardProps = {
  value: ProviderConnectionConfig;
  rememberConfig: boolean;
  publicKeyStatus: "loading" | "ready" | "error";
  onChange: (value: ProviderConnectionConfig) => void;
  onRememberConfigChange: (remember: boolean) => void;
};

function getPublicKeyStatusMeta(status: ProviderConfigCardProps["publicKeyStatus"]) {
  if (status === "ready") {
    return {
      label: "加密公钥已就绪",
      description: "前端会在发送前使用公钥加密你的调用配置。",
      icon: ShieldCheckIcon,
      tone: "text-emerald-400",
    };
  }

  if (status === "error") {
    return {
      label: "公钥不可用",
      description: "当前无法从服务端获取加密公钥，请稍后刷新重试。",
      icon: ShieldOffIcon,
      tone: "text-rose-400",
    };
  }

  return {
    label: "正在加载公钥",
    description: "页面会先拉取服务端公钥，再允许发送生成请求。",
    icon: KeyRoundIcon,
    tone: "text-amber-300",
  };
}

export function ProviderConfigCard({
  value,
  rememberConfig,
  publicKeyStatus,
  onChange,
  onRememberConfigChange,
}: ProviderConfigCardProps) {
  const statusMeta = getPublicKeyStatusMeta(publicKeyStatus);
  const StatusIcon = statusMeta.icon;
  const isPresetModel = MODEL_PRESETS.includes(value.model as (typeof MODEL_PRESETS)[number]);
  const [forceCustomModel, setForceCustomModel] = useState(false);
  const selectedModelValue =
    forceCustomModel || !isPresetModel ? CUSTOM_MODEL_VALUE : value.model;

  function patchValue(patch: Partial<ProviderConnectionConfig>) {
    onChange({
      ...value,
      ...patch,
    });
  }

  function handleModelSelectionChange(nextValue: string) {
    if (nextValue === CUSTOM_MODEL_VALUE) {
      setForceCustomModel(true);
      patchValue({
        model: isPresetModel ? "" : value.model,
      });
      return;
    }

    setForceCustomModel(false);
    patchValue({ model: nextValue });
  }

  return (
    <Card className="border-border/60 bg-card/80 p-5 shadow-lg shadow-black/10">
      <div className="space-y-5">
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm font-medium text-foreground">
              <KeyRoundIcon className="size-4 text-primary" />
              调用配置
            </div>
            <Badge variant="outline" className={statusMeta.tone}>
              <StatusIcon className="size-3.5" />
              {statusMeta.label}
            </Badge>
          </div>
          <p className="text-sm leading-6 text-muted-foreground">
            {rememberConfig
              ? "每个用户都使用自己的 API Key / Base URL / 模型。当前配置会保存在这台设备的浏览器中。"
              : "每个用户都使用自己的 API Key / Base URL / 模型。配置仅保存在当前页面内存中，刷新后需重新填写。"}
          </p>
          <p className="text-xs text-muted-foreground">{statusMeta.description}</p>
          <div className="flex items-center justify-between gap-3 rounded-2xl border border-border/60 bg-background/40 px-3 py-2.5">
            <div className="space-y-0.5">
              <label
                htmlFor="remember-provider-config"
                className="text-sm font-medium text-foreground"
              >
                记住此设备上的调用配置
              </label>
              <p className="text-xs text-muted-foreground">
                开启后自动恢复上次填写的 Key、Base URL 和模型。
              </p>
            </div>
            <Switch
              id="remember-provider-config"
              aria-label="记住此设备上的调用配置"
              checked={rememberConfig}
              onCheckedChange={onRememberConfigChange}
            />
          </div>
        </div>

        <div className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="provider-api-key" className="text-sm font-medium">
              API Key
            </label>
            <Input
              id="provider-api-key"
              aria-label="API Key"
              type="password"
              autoComplete="off"
              value={value.apiKey}
              onChange={(event) => patchValue({ apiKey: event.target.value })}
              placeholder="sk-..."
            />
          </div>
          <div className="space-y-2">
            <label htmlFor="provider-base-url" className="text-sm font-medium">
              Base URL
            </label>
            <Input
              id="provider-base-url"
              aria-label="Base URL"
              autoComplete="off"
              value={value.baseUrl}
              onChange={(event) => patchValue({ baseUrl: event.target.value })}
              placeholder="https://your-provider.example/v1"
            />
          </div>
          <div className="space-y-2">
            <label htmlFor="provider-model-select" className="text-sm font-medium">
              模型选择
            </label>
            <Select value={selectedModelValue} onValueChange={handleModelSelectionChange}>
              <SelectTrigger
                id="provider-model-select"
                aria-label="模型选择"
                className="w-full"
              >
                <SelectValue placeholder="选择一个图片模型" />
              </SelectTrigger>
              <SelectContent>
                {MODEL_PRESETS.map((model) => (
                  <SelectItem key={model} value={model}>
                    {model}
                  </SelectItem>
                ))}
                <SelectItem value={CUSTOM_MODEL_VALUE}>自定义模型</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {selectedModelValue === CUSTOM_MODEL_VALUE ? (
            <div className="space-y-2">
              <label htmlFor="provider-model" className="text-sm font-medium">
                模型
              </label>
              <Input
                id="provider-model"
                aria-label="模型"
                autoComplete="off"
                value={value.model}
                onChange={(event) => patchValue({ model: event.target.value })}
                placeholder="输入自定义模型名"
              />
            </div>
          ) : null}
        </div>
      </div>
    </Card>
  );
}
