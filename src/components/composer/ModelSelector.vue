<script setup lang="ts">
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  useId,
  watch,
} from "vue";
import { Check, ChevronDown, Cpu } from "lucide-vue-next";
import type { ModelOption } from "../../types/api";

const props = defineProps<{
  model: string;
  models: ModelOption[];
  disabled?: boolean;
}>();
const emit = defineEmits<{ "update:model": [id: string] }>();
const selected = computed(() =>
  props.models.find((item) => item.key === props.model),
);
const open = ref(false);
const root = ref<HTMLElement>();
const trigger = ref<HTMLButtonElement>();
const list = ref<HTMLElement>();
const activeIndex = ref(0);
const menuId = useId();
const offset = ref(0);
watch(
  () => props.disabled,
  (value) => {
    if (value) open.value = false;
  },
);

function choose(id: string) {
  if (props.disabled) return;
  emit("update:model", id);
  open.value = false;
  trigger.value?.focus();
}
async function toggle() {
  if (props.disabled || !props.models.length) return;
  offset.value = 0;
  open.value = !open.value;
  if (open.value) {
    activeIndex.value = Math.max(
      0,
      props.models.findIndex((item) => item.key === props.model),
    );
    await nextTick();
    const rect = list.value?.getBoundingClientRect();
    if (rect)
      offset.value = Math.max(
        12 - rect.left,
        Math.min(0, window.innerWidth - rect.right - 12),
      );
    list.value?.querySelector<HTMLElement>('[aria-selected="true"]')?.focus();
  }
}
function onKeys(event: KeyboardEvent) {
  if (event.key === "Escape") {
    open.value = false;
    trigger.value?.focus();
    return;
  }
  if (!open.value) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      void toggle();
    }
    return;
  }
  if (!props.models.length) return;
  if (event.key === "ArrowDown" || event.key === "ArrowUp") {
    event.preventDefault();
    activeIndex.value =
      (activeIndex.value +
        (event.key === "ArrowDown" ? 1 : -1) +
        props.models.length) %
      props.models.length;
    list.value
      ?.querySelectorAll<HTMLElement>('[role="option"]')
      [activeIndex.value]?.focus();
  }
}
function clickOutside(event: PointerEvent) {
  if (!root.value?.contains(event.target as Node)) open.value = false;
}
onMounted(() => document.addEventListener("pointerdown", clickOutside));
onBeforeUnmount(() =>
  document.removeEventListener("pointerdown", clickOutside),
);
</script>

<template>
  <div ref="root" class="model-selector" @keydown="onKeys">
    <button
      ref="trigger"
      type="button"
      class="model-trigger"
      :class="{ open }"
      aria-label="模型"
      :data-value="model"
      :disabled="disabled || !models.length"
      aria-haspopup="listbox"
      :aria-expanded="open"
      :aria-controls="menuId"
      @click="toggle"
    >
      <Cpu :size="16" :stroke-width="1.6" />
      <span class="model-name">{{ selected?.display_name ?? model }}</span>
      <ChevronDown :size="12" class="chevron" :class="{ rotated: open }" />
    </button>
    <div
      v-if="open"
      :id="menuId"
      ref="list"
      class="model-menu"
      :style="{ translate: `${offset}px 0` }"
      role="listbox"
      aria-label="可用模型"
    >
      <button
        v-for="(item, index) in models"
        :key="item.key"
        type="button"
        role="option"
        class="model-option"
        :class="{ selected: item.key === model }"
        :aria-selected="item.key === model"
        :data-model-id="item.key"
        :tabindex="index === activeIndex ? 0 : -1"
        @click="choose(item.key)"
      >
        <Cpu :size="16" :stroke-width="1.6" />
        <span class="option-name">{{ item.display_name }}</span>
        <Check v-if="item.key === model" :size="14" class="check" />
        <span v-else class="check-space" />
      </button>
      <p v-if="!models.length" class="empty">暂无可用模型</p>
    </div>
  </div>
</template>

<style scoped src="../../styles/components/model-selector.css"></style>
