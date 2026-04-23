import type {
  GenerateErrorResponse,
  GenerateRequestEnvelope,
} from "@/lib/image-chat/types";
import { decryptConnectionConfig } from "@/lib/server/config-encryption";
import { createImageGenerationTask, getImageGenerationTaskStatus } from "@/lib/server/image-task-manager";
import {
  normalizeProviderError,
  parseGenerateRequest,
} from "@/lib/server/image-generation";

export const runtime = "nodejs";

function jsonHeaders() {
  return {
    "cache-control": "no-store",
  };
}

export async function POST(request: Request) {
  try {
    const requestBody = (await request.json()) as Partial<GenerateRequestEnvelope>;
    const parsedRequest = parseGenerateRequest(requestBody);
    const providerConfig = await decryptConnectionConfig(requestBody.encryptedConfig);
    const task = createImageGenerationTask({
      request: parsedRequest,
      providerConfig,
    });

    return Response.json(task, {
      status: 202,
      headers: jsonHeaders(),
    });
  } catch (error) {
    const normalizedError = await normalizeProviderError(error);

    return Response.json(normalizedError, {
      status: normalizedError.status,
      headers: jsonHeaders(),
    });
  }
}

export async function GET(request: Request) {
  const taskId = new URL(request.url).searchParams.get("taskId")?.trim();

  if (!taskId) {
    return Response.json(
      {
        error: {
          code: "invalid_request",
          message: "taskId 不能为空。",
        },
      } satisfies GenerateErrorResponse,
      {
        status: 400,
        headers: jsonHeaders(),
      }
    );
  }

  const taskStatus = getImageGenerationTaskStatus(taskId);

  if (!taskStatus) {
    return Response.json(
      {
        error: {
          code: "task_not_found",
          message: "任务不存在或已过期，请重新提交生成请求。",
        },
      } satisfies GenerateErrorResponse,
      {
        status: 404,
        headers: jsonHeaders(),
      }
    );
  }

  return Response.json(taskStatus, {
    status: 200,
    headers: jsonHeaders(),
  });
}
