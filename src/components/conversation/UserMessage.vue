<script setup lang="ts">
import type { Msg } from "@agentscope-ai/agentscope/message";
import { computed } from "vue";
import { steeringState } from "../../domain/steering";
import PreviewReferenceList from "../composer/PreviewReferenceList.vue";
import TextAnnotationList from "../composer/TextAnnotationList.vue";
import {
  getTextAnnotations,
  type TextAnnotation,
} from "../../domain/textAnnotations";
import {
  getMessageProjectFiles,
  getMessageReferences,
  type ChatReference,
} from "../../domain/previewReferences";
const props = defineProps<{ message: Msg }>();
const references = computed(() => [
  ...getMessageProjectFiles(props.message),
  ...getMessageReferences(props.message),
]);
const annotations = computed(() => getTextAnnotations(props.message));
const prompt = computed(() => {
  const { annotation_prompt, preview_prompt } = props.message.metadata;
  if (typeof annotation_prompt === "string") return annotation_prompt;
  if (references.value.length && typeof preview_prompt === "string")
    return preview_prompt;
});
defineEmits<{
  reference: [value: ChatReference];
  annotation: [value: TextAnnotation];
}>();
</script>
<template>
  <article class="user-message">
    <div>
      <span v-if="steeringState(message)" class="steering-status"
        >引导 ·
        {{
          steeringState(message) === "received" ? "已接收" : "等待接收"
        }}</span
      >
      <TextAnnotationList
        :annotations="annotations"
        @locate="$emit('annotation', $event)"
      />
      <PreviewReferenceList
        :references="references"
        @open="$emit('reference', $event)"
      />
      <template v-for="block in message.content" :key="block.id"
        ><p v-if="block.type === 'text' && (prompt ?? block.text)">
          {{ prompt ?? block.text }}
        </p>
        <span
          v-else-if="
            block.type === 'data' &&
            !references.some((ref) => ref.id === block.id)
          "
          class="badge"
          >{{ block.name || "附件" }}</span
        ></template
      >
    </div>
  </article>
</template>
<style scoped src="../../styles/components/user-message.css"></style>
