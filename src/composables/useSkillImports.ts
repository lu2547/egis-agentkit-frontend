import { ref, onMounted, onUnmounted } from "vue";
import { manager } from "../api/manager";
import { errorText } from "../api/http";
import type { SkillImportJob } from "../types/api";

export function useSkillImports(onCompleted?: () => void | Promise<void>) {
  const jobs = ref<SkillImportJob[]>([]),
    error = ref(""),
    loading = ref(false),
    retrying = ref("");
  let timer: ReturnType<typeof setTimeout> | undefined,
    disposed = false,
    request = 0;
  function schedule() {
    clearTimeout(timer);
    if (
      !disposed &&
      jobs.value.some(
        (job) => job.status === "queued" || job.status === "running",
      )
    )
      timer = setTimeout(() => void refresh(), 1500);
  }
  async function refresh() {
    const current = ++request;
    loading.value = true;
    try {
      const result = await manager.skillImports();
      if (disposed || current !== request) return;
      const changed = result.items.some(
        (job) =>
          job.status === "succeeded" &&
          jobs.value.some(
            (previous) =>
              previous.job_id === job.job_id && previous.status !== "succeeded",
          ),
      );
      jobs.value = result.items;
      error.value = "";
      if (changed) await onCompleted?.();
    } catch (e) {
      if (!disposed && current === request) error.value = errorText(e);
    } finally {
      if (!disposed && current === request) {
        loading.value = false;
        schedule();
      }
    }
  }
  function track(job: SkillImportJob) {
    request++;
    loading.value = false;
    jobs.value = [
      job,
      ...jobs.value.filter((previous) => previous.job_id !== job.job_id),
    ];
    schedule();
  }
  async function retry(jobId: string) {
    retrying.value = jobId;
    error.value = "";
    try {
      track(await manager.retrySkillImport(jobId));
    } catch (e) {
      error.value = errorText(e);
    } finally {
      retrying.value = "";
    }
  }
  onMounted(refresh);
  onUnmounted(() => {
    disposed = true;
    request++;
    clearTimeout(timer);
  });
  return { jobs, error, loading, retrying, refresh, track, retry };
}
