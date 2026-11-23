import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { computed, effectScope, nextTick, ref } from "vue";
import {
  useWorkspaceTabs,
  type WorkspaceTab,
} from "../src/composables/useWorkspaceTabs";

let saved: Map<string, string>;
let scopes: ReturnType<typeof effectScope>[];
beforeEach(() => {
  saved = new Map();
  scopes = [];
  vi.stubGlobal("sessionStorage", {
    getItem: (key: string) => saved.get(key) || null,
    setItem: (key: string, value: string) => saved.set(key, value),
  });
});
afterEach(() => {
  scopes.forEach((scope) => scope.stop());
  vi.unstubAllGlobals();
});
function setup(canClose: (tab: WorkspaceTab) => boolean = () => true) {
  const scope = effectScope();
  scopes.push(scope);
  const id = ref("project:p:session:s1");
  const key = computed(() => `egis_workspace_tabs:alice:${id.value}`);
  const state = scope.run(() => useWorkspaceTabs(id, key, canClose))!;
  const file = (path: string, area: "uploads" | "artifacts" = "uploads") => ({
    path,
    area,
    scopeId: id.value,
  });
  return { state, id, key, file };
}
it("replaces an entry page with its destination and reuses an already open page", () => {
  const { state } = setup();
  state.newTab();
  state.openPage("changes");
  expect(state.tabs.value.map((tab) => tab.kind)).toEqual([
    "workspace",
    "changes",
  ]);
  state.newTab();
  state.openPage("workspace");
  expect(state.tabs.value.map((tab) => tab.kind)).toEqual([
    "workspace",
    "changes",
  ]);
  expect(state.page.value).toBe("workspace");
});
it("deduplicates a file by scope, area and path while distinguishing other storage areas", () => {
  const { state, file } = setup();
  state.openFile(file("report.md"));
  state.newTab();
  state.openFile(file("report.md"));
  expect(state.files.value).toHaveLength(1);
  state.openFile(file("report.md", "artifacts"));
  expect(state.files.value).toHaveLength(2);
  expect(state.selected.value?.area).toBe("artifacts");
});
it("protects an unsaved file when its tab is closed", () => {
  const { state, file } = setup((tab) => tab.kind !== "file");
  state.openFile(file("budget.xlsx"));
  state.close(state.selected.value!);
  expect(state.selected.value?.path).toBe("budget.xlsx");
  expect(state.files.value).toHaveLength(1);
});
it("selects a neighbour on close and provides an entry page after the final tab closes", () => {
  const { state, file } = setup();
  state.openFile(file("one.md"));
  state.openFile(file("two.md"));
  state.close(state.selected.value!);
  expect(state.selected.value?.path).toBe("one.md");
  state.close(state.selected.value!);
  state.close(state.active.value!);
  expect(state.tabs.value.map((tab) => tab.kind)).toEqual(["start"]);
  expect(state.page.value).toBe("start");
});
it("restores ordered pages and files per conversation without persisting preview contents or anchors", async () => {
  const { state, file, id, key } = setup();
  state.openPage("changes");
  state.openFile(file("one.md"));
  state.selected.value!.anchor = { checksum: "not-persisted" } as never;
  await nextTick();
  const stored = saved.get(key.value)!;
  expect(stored).not.toContain("not-persisted");
  expect(stored).not.toContain("loaded");
  id.value = "project:p:session:s2";
  expect(state.files.value).toEqual([]);
  expect(state.page.value).toBe("workspace");
  id.value = "project:p:session:s1";
  expect(state.tabs.value.map((tab) => tab.kind)).toEqual([
    "workspace",
    "changes",
    "file",
  ]);
  expect(state.selected.value?.path).toBe("one.md");
  expect(state.selected.value?.loaded).toBe(true);
});
it("removes deleted files without closing pages or other open files", () => {
  const { state, file } = setup();
  state.openFile(file("folder/a.md"));
  state.openFile(file("b.md"));
  state.removeFiles((tab) => tab.path.startsWith("folder/"));
  expect(state.tabs.value.map((tab) => tab.kind)).toEqual([
    "workspace",
    "file",
  ]);
  expect(state.selected.value?.path).toBe("b.md");
});

it("opens reply sources as normal tabs, reuses an existing source tab and preserves open files", async () => {
  const { state, file, id } = setup();
  state.openFile(file("report.md"));
  state.openSources("reply-1");
  state.newTab();
  state.openSources("reply-1");
  expect(state.tabs.value.map((tab) => tab.kind)).toEqual(["workspace", "file", "sources"]);
  expect(state.files.value.map((tab) => tab.path)).toEqual(["report.md"]);
  state.openSources("reply-2");
  await nextTick();
  id.value = "project:p:session:s2";
  expect(state.tabs.value.map((tab) => tab.kind)).toEqual(["workspace"]);
  id.value = "project:p:session:s1";
  expect(state.active.value).toEqual({ kind: "sources", id: "sources:reply-2", replyId: "reply-2" });
  state.close(state.active.value!);
  expect(state.active.value?.id).toBe("sources:reply-1");
});
