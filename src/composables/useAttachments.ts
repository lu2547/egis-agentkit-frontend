import { ref } from "vue";
import { manager } from "../api/manager";
import type { WorkspaceFile } from "../types/api";
/** Existing sessions upload immediately; sends reuse uploaded references. */
export function useAttachments() {
  const files = ref<File[]>([]);
  const uploads = new Map<
    File,
    { scopeId: string; promise: Promise<WorkspaceFile> }
  >();
  function add(selected: File[]) {
    files.value = [...files.value, ...selected];
  }
  function remove(index: number) {
    files.value = files.value.filter((_, i) => i !== index);
  }
  async function ensureUploaded(
    sessionId: string,
    selected: File[],
    signal?: AbortSignal,
    projectId?: string,
  ) {
    const scopeId = projectId ? `project:${projectId}` : sessionId;
    const references: WorkspaceFile[] = [];
    for (const file of selected) {
      if (signal?.aborted)
        throw new DOMException("Upload cancelled", "AbortError");
      let pending = uploads.get(file);
      if (!pending || pending.scopeId !== scopeId) {
        pending = {
          scopeId,
          promise: manager.uploadFile(sessionId, file, signal, projectId),
        };
        uploads.set(file, pending);
      }
      try {
        references.push(await pending.promise);
      } catch (error) {
        if (uploads.get(file) === pending) uploads.delete(file);
        throw error;
      }
    }
    return references;
  }
  async function upload(
    sessionId: string,
    text: string,
    selected = [...files.value],
    signal?: AbortSignal,
    projectId?: string,
  ) {
    const references = await ensureUploaded(
      sessionId,
      selected,
      signal,
      projectId,
    );
    return (
      text +
      (references.length
        ? `\n\n已上传的项目资料（工作空间根目录）：\n${references.map((file) => `- ${file.path}`).join("\n")}`
        : "")
    );
  }
  function removeUploaded(selected: File[]) {
    const uploaded = new Set(selected);
    files.value = files.value.filter((file) => !uploaded.has(file));
    selected.forEach((file) => uploads.delete(file));
  }
  return {
    files,
    add,
    remove,
    upload,
    ensureUploaded,
    removeUploaded,
    clear: () => {
      files.value = [];
      uploads.clear();
    },
  };
}
