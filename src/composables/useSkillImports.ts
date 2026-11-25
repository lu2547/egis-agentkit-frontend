import { computed, ref, onMounted, onUnmounted, type Ref } from "vue";
import { manager } from "../api/manager";
import { errorText } from "../api/http";
import type { SkillImportJob } from "../types/api";

const ACTIVE_REFRESH_MS = 1500;
const REVIEW_REFRESH_MS = 10_000;

export function useSkillImports(
  onCompleted?: () => void | Promise<void>,
  userId?: Readonly<Ref<string | undefined>>,
) {
  const allJobs = ref<SkillImportJob[]>([]),
    success = ref(""),
    dismissVersion = ref(0),
    error = ref(""),
    loading = ref(false),
    retrying = ref("");
  let timer: ReturnType<typeof setTimeout> | undefined,
    disposed = false,
    request = 0;
  const fingerprint = (job: SkillImportJob) =>
    `${job.status}:${job.attempts}:${job.updated_at}`;
  const terminal = (job: SkillImportJob) =>
    job.status === "failed" || job.status === "rejected";
  function dismissals(): Record<string, string> {
    if (!userId?.value) return {};
    try {
      const value = JSON.parse(localStorage.getItem(`egis_skill_imports_dismissed:${userId.value}`) || "{}");
      return value && typeof value === "object" && !Array.isArray(value) ? value : {};
    } catch { return {}; }
  }
  const jobs = computed(() => {
    void dismissVersion.value;
    const dismissed = dismissals();
    return allJobs.value.filter((job) => !terminal(job) || dismissed[job.job_id] !== fingerprint(job));
  });
  function dismiss(jobId: string) {
    const job = allJobs.value.find((item) => item.job_id === jobId);
    if (!job || !terminal(job) || !userId?.value) return;
    try {
      localStorage.setItem(`egis_skill_imports_dismissed:${userId.value}`, JSON.stringify({ ...dismissals(), [jobId]: fingerprint(job) }));
      dismissVersion.value++;
    } catch { /* A blocked local store must not remove server job history. */ }
  }
  function schedule() {
    clearTimeout(timer);
    if (disposed) return;
    const active = allJobs.value.some(
      (job) => job.status === "queued" || job.status === "running",
    );
    if (active) {
      timer = setTimeout(() => void refresh(), ACTIVE_REFRESH_MS);
    } else if (allJobs.value.some((job) => job.status === "pending_approval")) {
      timer = setTimeout(() => void refresh(), REVIEW_REFRESH_MS);
    }
  }
  async function refresh() {
    const current = ++request;
    loading.value = true;
    try {
      const result = await manager.skillImports();
      if (disposed || current !== request) return;
      const completed = result.items.filter(
        (job) =>
          job.status === "succeeded" &&
          allJobs.value.some(
            (previous) =>
              previous.job_id === job.job_id && previous.status !== "succeeded",
          ),
      );
      allJobs.value = result.items;
      if (completed.length) success.value = completed.map((job) => `${job.filename} 导入完成。`).join(" ");
      error.value = "";
      if (completed.length) await onCompleted?.();
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
    if (userId?.value) {
      try {
        const dismissed = dismissals();
        delete dismissed[job.job_id];
        localStorage.setItem(`egis_skill_imports_dismissed:${userId.value}`, JSON.stringify(dismissed));
        dismissVersion.value++;
      } catch { /* Tracking remains available without local storage. */ }
    }
    request++;
    loading.value = false;
    allJobs.value = [
      job,
      ...allJobs.value.filter((previous) => previous.job_id !== job.job_id),
    ];
    if (job.status === "succeeded") success.value = `${job.filename} 导入完成。`;
    else success.value = `${job.filename} 已提交导入。`;
    schedule();
  }
  async function retry(jobId: string) {
    retrying.value = jobId;
    error.value = "";
    try {
      track(await manager.retrySkillImport(jobId));
      success.value = "已重新提交导入。";
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
  return { jobs, error, success, loading, retrying, refresh, track, retry, dismiss };
}
