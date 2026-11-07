<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, useId, watch } from "vue";
import {
  Check,
  ChevronDown,
  CircleSlash,
  Eye,
  Hand,
  ShieldAlert,
  ShieldCheck,
} from "lucide-vue-next";
import type { PermissionModeOption } from "../../types/api";

const props = defineProps<{
  modelValue: string;
  options: PermissionModeOption[];
  disabled?: boolean;
}>();
const emit = defineEmits<{ "update:modelValue": [value: string] }>();
const id = useId();
const trigger = ref<HTMLButtonElement | null>(null);
const panel = ref<HTMLElement | null>(null);
const open = ref(false);
const helpOpen = ref(false);
const position = ref<Record<string, string>>({});

const modes = {
  default: {
    label: "请求批准",
    description: "需要操作权限时，先请求你的批准",
    icon: Hand,
  },
  accept_edits: {
    label: "帮我批准",
    description: "自动允许工作目录内的文件操作，其他操作按规则确认",
    icon: ShieldCheck,
  },
  explore: {
    label: "只读探索",
    description: "允许查看和分析，拒绝修改操作",
    icon: Eye,
  },
  dont_ask: {
    label: "不再询问",
    description: "需要你确认时，自动拒绝该操作",
    icon: CircleSlash,
  },
  bypass: {
    label: "完全访问权限",
    description: "跳过大部分工具权限检查，仍受资源授权限制",
    icon: ShieldAlert,
  },
};
function presentation(option: PermissionModeOption) {
  return (
    modes[option.value as keyof typeof modes] || {
      ...option,
      icon: ShieldCheck,
    }
  );
}
const selected = computed(() =>
  props.options.find((option) => option.value === props.modelValue),
);
const selectedLabel = computed(() =>
  selected.value
    ? presentation(selected.value).label
    : props.modelValue || "权限模式",
);
const selectedIcon = computed(() =>
  selected.value ? presentation(selected.value).icon : ShieldCheck,
);
// Keep the higher-risk choice distinct at the end of the menu.
const orderedOptions = computed(() => [
  ...props.options.filter((option) => option.value !== "bypass"),
  ...props.options.filter((option) => option.value === "bypass"),
]);

function updatePosition() {
  if (!trigger.value) return;
  const rect = trigger.value.getBoundingClientRect();
  const margin = 12,
    gap = 8;
  const width = Math.min(392, window.innerWidth - margin * 2);
  const above = rect.top - margin - gap;
  const below = window.innerHeight - rect.bottom - margin - gap;
  const placeAbove = above >= below;
  position.value = {
    left: `${Math.max(margin, Math.min(rect.left, window.innerWidth - width - margin))}px`,
    top: placeAbove ? "auto" : `${rect.bottom + gap}px`,
    bottom: placeAbove ? `${window.innerHeight - rect.top + gap}px` : "auto",
    maxHeight: `${Math.max(0, placeAbove ? above : below)}px`,
    transformOrigin: placeAbove ? "bottom left" : "top left",
  };
}
function availableButtons() {
  return Array.from(
    panel.value?.querySelectorAll<HTMLButtonElement>(
      '[role="menuitemradio"]:not(:disabled)',
    ) || [],
  );
}
async function show(edge?: "first" | "last") {
  if (props.disabled || !props.options.length) return;
  updatePosition();
  open.value = true;
  await nextTick();
  const buttons = availableButtons();
  const target =
    edge === "first"
      ? buttons[0]
      : edge === "last"
        ? buttons.at(-1)
        : buttons.find((button) => button.dataset.mode === props.modelValue) ||
          buttons[0];
  (
    target ||
    panel.value?.querySelector<HTMLButtonElement>(".permission-mode-help")
  )?.focus();
}
function close(restoreFocus = true) {
  open.value = false;
  helpOpen.value = false;
  if (restoreFocus) trigger.value?.focus();
}
function select(option: PermissionModeOption) {
  if (props.disabled || !option.is_enabled) return;
  emit("update:modelValue", option.value);
  close();
}
function triggerKeydown(event: KeyboardEvent) {
  if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
  event.preventDefault();
  show(event.key === "ArrowUp" ? "last" : "first");
}
function panelKeydown(event: KeyboardEvent) {
  if (event.key === "Escape") {
    event.preventDefault();
    event.stopPropagation();
    if (helpOpen.value) {
      helpOpen.value = false;
      panel.value
        ?.querySelector<HTMLButtonElement>(".permission-mode-help")
        ?.focus();
    } else close();
    return;
  }
  if (event.key === "Tab") {
    const help = panel.value?.querySelector<HTMLButtonElement>(
      ".permission-mode-help",
    );
    if (
      event.shiftKey &&
      document.activeElement?.getAttribute("role") === "menuitemradio"
    ) {
      event.preventDefault();
      help?.focus();
      return;
    }
    if (!event.shiftKey && document.activeElement === help) {
      event.preventDefault();
      const buttons = availableButtons();
      (
        buttons.find((button) => button.dataset.mode === props.modelValue) ||
        buttons[0]
      )?.focus();
      return;
    }
    // Return to the trigger so native tab order continues from the composer.
    close();
    return;
  }
  if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
  event.preventDefault();
  const buttons = availableButtons();
  if (!buttons.length) return;
  const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
  const next =
    event.key === "Home"
      ? 0
      : event.key === "End"
        ? buttons.length - 1
        : (index + (event.key === "ArrowDown" ? 1 : -1) + buttons.length) %
          buttons.length;
  buttons[next]?.focus();
}
function outside(event: Event) {
  const target = event.target as Node | null;
  if (
    target &&
    !trigger.value?.contains(target) &&
    !panel.value?.contains(target)
  )
    close(false);
}
watch(open, (visible) => {
  if (visible) {
    document.addEventListener("pointerdown", outside, true);
    document.addEventListener("focusin", outside);
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
  } else removeListeners();
});
function removeListeners() {
  document.removeEventListener("pointerdown", outside, true);
  document.removeEventListener("focusin", outside);
  window.removeEventListener("resize", updatePosition);
  window.removeEventListener("scroll", updatePosition, true);
}
watch(
  () => props.disabled,
  (disabled) => {
    if (disabled && open.value) close(false);
  },
);
onBeforeUnmount(removeListeners);
</script>

