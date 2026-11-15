<script setup lang="ts">
/** 草稿与历史共用文件引用卡片；点击回到右侧源文件及页码。 */
import {
  getReferenceLabel,
  type PreviewReference,
} from "../../domain/previewReferences";
defineProps<{
  references: PreviewReference[];
  removable?: boolean;
  disabled?: boolean;
}>();
defineEmits<{ open: [value: PreviewReference]; remove: [id: string] }>();
</script>
<template>
  <div
    v-if="references.length"
    class="preview-reference-list"
    aria-label="文件引用"
  >
    <div v-for="ref in references" :key="ref.id" class="preview-reference-card">
      <button
        class="reference-open"
        :aria-label="`定位引用 ${getReferenceLabel(ref)}`"
        @click="$emit('open', ref)"
      >
        <img :src="ref.image" :alt="getReferenceLabel(ref)" />
        <span
          ><strong>{{ ref.path.split("/").pop() }}</strong
          ><small
            >{{
              ref.spreadsheet
                ? getReferenceLabel(ref).split(" · ").slice(1).join(" · ")
                : `第 ${ref.page} / ${ref.pageCount} 页`
            }}<span v-if="ref.regions.length">
              · {{ ref.regions.length }} 个区域</span
            ></small
          ></span
        >
      </button>
      <button
        v-if="removable"
        class="reference-remove"
        :disabled="disabled"
        :aria-label="`移除引用 ${getReferenceLabel(ref)}`"
        @click="$emit('remove', ref.id)"
      >
        ×
      </button>
    </div>
  </div>
</template>
<style scoped>
.preview-reference-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 8px 0;
}
.preview-reference-card {
  display: flex;
  align-items: center;
  position: relative;
  border: 1px solid var(--line);
  border-radius: 10px;
  background: var(--surface);
  max-width: 100%;
  overflow: hidden;
}
.reference-open {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  border: 0;
  background: transparent;
  color: var(--text);
  cursor: pointer;
  text-align: left;
  min-width: 0;
}
.reference-open img {
  width: 72px;
  height: 48px;
  object-fit: contain;
  background: white;
  border-radius: 4px;
}
.reference-open span {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.reference-open strong {
  font-size: 12px;
  max-width: 170px;
  text-overflow: ellipsis;
  overflow: hidden;
  white-space: nowrap;
}
.reference-open small {
  font-size: 11px;
  color: var(--muted);
  white-space: nowrap;
}
.reference-open small span {
  display: inline;
}
.reference-remove {
  align-self: flex-start;
  border: 0;
  background: transparent;
  color: var(--muted);
  padding: 3px 8px;
  font-size: 18px;
  cursor: pointer;
}
</style>
