<script setup lang="ts">
import { GraduationCap, Search, WandSparkles } from "lucide-vue-next";
import FileTypeIcon from "../common/FileTypeIcon.vue";
defineProps<{
  options: {
    id: string;
    name: string;
    detail: string;
    kind: "expert" | "skill" | "file";
  }[];
  activeIndex: number;
  trigger: "@" | "/";
}>();
defineEmits<{ select: [index: number]; highlight: [index: number] }>();
</script>

<template>
  <div
    class="context-picker"
    role="listbox"
    :aria-label="trigger === '@' ? '添加上下文' : '调用技能与指令'"
  >
    <div class="picker-heading">
      <Search :size="13" />{{
        trigger === "@" ? "专家与文件上下文" : "技能与指令"
      }}<span>↑↓ 选择 · Enter 确认</span>
    </div>
    <button
      v-for="(item, index) in options"
      :key="`${item.kind}-${item.id}`"
      type="button"
      class="context-option"
      :class="{ selected: index === activeIndex }"
      role="option"
      :aria-selected="index === activeIndex"
      :data-context-id="item.id"
      @mousedown.prevent
      @mouseenter="$emit('highlight', index)"
      @click="$emit('select', index)"
    >
      <GraduationCap v-if="item.kind === 'expert'" :size="17" />
      <WandSparkles v-else-if="item.kind === 'skill'" :size="17" />
      <FileTypeIcon v-else :name="item.name" :size="22" />
      <span class="option-text"
        ><span>{{ item.name }}</span
        ><small>{{ item.detail }}</small></span
      >
      <span class="kind">{{
        item.kind === "expert"
          ? "专家"
          : item.kind === "skill"
            ? "技能"
            : "文件"
      }}</span>
    </button>
    <p v-if="!options.length" class="empty">没有匹配项，试试其他关键词</p>
  </div>
</template>

<style scoped src="../../styles/components/context-picker.css"></style>
