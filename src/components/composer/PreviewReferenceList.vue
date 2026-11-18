<script setup lang="ts">
/** 草稿与历史共用项目文件和框选引用卡片。 */
import FileTypeIcon from "../common/FileTypeIcon.vue";
import {
  getReferenceLabel,
  isProjectFileReference,
  type ChatReference,
} from "../../domain/previewReferences";
defineProps<{
  references: ChatReference[];
  removable?: boolean;
  disabled?: boolean;
}>();
defineEmits<{ open: [value: ChatReference]; remove: [id: string] }>();
</script>
<template>
  <div
    v-if="references.length"
    class="preview-reference-list"
    aria-label="文件引用"
  >
    <div
      v-for="ref in references"
      :key="ref.id"
      class="preview-reference-card"
      :class="{ 'project-file-card': isProjectFileReference(ref) }"
    >
      <button
        type="button"
        class="reference-open"
        :aria-label="`定位引用 ${getReferenceLabel(ref)}`"
        :title="isProjectFileReference(ref) ? ref.path : undefined"
        @click="$emit('open', ref)"
      >
        <template v-if="isProjectFileReference(ref)">
          <FileTypeIcon :name="ref.path" :size="22" />
          <strong>{{ ref.name }}</strong>
        </template>
        <template v-else>
          <img
            class="reference-thumbnail"
            :src="ref.image"
            :alt="getReferenceLabel(ref)"
          />
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
        </template>
      </button>
      <button
        v-if="removable"
        type="button"
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
.reference-thumbnail {
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
.project-file-card .reference-open {
  padding: 5px 8px;
  gap: 6px;
}
.project-file-card .file-type-icon {
  flex-shrink: 0;
}
.project-file-card strong {
  max-width: 280px;
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
.project-file-card .reference-remove {
  align-self: center;
}
</style>
