<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, watch } from "vue";

const props = withDefaults(
  defineProps<{ open: boolean; label: string; width?: number }>(),
  { width: 520 },
);
const emit = defineEmits<{ close: [] }>();
const panel = ref<HTMLElement>();
let previousFocus: { element: HTMLElement; visible: boolean } | undefined;
let previousOverflow: string | undefined;
const focusSelector =
  'button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), a[href], [tabindex="0"]';

function focusable() {
  return Array.from(
    panel.value?.querySelectorAll<HTMLElement>(focusSelector) ?? [],
  ).filter((element) => !element.closest('[hidden], [aria-hidden="true"]'));
}
function release() {
  if (previousOverflow !== undefined) {
    document.body.style.overflow = previousOverflow;
    previousOverflow = undefined;
  }
  const opener = previousFocus;
  previousFocus = undefined;
  if (!opener?.element.isConnected) return;

  const { element, visible } = opener;
  element.focus();
  // Esc can make a previously pointer-focused opener match :focus-visible.
  if (visible || !element.matches(":focus-visible")) return;
  element.dataset.dialogFocusReturn = "";
  const listeners = new AbortController();
  function showFocus() {
    delete element.dataset.dialogFocusReturn;
    listeners.abort();
  }
  element.addEventListener("blur", showFocus, { signal: listeners.signal });
  element.addEventListener("keydown", showFocus, { signal: listeners.signal });
}
watch(
  () => props.open,
  async (open) => {
    if (!open) {
      release();
      return;
    }
    const opener = document.activeElement;
    previousFocus =
      opener instanceof HTMLElement
        ? { element: opener, visible: opener.matches(":focus-visible") }
        : undefined;
    previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    await nextTick();
    if (props.open)
      (
        panel.value?.querySelector<HTMLElement>("[autofocus]") ??
        focusable()[0] ??
        panel.value
      )?.focus();
  },
  { immediate: true },
);
onBeforeUnmount(release);

function onKeydown(event: KeyboardEvent) {
  if (event.key === "Escape" && !event.isComposing) {
    event.preventDefault();
    event.stopPropagation();
    emit("close");
  }
  if (event.key !== "Tab") return;
  const items = focusable();
  const first = items[0];
  const last = items[items.length - 1];
  if (!first || !last) {
    event.preventDefault();
    panel.value?.focus();
    return;
  }
  if (
    event.shiftKey &&
    (document.activeElement === first || document.activeElement === panel.value)
  ) {
    event.preventDefault();
    last.focus();
  } else if (
    !event.shiftKey &&
    (document.activeElement === last || document.activeElement === panel.value)
  ) {
    event.preventDefault();
    first.focus();
  }
}
</script>

<template>
  <Teleport to="body">
    <Transition
      name="dialog"
      @before-leave="
        (el) => {
          (el as HTMLElement).inert = true;
        }
      "
      @before-enter="
        (el) => {
          (el as HTMLElement).inert = false;
        }
      "
      ><div
        v-if="open"
        class="dialog-overlay"
        data-testid="dialog-overlay"
        @click.self="emit('close')"
      >
        <section
          ref="panel"
          class="dialog-panel"
          role="dialog"
          aria-modal="true"
          :aria-label="label"
          tabindex="-1"
          :style="{ maxWidth: `${width}px` }"
          @keydown="onKeydown"
        >
          <slot />
        </section></div
    ></Transition>
  </Teleport>
</template>

<style scoped src="../../styles/components/DialogShell.css"></style>
