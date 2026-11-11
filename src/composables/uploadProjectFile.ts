import { DialogPlugin } from "tdesign-vue-next/es/dialog";
import { nextTick } from "vue";
import { ApiError } from "../api/http";
import { manager } from "../api/manager";

export class UploadCancelled extends Error {
  constructor(file: File) {
    super(`「${file.name}」上传失败，已取消覆盖。`);
  }
}

function confirmOverwrite(filename: string, signal?: AbortSignal) {
  return new Promise<boolean>((resolve) => {
    let finished = false;
    const finish = (overwrite: boolean) => {
      if (finished) return;
      finished = true;
      signal?.removeEventListener("abort", abort);
      const closed = { inert: true, "aria-hidden": "true" };
      dialog.update({ destroyOnClose: true, ...closed });
      void nextTick(() => {
        dialog.destroy();
        resolve(overwrite);
      });
    };
    const abort = () => finish(false);
    const accessibility = {
      role: "dialog",
      "aria-modal": "true",
      "aria-label": "覆盖同名文件",
    };
    const dialog = DialogPlugin.confirm({
      ...accessibility,
      header: "覆盖同名文件？",
      body: `当前项目已有「${filename}」。覆盖后，同项目的其他对话也会使用新文件。`,
      cancelBtn: "取消",
      confirmBtn: "覆盖",
      onConfirm: () => finish(true),
      onClose: () => finish(false),
    });
    signal?.addEventListener("abort", abort, { once: true });
    if (signal?.aborted) abort();
  });
}

export async function uploadProjectFile(
  projectId: string,
  file: File,
  signal?: AbortSignal,
) {
  try {
    return await manager.uploadFile(projectId, file, signal);
  } catch (error) {
    if (
      !(error instanceof ApiError) ||
      error.status !== 409 ||
      error.code !== "upload_name_conflict"
    )
      throw error;
  }
  signal?.throwIfAborted();
  const overwrite = await confirmOverwrite(file.name, signal);
  signal?.throwIfAborted();
  if (!overwrite) throw new UploadCancelled(file);
  return manager.uploadFile(projectId, file, signal, true);
}
