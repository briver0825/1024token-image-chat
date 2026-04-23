import { describe, expect, it } from "vitest";

import { isTaskInProgress, isTaskTerminal } from "@/lib/image-chat/task-polling";

describe("task-polling", () => {
  it("treats only queued and processing as in-progress", () => {
    expect(isTaskInProgress("queued")).toBe(true);
    expect(isTaskInProgress("processing")).toBe(true);
    expect(isTaskInProgress("completed")).toBe(false);
    expect(isTaskInProgress("failed")).toBe(false);
  });

  it("treats completed and failed as terminal so polling can stop", () => {
    expect(isTaskTerminal("queued")).toBe(false);
    expect(isTaskTerminal("processing")).toBe(false);
    expect(isTaskTerminal("completed")).toBe(true);
    expect(isTaskTerminal("failed")).toBe(true);
  });
});
