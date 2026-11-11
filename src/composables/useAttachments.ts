import { ref } from "vue";
import { UploadCancelled, uploadProjectFile } from "./uploadProjectFile";
import type { WorkspaceFile } from "../types/api";
/** Existing sessions upload immediately; sends reuse uploaded references. */
export function useAttachments() {
  const files = ref<File[]>([]);
  const uploads = new Map<
    File,
    { projectId: string; promise: Promise<WorkspaceFile> }
  >();
  function add(selected: File[]) {
    files.value = [...files.value, ...selected];
  }
  function remove(index: number) {
    files.value = files.value.filter((_, i) => i !== index);
  }
  async function ensureUploaded(
    projectId: string,
    selected: File[],
    signal?: AbortSignal,
  ) {
    const references: WorkspaceFile[] = [];
    let cancelled: UploadCancelled | undefined;
    for (const file of selected) {
      if (signal?.aborted)
        throw new DOMException("Upload cancelled", "AbortError");
      let pending = uploads.get(file);
      if (!pending || pending.projectId !== projectId) {
        pending = {
          projectId,
          promise: uploadProjectFile(projectId, file, signal),
        };
        uploads.set(file, pending);
      }
      try {
        references.push(await pending.promise);
      } catch (error) {
        if (uploads.get(file) === pending) uploads.delete(file);
        if (error instanceof UploadCancelled) {
          files.value = files.value.filter((item) => item !== file);
          cancelled ??= error;
          continue;
        }
        throw error;
      }
    }
    if (cancelled) throw cancelled;
    return references;
  }
  async function upload(
    projectId: string,
    text: string,
    selected = [...files.value],
    signal?: AbortSignal,
  ) {
    const references = await ensureUploaded(projectId, selected, signal);
    return (
      text +
      (references.length
        ? `\n\n已上传的项目资料（工作空间根目录）：\n${[...new Set(references.map((file) => file.path))].map((path) => `- ${path}`).join("\n")}`
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
