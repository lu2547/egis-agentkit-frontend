<script setup lang="ts" generic="T extends string | number">
import { computed, nextTick, ref, useId } from "vue";
import { Check, ChevronDown } from "lucide-vue-next";

type Option = { label: string; value: T; disabled?: boolean };

const props = defineProps<{
  label: string;
  options: readonly Option[];
  searchLabel?: string;
}>();
const value = defineModel<T>({ required: true });
const open = ref(false);
const query = ref("");
const active = ref(-1);
const trigger = ref<HTMLButtonElement>();
const search = ref<HTMLInputElement>();
const list = ref<HTMLElement>();
const listId = useId();
const selected = computed(() =>
  props.options.find((option) => option.value === value.value),
);
const options = computed(() => {
  const term = query.value.trim().toLocaleLowerCase();
  return props.options.filter((option) =>
    option.label.toLocaleLowerCase().includes(term),
  );
});
const activeId = computed(() =>
  open.value && active.value >= 0 ? `${listId}-${active.value}` : undefined,
);

function setOpen(visible: boolean) {
  open.value = visible;
  if (!visible) return;
  query.value = "";
  active.value = options.value.findIndex(
    (option) => option.value === value.value && !option.disabled,
  );
  if (active.value < 0)
    active.value = options.value.findIndex((option) => !option.disabled);
  if (props.searchLabel) void nextTick(() => search.value?.focus());
}

function searchOptions(event: Event) {
  query.value = (event.target as HTMLInputElement).value;
  active.value = options.value.findIndex((option) => !option.disabled);
}

function choose(option: Option | undefined) {
  if (!option || option.disabled) return;
  value.value = option.value;
  open.value = false;
  trigger.value?.focus();
}

function onKeys(event: KeyboardEvent) {
  if (event.isComposing) return;
  if (event.key === "Tab" && open.value) {
    open.value = false;
    trigger.value?.focus();
    return;
  }
  if (event.key === "Escape" && open.value) {
    event.preventDefault();
    event.stopPropagation();
    open.value = false;
    trigger.value?.focus();
    return;
  }
  if (event.key === "ArrowDown" || event.key === "ArrowUp") {
    event.preventDefault();
    if (!open.value) {
      setOpen(true);
      return;
    }
    const indices = options.value.flatMap((option, index) =>
      option.disabled ? [] : [index],
    );
    if (!indices.length) return;
    const step = event.key === "ArrowDown" ? 1 : -1;
    const position = indices.indexOf(active.value);
    active.value =
      indices[(position + step + indices.length) % indices.length]!;
    void nextTick(() =>
      list.value?.children[active.value]?.scrollIntoView({ block: "nearest" }),
    );
    return;
  }
  if (
    open.value &&
    (event.key === "Enter" ||
      (event.key === " " && event.target === trigger.value))
  ) {
    event.preventDefault();
    choose(options.value[active.value]);
  }
}

function panelWidth(anchor: HTMLElement) {
  const minimum = props.searchLabel ? 216 : 132;
  return {
    minWidth: `${Math.max(minimum, anchor.getBoundingClientRect().width)}px`,
  };
}
</script>

<template>
  <t-popup
    :visible="open"
    trigger="click"
    placement="bottom-left"
    overlay-class-name="schedule-select-popup"
    :overlay-inner-style="panelWidth"
    :z-index="220"
    destroy-on-close
    @visible-change="setOpen"
  >
    <button
      ref="trigger"
      type="button"
      class="schedule-select-trigger"
      role="combobox"
      :aria-label="label"
      :aria-expanded="open"
      :aria-controls="open ? listId : undefined"
      :aria-activedescendant="searchLabel ? undefined : activeId"
      @keydown="onKeys"
    >
      <span>{{ selected?.label ?? label }}</span>
      <ChevronDown :size="14" aria-hidden="true" />
    </button>
    <template #content>
      <div v-if="searchLabel" class="schedule-select-search">
        <input
          ref="search"
          type="search"
          :aria-label="searchLabel"
          :placeholder="searchLabel"
          :aria-controls="listId"
          :aria-activedescendant="activeId"
          :value="query"
          @input="searchOptions"
          @keydown="onKeys"
        />
      </div>
      <div
        :id="listId"
        ref="list"
        class="schedule-select-list"
        role="listbox"
        :aria-label="label"
      >
        <div
          v-for="(option, index) in options"
          :id="`${listId}-${index}`"
          :key="option.value"
          role="option"
          :aria-selected="option.value === value"
          :aria-disabled="option.disabled || undefined"
          class="schedule-select-option"
          :class="{ 'is-active': active === index }"
          @pointerenter="!option.disabled && (active = index)"
          @mousedown.prevent
          @click="choose(option)"
        >
          <span :title="option.label">{{ option.label }}</span>
          <Check v-if="option.value === value" :size="15" aria-hidden="true" />
        </div>
        <p v-if="!options.length" class="schedule-select-empty">暂无匹配项</p>
      </div>
    </template>
  </t-popup>
</template>

<style>
.schedule-select-trigger {
  display: inline-flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  min-width: 0;
  min-height: 36px;
  border: 1px solid var(--border);
  border-radius: 9px;
  background: var(--surface);
  color: var(--text);
  padding: 7px 11px;
  text-align: left;
}
.schedule-select-trigger:hover,
.schedule-select-trigger[aria-expanded="true"] {
  border-color: var(--border-hover);
}
.schedule-select-trigger:focus-visible,
.schedule-select-search input:focus-visible {
  outline: 1px solid var(--focus-ring);
  outline-offset: 2px;
}
.schedule-select-trigger span,
.schedule-select-option span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.schedule-select-trigger svg {
  flex: none;
  color: var(--muted);
}
.schedule-select-trigger[aria-expanded="true"] svg {
  transform: rotate(180deg);
}
.schedule-select-popup .t-popup__content {
  margin-top: 6px;
  padding: 0;
  min-width: 128px;
  max-width: min(288px, calc(100vw - 24px));
  border: 1px solid var(--border);
  border-radius: 11px;
  background: var(--surface);
  color: var(--text);
  box-shadow: var(--shadow);
}
.schedule-select-list {
  display: grid;
  gap: 2px;
  max-height: min(250px, 45vh);
  overflow: auto;
  overscroll-behavior: contain;
  padding: 7px;
}
.schedule-select-option {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-height: 36px;
  border-radius: 7px;
  padding: 7px 10px;
  cursor: pointer;
}
.schedule-select-option[aria-selected="true"] {
  font-weight: 650;
}
.schedule-select-option[aria-selected="true"],
.schedule-select-option.is-active {
  background: var(--hover);
}
.schedule-select-option svg {
  flex: none;
  color: var(--success);
}
.schedule-select-option[aria-disabled="true"] {
  color: var(--muted);
  cursor: default;
}
.schedule-select-search {
  padding: 8px 8px 0;
}
.schedule-select-search input {
  width: 100%;
  min-height: 34px;
  padding: 6px 10px;
  border: 1px solid var(--border);
  border-radius: 7px;
  color: var(--text);
  background: var(--bg);
}
.schedule-select-empty {
  padding: 7px 10px;
  color: var(--muted);
}
</style>
