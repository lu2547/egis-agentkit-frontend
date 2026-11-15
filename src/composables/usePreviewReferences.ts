/** 按当前项目隔离引用草稿；总数量、消息大小由 Nacos 配置约束。 */
import { ref, watch, type Ref } from "vue";
import { http, errorText } from "../api/http";
import { workspacePath } from "../api/manager";
import {
  validateReferenceBudget,
  type PreviewReference,
  type PreviewOptions,
} from "../domain/previewReferences";
export function usePreviewReferences(projectId: Ref<string | undefined>) {
  const items = ref<PreviewReference[]>([]),
    options = ref<PreviewOptions>(),
    error = ref("");
  watch(
    projectId,
    async (id) => {
      items.value = [];
      options.value = undefined;
      error.value = "";
      if (!id) return;
      try {
        const loaded = await http<PreviewOptions>(
          `${workspacePath(id)}/preview-options`,
        );
        if (projectId.value === id) options.value = loaded;
      } catch {
        /* 预览仍可使用；只有添加引用时才报告配置不可用。 */
      }
    },
    { immediate: true },
  );
  function add(value: PreviewReference) {
    try {
      if (value.projectId !== projectId.value)
        throw new Error("项目已切换，请重新框选");
      if (!options.value) throw new Error("引用配置尚未就绪，请稍后重试");
      validateReferenceBudget([...items.value, value], options.value);
      items.value = [...items.value, value];
      error.value = "";
      return true;
    } catch (e) {
      error.value = errorText(e);
      return false;
    }
  }
  function remove(id: string) {
    items.value = items.value.filter((r) => r.id !== id);
    error.value = "";
  }
  function clear() {
    items.value = [];
    error.value = "";
  }
  function validate() {
    if (items.value.length) {
      if (!options.value) throw new Error("引用配置未就绪");
      validateReferenceBudget(items.value, options.value);
    }
  }
  return { items, error, add, remove, clear, validate };
}
