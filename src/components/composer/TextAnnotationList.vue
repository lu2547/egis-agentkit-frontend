<script setup lang="ts">
/** 注释卡片：草稿可编辑和移除，发出的历史注释只提供查看与原文定位。 */
import { ref, watch } from "vue";
import type { TextAnnotation } from "../../domain/textAnnotations";
const props = defineProps<{
  annotations: TextAnnotation[];
  editable?: boolean;
  disabled?: boolean;
}>();
const emit = defineEmits<{
  update: [id: string, comment: string];
  remove: [id: string];
  locate: [annotation: TextAnnotation];
}>();
const expanded = ref(!!props.editable);
watch(
  () => props.annotations.length,
  (value, previous) => {
    if (props.editable && value > previous) expanded.value = true;
  },
);
</script>
<template>
  <section
    v-if="annotations.length"
    class="text-annotation-list"
    :class="{ editable }"
  >
    <button
      type="button"
      class="annotation-summary"
      :aria-expanded="expanded"
      @click="expanded = !expanded"
    >
      {{ annotations.length }} 条注释
    </button>
    <div v-if="expanded" class="annotation-cards">
      <article
        v-for="(annotation, index) in annotations"
        :key="annotation.id"
        :data-annotation-card="annotation.id"
      >
        <button
          type="button"
          class="annotation-source"
          :aria-label="`定位注释 ${index + 1} 原文`"
          @click="emit('locate', annotation)"
        >
          <span>{{ index + 1 }}.</span><span>{{ annotation.text }}</span>
        </button>
        <label v-if="editable"
          >用户评论<textarea
            :value="annotation.comment"
            :disabled="disabled"
            :aria-label="`注释 ${index + 1} 评论`"
            placeholder="添加可选评论…"
            @input="
              emit(
                'update',
                annotation.id,
                ($event.target as HTMLTextAreaElement).value,
              )
            "
          />
        </label>
        <template v-else
          ><small>用户评论</small>
          <p>{{ annotation.comment || "未填写评论" }}</p></template
        >
        <button
          v-if="editable"
          type="button"
          class="annotation-remove"
          :disabled="disabled"
          :aria-label="`删除注释 ${index + 1}`"
          @click="emit('remove', annotation.id)"
        >
          ×
        </button>
      </article>
    </div>
  </section>
</template>
<style scoped>
.text-annotation-list {
  font-size: 12px;
  margin: 8px 0;
}
.annotation-summary {
  border: 1px solid var(--line);
  background: var(--hover);
  color: var(--text);
  border-radius: 16px;
  padding: 5px 10px;
  cursor: pointer;
}
.annotation-cards {
  max-height: 240px;
  overflow: auto;
  display: grid;
  gap: 8px;
  margin-top: 8px;
}
article {
  position: relative;
  border: 1px solid var(--line);
  border-radius: 10px;
  background: var(--surface);
  padding: 12px 32px 12px 12px;
}
.annotation-source {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  border: 0;
  background: none;
  color: var(--text);
  font: inherit;
  text-align: left;
  line-height: 1.6;
  cursor: pointer;
  width: 100%;
  padding: 0;
}
.annotation-source span:last-child {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  max-height: 120px;
  overflow: auto;
}
.annotation-source span:first-child {
  color: var(--annotation-blue);
  font-weight: 650;
}
label {
  display: block;
  color: var(--muted);
  margin-top: 8px;
}
textarea {
  display: block;
  box-sizing: border-box;
  width: 100%;
  min-height: 54px;
  resize: vertical;
  background: var(--bg);
  border: 1px solid var(--line);
  border-radius: 6px;
  color: var(--text);
  padding: 6px;
  font: inherit;
  margin-top: 4px;
}
small {
  display: block;
  color: var(--muted);
  margin-top: 8px;
}
p {
  margin: 4px 0 0;
  white-space: pre-wrap;
}
.annotation-remove {
  position: absolute;
  right: 7px;
  top: 7px;
  background: none;
  border: 0;
  color: var(--muted);
  font-size: 18px;
  cursor: pointer;
}
button:focus-visible,
textarea:focus-visible {
  outline: 2px solid var(--accent, #2962ff);
  outline-offset: 2px;
}
</style>
