<script setup lang="ts">
import { nextTick, ref } from "vue";
import {
  PanelLeft,
  PanelRight,
  MessageCirclePlus,
  Search,
  X,
  ChevronUp,
  ChevronDown,
} from "lucide-vue-next";
import IconButton from "../common/IconButton.vue";
import { useWorkbenchLayout } from "../../composables/useWorkbenchLayout";
const { sidebarOpen, toggleSidebar } = useWorkbenchLayout();

defineProps<{
  title: string;
  projectId?: string;
  projectName?: string;
  isNewTask?: boolean;
  panelOpen: boolean;
  searchQuery: string;
  matchCount: number;
  matchIndex: number;
}>();
const emit = defineEmits<{
  "toggle-panel": [];
  new: [];
  "update:searchQuery": [query: string];
  "search-next": [direction: number];
}>();
const searching = ref(false);
const input = ref<HTMLInputElement>();
async function openSearch() {
  searching.value = true;
  await nextTick();
  input.value?.focus();
}
function closeSearch() {
  emit("update:searchQuery", "");
  searching.value = false;
}
function searchKey(event: KeyboardEvent) {
  if (event.key === "Escape") {
    event.stopPropagation();
    closeSearch();
  }
  if (event.key === "Enter") emit("search-next", event.shiftKey ? -1 : 1);
}
</script>

<template>
  <header class="topbar task-header">
    <div class="topbar-left">
      <IconButton v-if="!sidebarOpen" label="展开侧边栏" @click="toggleSidebar"
        ><PanelLeft
      /></IconButton>
      <router-link
        v-if="!isNewTask"
        :to="projectId ? `/projects/${encodeURIComponent(projectId)}` : '/'"
        aria-label="新建任务"
        class="new-task"
        ><MessageCirclePlus :size="19"
      /></router-link>
      <RouterLink
        v-if="projectId && projectName && !isNewTask"
        class="project-context"
        :to="`/projects/${encodeURIComponent(projectId)}`"
        >{{ projectName }}</RouterLink
      >
      <h1 v-if="!isNewTask" :title="title">{{ title }}</h1>
    </div>
    <div class="topbar-right">
      <div v-if="searching" class="conversation-search">
        <Search :size="17" />
        <input
          ref="input"
          aria-label="搜索当前对话"
          placeholder="搜索对话内容"
          :value="searchQuery"
          @input="
            emit(
              'update:searchQuery',
              ($event.target as HTMLInputElement).value,
            )
          "
          @keydown="searchKey"
        />
        <span v-if="searchQuery" class="search-count"
          >{{ matchCount ? matchIndex + 1 : 0 }}/{{ matchCount }}</span
        >
        <IconButton
          label="上一个（Shift+Enter）"
          :disabled="!matchCount"
          @click="emit('search-next', -1)"
          ><ChevronUp
        /></IconButton>
        <IconButton
          label="下一个（Enter）"
          :disabled="!matchCount"
          @click="emit('search-next', 1)"
          ><ChevronDown
        /></IconButton>
        <IconButton label="关闭搜索（Esc）" @click="closeSearch"
          ><X
        /></IconButton>
      </div>
      <IconButton v-else label="对话内搜索" @click="openSearch"
        ><Search
      /></IconButton>
      <IconButton
        :label="panelOpen ? '收起右侧面板' : '打开右侧面板'"
        :active="panelOpen"
        @click="emit('toggle-panel')"
        ><PanelRight
      /></IconButton>
    </div>
  </header>
</template>

<style scoped src="../../styles/components/conversation-topbar.css"></style>
