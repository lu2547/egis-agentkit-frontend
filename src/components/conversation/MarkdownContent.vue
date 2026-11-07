<script setup lang="ts">
import { computed } from "vue";
import { marked } from "marked";
import DOMPurify from "dompurify";
const props = defineProps<{ text: string }>();
const emit = defineEmits<{ file: [path: string] }>();
const html = computed(() =>
  DOMPurify.sanitize(
    marked.parse(props.text, { async: false, gfm: true, breaks: true }),
    {
      FORBID_TAGS: [
        "style",
        "iframe",
        "form",
        "input",
        "button",
        "svg",
        "math",
      ],
      FORBID_ATTR: ["style"],
    },
  ),
);
function link(event: MouseEvent) {
  const target = (event.target as Element).closest("a");
  if (!target) return;
  const href = target.getAttribute("href");
  if (!href) return;
  if (!/^(https?:|mailto:|#)/i.test(href)) {
    event.preventDefault();
    try {
      emit(
        "file",
        decodeURIComponent(href.replace(/^(artifact|workspace):\/*/, "")),
      );
    } catch {
      emit("file", href);
    }
  } else if (/^https?:/i.test(href)) {
    target.target = "_blank";
    target.rel = "noopener noreferrer";
  }
}
</script>
<template><div class="markdown" @click="link" v-html="html"></div></template>
<style scoped src="../../styles/components/MarkdownContent.css"></style>
