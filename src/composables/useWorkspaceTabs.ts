import { computed, ref, watch, type Ref } from "vue";
import type { PreviewAnchor } from "../domain/previewReferences";
import type { WorkspaceArea } from "../domain/workspaceView";

export type WorkspacePage =
  "start" | "workspace" | "changes" | "artifacts" | "plan";
export interface WorkspaceFileTab {
  kind: "file";
  id: string;
  path: string;
  area: WorkspaceArea;
  scopeId: string;
  anchor?: PreviewAnchor;
  loaded?: boolean;
}
export type WorkspaceTab =
  WorkspaceFileTab | { kind: "sources"; id: string; replyId: string } | { kind: WorkspacePage; id: string };
export const workspaceTabLabels: Record<WorkspacePage, string> = {
  start: "新标签页",
  workspace: "工作空间",
  changes: "变更",
  artifacts: "产物",
  plan: "计划",
};
export function workspaceFileKey(
  file: Pick<WorkspaceFileTab, "scopeId" | "area" | "path">,
) {
  return `file:${file.scopeId}:${file.area}:${file.path}`;
}
export function workspaceTabTitle(tab: WorkspaceTab) {
  return tab.kind === "file"
    ? tab.path.split("/").pop()!
    : tab.kind === "sources"
      ? "引用来源"
    : workspaceTabLabels[tab.kind];
}

/** 所有工作区页面共用一个有序标签集；文件实例的编辑状态由预览组件自己持有。 */
export function useWorkspaceTabs(
  scopeId: Ref<string>,
  storageKey: Ref<string>,
  canClose: (tab: WorkspaceTab) => boolean,
) {
  const tabs = ref<WorkspaceTab[]>([]);
  const activeId = ref("");
  const active = computed(() =>
    tabs.value.find((tab) => tab.id === activeId.value),
  );
  const files = computed(() =>
    tabs.value.filter((tab): tab is WorkspaceFileTab => tab.kind === "file"),
  );
  const selected = computed(() =>
    active.value?.kind === "file" ? active.value : undefined,
  );
  const page = computed(() =>
    active.value?.kind === "file" ? "preview" : active.value?.kind,
  );
  function activate(tab: WorkspaceTab) {
    if (tab.kind === "file") tab.loaded = true;
    activeId.value = tab.id;
  }
  function newTab() {
    const tab: WorkspaceTab = {
      kind: "start",
      id: `start:${crypto.randomUUID()}`,
    };
    tabs.value.push(tab);
    activate(tab);
  }
  function open(tab: WorkspaceTab) {
    const existing = tabs.value.find((item) => item.id === tab.id);
    const blank = active.value?.kind === "start" ? activeId.value : "";
    if (existing) {
      if (blank) tabs.value = tabs.value.filter((item) => item.id !== blank);
      activate(existing);
    } else {
      const index = tabs.value.findIndex((item) => item.id === blank);
      if (index >= 0) tabs.value.splice(index, 1, tab);
      else tabs.value.push(tab);
      activate(tabs.value.find((item) => item.id === tab.id)!);
    }
  }
  function openPage(kind: Exclude<WorkspacePage, "start">) {
    open({ kind, id: `page:${kind}` });
  }
  function openFile(file: Omit<WorkspaceFileTab, "kind" | "id">) {
    open({ ...file, kind: "file", id: workspaceFileKey(file) });
  }
  function openSources(replyId: string) {
    open({ kind: "sources", id: `sources:${replyId}`, replyId });
  }
  function remove(ids: Set<string>) {
    const index = tabs.value.findIndex((tab) => tab.id === activeId.value);
    tabs.value = tabs.value.filter((tab) => !ids.has(tab.id));
    if (!tabs.value.length) newTab();
    else if (!active.value)
      activate(tabs.value[Math.min(index, tabs.value.length - 1)]!);
  }
  function close(tab: WorkspaceTab) {
    if (canClose(tab)) remove(new Set([tab.id]));
  }
  function removeFiles(matches: (tab: WorkspaceFileTab) => boolean) {
    remove(new Set(files.value.filter(matches).map((tab) => tab.id)));
  }
  watch(
    storageKey,
    () => {
      tabs.value = [];
      activeId.value = "";
      try {
        const saved = JSON.parse(
          storageKey.value
            ? sessionStorage.getItem(storageKey.value) || "null"
            : "null",
        );
        const seen = new Set<string>();
        if (Array.isArray(saved?.tabs)) {
          for (const item of saved.tabs) {
            let tab: WorkspaceTab;
            if (
              item?.kind === "file" &&
              item.scopeId === scopeId.value &&
              typeof item.path === "string" &&
              item.path &&
              ["uploads", "work", "artifacts"].includes(item.area)
            ) {
              tab = {
                kind: "file",
                id: workspaceFileKey(item),
                path: item.path,
                area: item.area,
                scopeId: item.scopeId,
              };
            } else if (
              item?.kind === "sources" && typeof item.replyId === "string" &&
              item.replyId && item.id === `sources:${item.replyId}`
            ) {
              tab = { kind: "sources", id: item.id, replyId: item.replyId };
            } else if (
              item &&
              Object.hasOwn(workspaceTabLabels, item.kind) &&
              typeof item.id === "string" &&
              (item.kind === "start"
                ? item.id.startsWith("start:")
                : item.id === `page:${item.kind}`)
            ) {
              tab = { kind: item.kind, id: item.id };
            } else continue;
            if (!seen.has(tab.id)) {
              tabs.value.push(tab);
              seen.add(tab.id);
            }
          }
          activeId.value = seen.has(saved.active)
            ? saved.active
            : tabs.value[0]?.id || "";
        }
      } catch {
        /* 不可读的浏览器缓存不阻断项目文件。 */
      }
      if (!tabs.value.length) openPage("workspace");
      else if (active.value) activate(active.value);
    },
    { immediate: true, flush: "sync" },
  );
  watch(
    [tabs, activeId],
    () => {
      if (!storageKey.value) return;
      sessionStorage.setItem(
        storageKey.value,
        JSON.stringify({
          active: activeId.value,
          tabs: tabs.value.map((tab) =>
            tab.kind === "file"
              ? {
                  kind: tab.kind,
                  id: tab.id,
                  path: tab.path,
                  area: tab.area,
                  scopeId: tab.scopeId,
                }
              : tab.kind === "sources"
                ? { kind: tab.kind, id: tab.id, replyId: tab.replyId }
                : { kind: tab.kind, id: tab.id },
          ),
        }),
      );
    },
    { deep: true },
  );
  return {
    tabs,
    activeId,
    active,
    files,
    selected,
    page,
    activate,
    newTab,
    openPage,
    openFile,
    openSources,
    close,
    removeFiles,
  };
}
