import { http, requestRaw } from "./http";
import type { WorkspaceFile } from "../types/api";
import { workspacePath } from "./manager";

export interface FileChange {
  change_id: number;
  path: string;
  area: "uploads" | "work" | "artifacts";
  change_type: "created" | "modified" | "deleted";
  observed_at: string;
  size: number | null;
  previous_size: number | null;
}

export const workspace = {
  changes: (
    sessionId: string,
    cursor?: number,
    signal?: AbortSignal,
    projectId?: string,
  ) =>
    http<{
      items: FileChange[];
      next_cursor: number | null;
      scan_error: { message: string; observed_at: string } | null;
    }>(
      `${workspacePath(sessionId, projectId)}/file-changes`,
      { signal },
      cursor ? { cursor } : {},
    ),
  files: (path = "", signal?: AbortSignal) =>
    http<{ items: WorkspaceFile[] }>(
      "/manager/workspace/files",
      { signal },
      { path },
    ),
  file: (path: string, signal?: AbortSignal) =>
    requestRaw("/manager/workspace/file", { signal }, { path }),
  upload: (file: File, path = "uploads") => {
    const body = new FormData();
    body.append("file", file);
    return http<WorkspaceFile>(
      "/manager/workspace/files",
      { method: "POST", body },
      { path },
    );
  },
};
