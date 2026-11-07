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
import AppIcon from "../common/AppIcon.vue";
import type { Project } from "../../types/api";

const props = defineProps<{
  projectId?: string;
  projects: Project[];
  disabled?: boolean;
  readonly?: boolean;
}>();
const emit = defineEmits<{ select: [projectId: string] }>();
const open = ref(false);
const root = ref<HTMLElement>();
const trigger = ref<HTMLButtonElement>();
const menu = ref<HTMLElement>();
const menuId = useId();
const offset = ref(0);
const options = computed(() =>
  props.projects.some((project) => project.is_default)
    ? props.projects
    : [{ id: "", project_name: "默认项目" }, ...props.projects],
);
const selected = computed(() =>
  options.value.find((project) => project.id === (props.projectId || "")),
);
watch(
  () => props.disabled,
  (disabled) => {
    if (disabled) open.value = false;
  },
);
function choose(projectId: string) {
  emit("select", projectId);
  open.value = false;
  trigger.value?.focus();
}
async function toggle() {
  if (props.disabled) return;
  open.value = !open.value;
  if (open.value) {
    offset.value = 0;
    await nextTick();
    const rect = menu.value?.getBoundingClientRect();
    if (rect)
      offset.value = Math.max(
        12 - rect.left,
        Math.min(0, window.innerWidth - rect.right - 12),
      );
    menu.value
      ?.querySelector<HTMLButtonElement>('[aria-selected="true"]')
      ?.focus();
  }
}
function keydown(event: KeyboardEvent) {
  if (event.key === "Escape") {
    open.value = false;
    trigger.value?.focus();
  } else if (["ArrowDown", "ArrowUp"].includes(event.key)) {
    event.preventDefault();
    if (!open.value) {
      void toggle();
      return;
    }
    const buttons = Array.from(
      menu.value?.querySelectorAll<HTMLButtonElement>('[role="option"]') || [],
    );
    const current = buttons.indexOf(
      document.activeElement as HTMLButtonElement,
    );
    buttons[
      (current + (event.key === "ArrowDown" ? 1 : -1) + buttons.length) %
        buttons.length
    ]?.focus();
  }
}
function outside(event: PointerEvent) {
  if (!root.value?.contains(event.target as Node)) open.value = false;
}
onMounted(() => document.addEventListener("pointerdown", outside));
onBeforeUnmount(() => document.removeEventListener("pointerdown", outside));
</script>

<template>
  <div class="composer-project-bar">
    <span
      v-if="readonly"
      class="project-current"
      aria-label="当前项目"
      title="当前会话所属项目"
    >
      <AppIcon name="folder" :size="14" />
      <span>{{ selected?.project_name || "当前项目" }}</span>
    </span>
    <div v-else ref="root" class="composer-project-selector" @keydown="keydown">
      <button
        ref="trigger"
        type="button"
        class="project-trigger"
        aria-label="选择项目"
        aria-haspopup="listbox"
        :aria-expanded="open"
        :aria-controls="menuId"
        :disabled="disabled"
        @click="toggle"
      >
        <AppIcon name="folder" :size="14" />
        <span>{{ selected?.project_name || "当前项目" }}</span>
        <AppIcon name="down" :size="12" />
      </button>
      <div
        v-if="open"
        :id="menuId"
        ref="menu"
        class="project-menu"
        :style="{ translate: `${offset}px 0` }"
        role="listbox"
        aria-label="项目列表"
      >
        <button
          v-for="project in options"
          :key="project.id"
          type="button"
          role="option"
          :aria-selected="project.id === (projectId || '')"
          @click="choose(project.id)"
        >
          <AppIcon name="folder" :size="15" />
          <span>{{ project.project_name }}</span>
          <AppIcon
            v-if="project.id === (projectId || '')"
            name="check"
            :size="14"
          />
        </button>
      </div>
    </div>
    <p class="project-composer-note">
      <slot>内容由 AI 生成，请核实重要信息</slot>
    </p>
  </div>
</template>

<style scoped src="../../styles/components/composer-project-bar.css"></style>
