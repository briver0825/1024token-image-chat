import type {
  GenerateErrorResponse,
  GenerateTaskRequest,
  GenerateTaskCreateResponse,
  GenerateTaskStatusResponse,
  ImageGenerationResult,
  ProviderConnectionConfig,
} from "@/lib/image-chat/types";
import {
  buildImageEditEndpoint,
  buildImageGenerationEndpoint,
  buildProviderRequestInit,
  mapProviderResult,
  normalizeProviderError,
  parseProviderResponse,
  stripReferenceImage,
} from "@/lib/server/image-generation";

type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

type InternalTask = {
  id: string;
  status: "queued" | "processing" | "completed" | "failed";
  createdAt: string;
  updatedAt: string;
  request: GenerateTaskRequest;
  providerConfig: ProviderConnectionConfig;
  result?: ImageGenerationResult;
  error?: GenerateErrorResponse["error"];
};

const TERMINAL_TASK_RETENTION_MS = 30 * 60 * 1000;

declare global {
  var __imageChatTaskStore__: Map<string, InternalTask> | undefined;
}

function getTaskStore() {
  globalThis.__imageChatTaskStore__ ??= new Map<string, InternalTask>();
  return globalThis.__imageChatTaskStore__;
}

function pruneExpiredTasks() {
  const now = Date.now();

  for (const [taskId, task] of getTaskStore()) {
    const isTerminal = task.status === "completed" || task.status === "failed";

    if (!isTerminal) {
      continue;
    }

    if (now - Date.parse(task.updatedAt) > TERMINAL_TASK_RETENTION_MS) {
      getTaskStore().delete(taskId);
    }
  }
}

async function executeImageGenerationTask(taskId: string, fetchImpl: FetchLike) {
  const task = getTaskStore().get(taskId);

  if (!task) {
    return;
  }

  const startedAt = Date.now();
  const processingAt = new Date().toISOString();

  getTaskStore().set(taskId, {
    ...task,
    status: "processing",
    updatedAt: processingAt,
  });

  try {
    const providerRequest = buildProviderRequestInit(
      task.providerConfig.model,
      task.request
    );
    const response = await fetchImpl(
      providerRequest.endpointPath === "edits"
        ? buildImageEditEndpoint(task.providerConfig.baseUrl)
        : buildImageGenerationEndpoint(task.providerConfig.baseUrl),
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${task.providerConfig.apiKey}`,
          ...providerRequest.headers,
        },
        body: providerRequest.body,
      }
    );
    const providerData = await parseProviderResponse(response);
    const finishedAt = new Date().toISOString();

    getTaskStore().set(taskId, {
      ...task,
      status: "completed",
      updatedAt: finishedAt,
      result: mapProviderResult({
        providerData,
        request: stripReferenceImage(task.request),
        createdAt: finishedAt,
        requestId: response.headers.get("x-request-id") ?? undefined,
        latencyMs: Date.now() - startedAt,
      }),
      error: undefined,
    });
  } catch (error) {
    const normalizedError = await normalizeProviderError(error);

    getTaskStore().set(taskId, {
      ...task,
      status: "failed",
      updatedAt: new Date().toISOString(),
      error: normalizedError.error,
      result: undefined,
    });
  }
}

export function createImageGenerationTask({
  request,
  providerConfig,
  fetchImpl = fetch,
}: {
  request: GenerateTaskRequest;
  providerConfig: ProviderConnectionConfig;
  fetchImpl?: FetchLike;
}): GenerateTaskCreateResponse {
  pruneExpiredTasks();

  const taskId = crypto.randomUUID();
  const createdAt = new Date().toISOString();

  getTaskStore().set(taskId, {
    id: taskId,
    status: "queued",
    createdAt,
    updatedAt: createdAt,
    request,
    providerConfig,
  });

  queueMicrotask(() => {
    void executeImageGenerationTask(taskId, fetchImpl);
  });

  return {
    taskId,
    status: "queued",
    createdAt,
  };
}

export function getImageGenerationTaskStatus(
  taskId: string
): GenerateTaskStatusResponse | null {
  pruneExpiredTasks();

  const task = getTaskStore().get(taskId);

  if (!task) {
    return null;
  }

  if (task.status === "completed" && task.result) {
    return {
      taskId,
      status: "completed",
      ...task.result,
    };
  }

  if (task.status === "failed" && task.error) {
    return {
      taskId,
      status: "failed",
      createdAt: task.updatedAt,
      error: task.error,
    };
  }

  if (task.status === "queued" || task.status === "processing") {
    return {
      taskId,
      status: task.status,
      createdAt: task.createdAt,
    };
  }

  return null;
}

export function resetImageGenerationTasksForTest() {
  getTaskStore().clear();
}
