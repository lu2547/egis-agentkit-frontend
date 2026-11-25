import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ref } from "vue";
import type { SkillImportJob } from "../src/types/api";
const lifecycle = vi.hoisted(() => ({
  mounted: [] as (() => unknown)[],
  unmounted: [] as (() => void)[],
}));
vi.mock("vue", async (importOriginal) => ({
  ...(await importOriginal<typeof import("vue")>()),
  onMounted: (callback: () => unknown) => lifecycle.mounted.push(callback),
  onUnmounted: (callback: () => void) => lifecycle.unmounted.push(callback),
}));
vi.mock("../src/api/manager", () => ({
  manager: { skillImports: vi.fn(), retrySkillImport: vi.fn() },
}));
import { manager } from "../src/api/manager";
import { useSkillImports } from "../src/composables/useSkillImports";
const job = (status: SkillImportJob["status"]): SkillImportJob => ({
  job_id: "import-1",
  status,
  stage: status,
  progress: status === "succeeded" ? 100 : 10,
  filename: "skill.zip",
  category: "办公协同",
  avatar: "skill:ppt",
  attempts: 1,
  created_at: "2026-11-06",
  updated_at: "2026-11-06",
  ...(status === "failed" ? { error: "缺少 SKILL.md" } : {}),
});
beforeEach(() => {
  const values = new Map<string, string>();
  vi.stubGlobal("localStorage", { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) });
  vi.useFakeTimers();
  vi.clearAllMocks();
  lifecycle.mounted.length = 0;
  lifecycle.unmounted.length = 0;
});
afterEach(() => {
  lifecycle.unmounted.forEach((callback) => callback());
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
describe("asynchronous skill imports", () => {
  it("polls active jobs and refreshes resources only when import completes", async () => {
    vi.mocked(manager.skillImports)
      .mockResolvedValueOnce({ items: [job("queued")] })
      .mockResolvedValueOnce({ items: [job("running")] })
      .mockResolvedValueOnce({ items: [job("succeeded")] });
    const completed = vi.fn();
    const imports = useSkillImports(completed);
    await lifecycle.mounted[0]();
    expect(imports.jobs.value[0].status).toBe("queued");
    expect(completed).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1500);
    expect(imports.jobs.value[0].status).toBe("running");
    expect(completed).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1500);
    expect(completed).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });
  it("retains failed errors and tracks a retry before polling again", async () => {
    vi.mocked(manager.skillImports).mockResolvedValue({
      items: [job("failed")],
    });
    vi.mocked(manager.retrySkillImport).mockResolvedValue(job("queued"));
    const imports = useSkillImports();
    await lifecycle.mounted[0]();
    expect(imports.jobs.value[0].error).toBe("缺少 SKILL.md");
    expect(vi.getTimerCount()).toBe(0);
    await imports.retry("import-1");
    expect(manager.retrySkillImport).toHaveBeenCalledWith("import-1");
    expect(imports.jobs.value).toHaveLength(1);
    expect(imports.jobs.value[0].status).toBe("queued");
    expect(vi.getTimerCount()).toBe(1);
  });
  it("keeps a newly submitted job when an earlier list request finishes", async () => {
    let resolve!: (value: { items: SkillImportJob[] }) => void;
    vi.mocked(manager.skillImports).mockReturnValue(
      new Promise((done) => {
        resolve = done;
      }),
    );
    const imports = useSkillImports();
    const fetching = lifecycle.mounted[0]();
    imports.track(job("queued"));
    resolve({ items: [] });
    await fetching;
    expect(imports.jobs.value[0].job_id).toBe("import-1");
    expect(imports.loading.value).toBe(false);
    lifecycle.unmounted.forEach((callback) => callback());
    expect(vi.getTimerCount()).toBe(0);
  });
  it("shows polling errors without dropping active jobs", async () => {
    vi.mocked(manager.skillImports).mockRejectedValue(new Error("网络中断"));
    const imports = useSkillImports();
    imports.track(job("running"));
    await imports.refresh();
    expect(imports.error.value).toContain("网络中断");
    expect(imports.jobs.value[0].status).toBe("running");
    expect(vi.getTimerCount()).toBe(1);
  });
});


describe("terminal import dismissal", () => {
  it("persists failed or rejected dismissal per user and resurfaces a retried attempt", async () => {
    const user = ref<string | undefined>("alice");
    vi.mocked(manager.skillImports).mockResolvedValue({ items: [job("failed")] });
    const imports = useSkillImports(undefined, user);
    await imports.refresh();
    imports.dismiss("import-1");
    expect(imports.jobs.value).toEqual([]);
    await imports.refresh();
    expect(imports.jobs.value).toEqual([]);
    const reloaded = useSkillImports(undefined, user);
    await reloaded.refresh();
    expect(reloaded.jobs.value).toEqual([]);
    user.value = "bob";
    await reloaded.refresh();
    expect(reloaded.jobs.value[0].status).toBe("failed");
    user.value = "alice";
    vi.mocked(manager.skillImports).mockResolvedValue({ items: [{ ...job("failed"), attempts: 2 }] });
    await reloaded.refresh();
    expect(reloaded.jobs.value[0].attempts).toBe(2);
  });
  it("never dismisses an active import and clears dismissal for an explicit retry", async () => {
    const imports = useSkillImports(undefined, ref("alice"));
    imports.track(job("running"));
    imports.dismiss("import-1");
    expect(imports.jobs.value).toHaveLength(1);
    imports.track(job("rejected"));
    imports.dismiss("import-1");
    expect(imports.jobs.value).toEqual([]);
    vi.mocked(manager.retrySkillImport).mockResolvedValue(job("queued"));
    await imports.retry("import-1");
    expect(imports.jobs.value[0].status).toBe("queued");
    expect(imports.success.value).toContain("重新提交");
  });
  it("announces a completed import instead of silently removing its progress card", async () => {
    const imports = useSkillImports();
    imports.track(job("running"));
    vi.mocked(manager.skillImports).mockResolvedValue({ items: [job("succeeded")] });
    await imports.refresh();
    expect(imports.success.value).toContain("skill.zip");
    expect(imports.success.value).toContain("导入完成");
  });
});
