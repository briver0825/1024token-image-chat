import type {
  GenerationSettings,
  ImageOutputFormat,
} from "@/lib/image-chat/types";

export function buildConversationTitle(prompt: string) {
  const normalized = prompt.replace(/\s+/g, " ").trim();

  if (normalized.length <= 18) {
    return normalized || "未命名会话";
  }

  return `${normalized.slice(0, 18)}…`;
}

export function formatTimestamp(timestamp: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(timestamp));
}

export function base64ToBlob(base64: string, mimeType: string) {
  const binary = atob(base64);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));

  return new Blob([bytes], { type: mimeType });
}

export async function blobToBase64(blob: Blob) {
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";

  for (let index = 0; index < bytes.length; index += 1) {
    binary += String.fromCharCode(bytes[index]!);
  }

  return btoa(binary);
}

export function outputFormatToExtension(format: ImageOutputFormat) {
  switch (format) {
    case "jpeg":
      return "jpg";
    case "webp":
      return "webp";
    case "png":
    default:
      return "png";
  }
}

export function createDownloadFileName(
  prompt: string,
  settings: GenerationSettings
) {
  const safeBase = buildConversationTitle(prompt)
    .replace(/[^\p{Letter}\p{Number}\-_.]+/gu, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  return `${safeBase || "image-chat"}-${Date.now()}.${outputFormatToExtension(
    settings.outputFormat
  )}`;
}
