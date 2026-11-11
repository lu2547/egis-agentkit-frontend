import { http } from "./http";
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
    projectId: string,
    cursor?: number,
    signal?: AbortSignal,
  ) =>
    http<{
      items: FileChange[];
      next_cursor: number | null;
      scan_error: { message: string; observed_at: string } | null;
    }>(
      `${workspacePath(projectId)}/file-changes`,
      { signal },
      cursor ? { cursor } : {},
    ),
};
