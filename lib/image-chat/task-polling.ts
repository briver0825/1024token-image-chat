import type { ImageGenerationTaskStatus } from "@/lib/image-chat/types";

export function isTaskInProgress(status: ImageGenerationTaskStatus) {
  return status === "queued" || status === "processing";
}

export function isTaskTerminal(status: ImageGenerationTaskStatus) {
  return status === "completed" || status === "failed";
}
