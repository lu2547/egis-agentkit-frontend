import { ref, shallowRef } from "vue";
import { errorText } from "../api/http";
export function useAsyncData<T>(fetcher: () => Promise<T>) {
  const data = shallowRef<T>(),
    loading = ref(false),
    error = ref("");
  let generation = 0;
  async function load() {
    const key = ++generation;
    loading.value = true;
    error.value = "";
    try {
      const value = await fetcher();
      if (key === generation) data.value = value;
    } catch (e) {
      if (key === generation) error.value = errorText(e);
    } finally {
      if (key === generation) loading.value = false;
    }
  }
  return { data, loading, error, load };
}
