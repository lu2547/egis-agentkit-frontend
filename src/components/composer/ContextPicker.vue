<script setup lang="ts">
import { ref, onMounted, watch, nextTick, computed } from "vue";
import { GraduationCap, Search, WandSparkles, Terminal } from "lucide-vue-next";
import FileTypeIcon from "../common/FileTypeIcon.vue";
import type { ComposerCategory, ComposerOption } from "../../types/api";
const props = defineProps<{
  options: ComposerOption[];
  activeIndex: number;
  trigger: "@" | "/";
  category: ComposerCategory;
  query: string;
  loading?: boolean;
  hasMore?: boolean;
  error?: string;
}>();
const emit = defineEmits<{
  select: [index: number];
  highlight: [index: number];
  "update:query": [value: string];
  "update:category": [value: ComposerCategory];
  "load-more": [];
  keydown: [event: KeyboardEvent];
  dismiss: [];
}>();
const search = ref<HTMLInputElement>();
const optionsElement = ref<HTMLElement>();
const tabs = computed((): { value: ComposerCategory; label: string }[] =>
  props.trigger === "@"
    ? [
        { value: "context", label: "上下文" },
        { value: "experts", label: "专家" },
      ]
    : [
        { value: "skills", label: "技能" },
        { value: "commands", label: "命令" },
      ],
);
const placeholder = computed(
  () =>
    ({
      context: "搜索项目文件",
      experts: "搜索专家",
      skills: "搜索已安装技能",
      commands: "搜索命令",
    })[props.category],
);
onMounted(() => search.value?.focus());
watch(
  () => props.activeIndex,
  async () => {
    await nextTick();
    optionsElement.value
      ?.querySelector<HTMLElement>(
        `[data-context-index="${props.activeIndex}"]`,
      )
      ?.scrollIntoView({ block: "nearest", inline: "nearest" });
  },
  { flush: "post" },
);
watch(
  () => props.category,
  () => {
    if (optionsElement.value) optionsElement.value.scrollTop = 0;
    search.value?.focus();
  },
);
function scroll(event: Event) {
  const element = event.currentTarget as HTMLElement;
  if (
    props.hasMore &&
    !props.loading &&
    element.scrollHeight - element.scrollTop - element.clientHeight < 40
  )
    emit("load-more");
}
</script>

<template>
  <div
    class="context-picker"
    @keydown.esc.stop.prevent="$emit('dismiss')"
    :aria-label="trigger === '@' ? '添加上下文' : '调用技能与指令'"
  >
    <div class="picker-tabs" role="tablist" aria-label="选择类型">
      <button
        v-for="tab in tabs"
        :key="tab.value"
        type="button"
        role="tab"
        :aria-selected="category === tab.value"
        :class="{ active: category === tab.value }"
        @click="$emit('update:category', tab.value)"
      >
        {{ tab.label }}
      </button>
    </div>
    <div class="picker-heading">
      <Search :size="16" />
      <input
        ref="search"
        :value="query"
        :placeholder="placeholder"
        :aria-label="placeholder"
        @input="
          $emit('update:query', ($event.target as HTMLInputElement).value)
        "
        @keydown.stop="$emit('keydown', $event)"
      />
      <span>↑↓ 选择 · Enter 确认</span>
    </div>
    <div
      ref="optionsElement"
      class="context-options"
      role="listbox"
      :aria-label="tabs.find((tab) => tab.value === category)?.label"
      :aria-busy="loading"
      @scroll="scroll"
    >
      <button
        v-for="(item, index) in options"
        :key="`${item.kind}-${item.id}`"
        type="button"
        class="context-option"
        :class="{ selected: index === activeIndex }"
        role="option"
        :aria-selected="index === activeIndex"
        :data-context-id="item.id"
        :data-context-index="index"
        @mousedown.prevent
        @mouseenter="$emit('highlight', index)"
        @click="$emit('select', index)"
      >
        <GraduationCap v-if="item.kind === 'expert'" :size="17" />
        <WandSparkles v-else-if="item.kind === 'skill'" :size="17" />
        <Terminal v-else-if="item.kind === 'command'" :size="17" />
        <FileTypeIcon v-else :name="item.name" :size="22" />
        <span class="option-text"
          ><span>{{ item.name }}</span
          ><small>{{ item.detail }}</small></span
        >
        <span class="kind">{{
          { expert: "专家", skill: "技能", file: "文件", command: "命令" }[
            item.kind
          ]
        }}</span>
      </button>
      <p v-if="error" class="empty" role="alert">
        {{ error }}
        <button type="button" @click="$emit('load-more')">重试</button>
      </p>
      <p v-else-if="loading" class="empty" role="status">加载中…</p>
      <p v-else-if="!options.length" class="empty">
        {{
          category === "commands"
            ? "暂无可用命令"
            : "没有匹配项，试试其他关键词"
        }}
      </p>
      <button
        v-else-if="hasMore"
        type="button"
        class="picker-more"
        @click="$emit('load-more')"
      >
        加载更多
      </button>
    </div>
  </div>
</template>

<style scoped src="../../styles/components/context-picker.css"></style>