<template>
  <div class="permission-mode-picker">
    <button
      ref="trigger"
      type="button"
      class="permission-mode-trigger"
      :class="{ 'is-open': open, 'is-full-access': modelValue === 'bypass' }"
      data-testid="permission-mode-trigger"
      :data-value="modelValue"
      aria-label="权限模式"
      :title="`权限模式：${selectedLabel}`"
      aria-haspopup="menu"
      :aria-expanded="open"
      :aria-controls="`${id}-menu`"
      :disabled="disabled || !options.length"
      @click="open ? close() : show()"
      @keydown="triggerKeydown"
    >
      <component
        :is="selectedIcon"
        :size="16"
        :stroke-width="1.65"
        aria-hidden="true"
      />
      <span>{{ selectedLabel }}</span>
      <ChevronDown
        class="permission-mode-chevron"
        :size="12"
        :stroke-width="1.65"
        aria-hidden="true"
      />
    </button>
    <Teleport to="body">
      <Transition name="permission-mode-popup">
        <div
          v-if="open"
          ref="panel"
          class="permission-mode-popover"
          :style="position"
          @keydown="panelKeydown"
        >
          <div class="permission-mode-heading">
            <span>应如何批准养老险GPT操作？</span>
            <button
              type="button"
              class="permission-mode-help"
              :aria-expanded="helpOpen"
              :aria-controls="`${id}-help`"
              @click="helpOpen = !helpOpen"
            >
              了解更多
            </button>
          </div>
          <div
            v-if="helpOpen"
            :id="`${id}-help`"
            class="permission-mode-explanation"
          >
            <p>
              权限模式只决定何时请求批准，仍受你已获授权的技能、连接器和资源范围限制。
            </p>
            <p>
              “不再询问”会拒绝需要确认的操作；“完全访问权限”仅在系统允许时可选。
            </p>
          </div>
          <div
            :id="`${id}-menu`"
            role="menu"
            aria-label="权限模式选项"
            class="permission-mode-options"
          >
            <button
              v-for="option in orderedOptions"
              :key="option.value"
              type="button"
              role="menuitemradio"
              class="permission-mode-option"
              :class="{ 'is-full-access': option.value === 'bypass' }"
              :data-mode="option.value"
              :aria-checked="modelValue === option.value"
              :disabled="!option.is_enabled"
              @click="select(option)"
            >
              <component
                :is="presentation(option).icon"
                class="permission-mode-icon"
                :size="21"
                :stroke-width="1.65"
                aria-hidden="true"
              />
              <span class="permission-mode-copy">
                <span class="permission-mode-label"
                  >{{ presentation(option).label
                  }}<small
                    v-if="!option.is_enabled"
                    class="permission-mode-unavailable"
                    >系统策略未开放</small
                  ></span
                >
                <span class="permission-mode-description">{{
                  presentation(option).description
                }}</span>
              </span>
              <Check
                v-if="modelValue === option.value"
                class="permission-mode-check"
                :size="20"
                :stroke-width="1.8"
                aria-hidden="true"
              />
            </button>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<style scoped src="../../styles/components/permission-mode-picker.css"></style>
