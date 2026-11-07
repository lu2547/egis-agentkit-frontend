<script setup lang="ts">
import { computed, nextTick, ref, useId, watch } from "vue";
import {
  ArrowDown,
  ArrowUp,
  CornerDownLeft,
  FileText,
  MessageSquare,
  Search,
  SearchX,
  X,
} from "lucide-vue-next";
import { useIdentity } from "../../composables/useIdentity";
import { useRouter } from "vue-router";

import IconButton from "../common/IconButton.vue";
import DialogShell from "../common/DialogShell.vue";

const props = defineProps<{ open: boolean }>();
const { tasks } = useIdentity();
const router = useRouter();
const emit = defineEmits<{
  close: [];
  conversation: [id: string];
  artifact: [id: string];
}>();
type SearchTab = "all" | "tasks" | "artifacts";
type Result = {
  id: string;
  kind: "conversation" | "artifact";
  title: string;
  excerpt: string;
  meta: string;
};
const tabs: { id: SearchTab; label: string }[] = [
  { id: "tasks", label: "历史对话" },
];
const tab = ref<SearchTab>("all");
const query = ref("");
const active = ref(0);
const input = ref<HTMLInputElement>();
const list = ref<HTMLElement>();
const listId = useId();
const keywords = computed(() =>
  query.value.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean),
);
function matches(text: string) {
  return keywords.value.every((term) =>
    text.toLocaleLowerCase().includes(term),
  );
}
function excerpt(text: string) {
  const clean = text.replace(/\s+/g, " ").trim();
  const start = Math.max(
    0,
    clean.toLocaleLowerCase().indexOf(keywords.value[0] ?? "") - 28,
  );
  return `${start > 0 ? "…" : ""}${clean.slice(start, start + 130)}${clean.length > start + 130 ? "…" : ""}`;
}
const results = computed<Result[]>(() => {
  if (!keywords.value.length) return [];
  return tasks.value
    .filter((task) => matches(task.name))
    .map((task) => ({
      id: task.session_id,
      kind: "conversation" as const,
      title: task.name,
      excerpt: task.definition_display_name,
      meta: new Date(task.updated_at).toLocaleDateString("zh-CN"),
    }));
});
watch(
  () => props.open,
  (open) => {
    if (open) {
      query.value = "";
      tab.value = "all";
      active.value = 0;
    }
  },
);
watch(results, () => {
  active.value = 0;
});
function openResult(result?: Result) {
  if (!result) return;
  if (result.kind === "conversation")
    void router.push(`/tasks/${encodeURIComponent(result.id)}`);
  else emit("artifact", result.id);
  emit("close");
}
function selectTab(next: SearchTab) {
  tab.value = next;
  input.value?.focus();
}
async function handleKey(event: KeyboardEvent) {
  if (event.isComposing) return;
  if (event.key === "ArrowDown" || event.key === "ArrowUp") {
    event.preventDefault();
    if (results.value.length)
      active.value =
        (active.value +
          (event.key === "ArrowDown" ? 1 : -1) +
          results.value.length) %
        results.value.length;
    await nextTick();
    list.value
      ?.querySelector<HTMLElement>('[aria-selected="true"]')
      ?.scrollIntoView?.({ block: "nearest" });
  } else if (event.key === "Enter") {
    event.preventDefault();
    openResult(results.value[active.value]);
  } else if (event.key === "Tab" && (event.ctrlKey || event.metaKey)) {
    event.preventDefault();
    const index = tabs.findIndex((item) => item.id === tab.value);
    selectTab(tabs[(index + (event.shiftKey ? 2 : 1)) % tabs.length]!.id);
  }
}
</script>

<template>
  <DialogShell
    :open="open"
    label="全局搜索"
    :width="760"
    @close="emit('close')"
  >
    <div class="global-search">
      <div class="search-header">
        <div class="search-input-wrap">
          <Search :size="21" aria-hidden="true" />
          <input
            ref="input"
            v-model="query"
            autofocus
            autocomplete="off"
            spellcheck="false"
            aria-label="搜索历史对话"
            role="combobox"
            aria-autocomplete="list"
            aria-expanded="true"
            :aria-controls="listId"
            :aria-activedescendant="
              results.length ? `${listId}-${active}` : undefined
            "
            @keydown="handleKey"
          />
          <IconButton
            v-if="query"
            label="清空搜索"
            @click="
              query = '';
              input?.focus();
            "
            ><X :size="17"
          /></IconButton>
        </div>
        <div class="search-tabs" role="tablist" aria-label="搜索类型">
          <button
            v-for="item in tabs"
            :key="item.id"
            type="button"
            role="tab"
            :aria-selected="tab === item.id"
            :class="{ selected: tab === item.id }"
            @click="selectTab(item.id)"
          >
            {{ item.label }}
          </button>
        </div>
      </div>
      <div
        v-if="!keywords.length || !results.length"
        class="search-empty"
        role="status"
      >
        <div v-if="!keywords.length" class="empty-mark" aria-hidden="true">
          <Search :size="76" :stroke-width="1.7" /><img
            class="search-brand"
            src="/brand/assistant-icon.png"
            alt=""
          />
        </div>
        <SearchX v-else :size="68" :stroke-width="1.3" aria-hidden="true" />
        <p>{{ !keywords.length ? "输入关键字进行检索" : "未找到相关结果" }}</p>
        <span v-if="keywords.length">试试其他关键字，或切换搜索类型</span>
      </div>
      <div v-else class="results-scroll">
        <p class="result-count" aria-live="polite">
          找到 {{ results.length }} 条结果
        </p>
        <div
          :id="listId"
          ref="list"
          role="listbox"
          aria-label="搜索结果"
          class="search-results"
        >
          <div
            v-for="(result, index) in results"
            :id="`${listId}-${index}`"
            :key="`${result.kind}-${result.id}`"
            role="option"
            :aria-selected="index === active"
            :data-title="result.title"
            class="search-result"
            :class="{ selected: index === active }"
            @mouseenter="active = index"
            @click="openResult(result)"
          >
            <span class="result-icon"
              ><MessageSquare
                v-if="result.kind === 'conversation'"
                :size="20" /><FileText v-else :size="20"
            /></span>
            <div class="result-copy">
              <strong v-text="result.title" /><span v-text="result.excerpt" />
            </div>
            <span class="result-meta" v-text="result.meta" />
            <CornerDownLeft
              v-if="active === index"
              class="open-arrow"
              :size="15"
              aria-hidden="true"
            />
          </div>
        </div>
      </div>
      <footer class="search-footer">
        <span><ArrowUp :size="13" /><ArrowDown :size="13" /> 上下切换</span>
        <span><CornerDownLeft :size="14" /> 打开</span>
        <span class="tab-hint">⌃ Tab 切换类别</span>
        <button type="button" @click="emit('close')">
          <kbd>ESC</kbd> 关闭窗口
        </button>
      </footer>
    </div>
  </DialogShell>
</template>

<style scoped src="../../styles/components/GlobalSearch.css"></style>
