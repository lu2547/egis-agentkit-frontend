import { ref } from "vue";
import { manager } from "../api/manager";
import { errorText } from "../api/http";
import type { PermissionModeOption, RuntimeOptions } from "../types/api";

export function useRuntimeOptions() {
  const options = ref<PermissionModeOption[]>([]);
  const defaultPermissionMode = ref("");
  const steering = ref<RuntimeOptions["steering"]>();
  const loading = ref(false);
  const error = ref("");
  let generation = 0;
  async function load() {
    const request = ++generation;
    loading.value = true;
    error.value = "";
    try {
      const result = await manager.runtimeOptions();
      if (request !== generation) return;
      options.value = result.permission_modes;
      defaultPermissionMode.value = result.default_permission_mode;
      steering.value = result.steering;
    } catch (e) {
      if (request !== generation) return;
      options.value = [];
      defaultPermissionMode.value = "";
      error.value = errorText(e);
    } finally {
      if (request === generation) loading.value = false;
    }
  }
  return { options, defaultPermissionMode, steering, loading, error, load };
}
