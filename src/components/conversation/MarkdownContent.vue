<script setup lang="ts">
import { computed } from "vue";
import { marked } from "marked";
import DOMPurify from "dompurify";
import type { TextAnnotation } from "../../domain/textAnnotations";
const props = defineProps<{ text: string; annotations?: TextAnnotation[] }>();
const emit = defineEmits<{
  file: [path: string];
  annotation: [value: TextAnnotation];
}>();
const html = computed(() => {
  const safe = DOMPurify.sanitize(
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
  );
  if (!props.annotations?.length) return safe;
  // 只替换正文 Text 节点，不改写属性、链接或代码，避免标记破坏净化后的 HTML。
  const template = document.createElement("template");
  template.innerHTML = safe;
  const walker = document.createTreeWalker(
    template.content,
    NodeFilter.SHOW_TEXT,
  );
  const nodes: Text[] = [];
  let node: Node | null;
  while ((node = walker.nextNode()))
    if (!node.parentElement?.closest("a,pre,code")) nodes.push(node as Text);
  for (const textNode of nodes) {
    const text = textNode.data,
      fragment = document.createDocumentFragment();
    let offset = 0;
    for (const match of text.matchAll(/\[\[annotation:(\d+)\]\]/g)) {
      const index = Number(match[1]),
        annotation = props.annotations[index - 1];
      if (!annotation) continue;
      fragment.append(text.slice(offset, match.index));
      const anchor = document.createElement("a");
      anchor.href = `#annotation-${encodeURIComponent(annotation.id)}`;
      anchor.className = "annotation-answer-link";
      anchor.textContent = `注释 ${index}`;
      fragment.append(anchor);
      offset = match.index! + match[0].length;
    }
    if (offset) {
      fragment.append(text.slice(offset));
      textNode.replaceWith(fragment);
    }
  }
  return template.innerHTML;
});
function link(event: MouseEvent) {
  const target = (event.target as Element).closest("a");
  if (!target) return;
  const href = target.getAttribute("href");
  if (!href) return;
  if (href.startsWith("#annotation-")) {
    const annotation = props.annotations?.find(
      (item) =>
        item.id === decodeURIComponent(href.slice("#annotation-".length)),
    );
    if (annotation) {
      event.preventDefault();
      emit("annotation", annotation);
    }
    return;
  }
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
