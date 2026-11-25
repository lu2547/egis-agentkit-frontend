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
import { useRouter } from "vue-router";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Feather,
  FileUp,
  GraduationCap,
  Link,
  Paperclip,
  Plus,
  Search,
  WandSparkles,
  X,
} from "lucide-vue-next";
import { useSkillChoices } from "../../composables/useSkillChoices";
import { manager } from "../../api/manager";
import { errorText } from "../../api/http";
import { definitionName } from "../../types/api";
import { isInvitableExpert } from "../../domain/expertInvitations";
import type {
  Definition,
  PermissionModeOption,
  Resource,
} from "../../types/api";

const props = defineProps<{
  definitions?: Definition[];
  canInviteExperts?: boolean;
  canManageResources: boolean;
  permissionMode?: string;
  permissionOptions?: PermissionModeOption[];
  settingsDisabled?: boolean;
  disabled?: boolean;
}>();
const emit = defineEmits<{
  "add-files": [];
  select: [definition: Definition];
  "update:permissionMode": [value: string];
}>();
type Category = "files" | "mode" | "experts" | "skills" | "connectors";
const entries = [
  { id: "files" as const, label: "添加文件", icon: Paperclip },
  { id: "mode" as const, label: "模式", icon: Feather },
  { id: "experts" as const, label: "专家", icon: GraduationCap },
  { id: "skills" as const, label: "技能", icon: WandSparkles },
  { id: "connectors" as const, label: "连接器", icon: Link },
];
const router = useRouter();
const menuId = useId();
const trigger = ref<HTMLButtonElement>();
const menu = ref<HTMLElement>();
const panel = ref<HTMLElement>();
const open = ref(false);
const category = ref<Category | null>(null);
const search = ref("");
const resources = ref<Resource[]>([]);
const skills = useSkillChoices(ref([]), "usable", "version");
const loadingResources = ref(false);
const resourceError = ref("");
const changingResource = ref("");
const menuStyle = ref({ left: "0px", top: "0px" });
const panelStyle = ref<Record<string, string>>({});
const stacked = ref(false);
let resourceRequest = 0;
let hoverTimer: ReturnType<typeof setTimeout> | undefined;
const categoryLabel = computed(
  () => entries.find((entry) => entry.id === category.value)?.label || "",
);
const filteredDefinitions = computed(() =>
  (props.definitions || []).filter(
    (definition) =>
      isInvitableExpert(definition) &&
      `${definitionName(definition)} ${definition.payload.description}`
        .toLocaleLowerCase()
        .includes(search.value.toLocaleLowerCase()),
  ),
);
const filteredResources = computed(() =>
  category.value === "skills"
    ? skills.items.value
    : resources.value.filter((resource) =>
        `${resource.display_name} ${resource.description}`
          .toLocaleLowerCase()
          .includes(search.value.toLocaleLowerCase()),
      ),
);
const isLoadingResources = computed(() =>
  category.value === "skills" ? skills.loading.value : loadingResources.value,
);
const displayedResourceError = computed(() =>
  resourceError.value || (category.value === "skills" ? skills.error.value : ""),
);

function cancelHover() {
  clearTimeout(hoverTimer);
  hoverTimer = undefined;
}
function close() {
  cancelHover();
  open.value = false;
  category.value = null;
  search.value = "";
  resourceRequest++;
}
function closeAndFocus() {
  close();
  trigger.value?.focus();
}
async function positionPanel() {
  await nextTick();
  if (!open.value || !menu.value || !panel.value) return;
  const anchor = menu.value.getBoundingClientRect();
  const width = Math.min(240, window.innerWidth - 16);
  const gap = 5;
  const right = anchor.right + width + gap <= window.innerWidth - 8;
  const left = anchor.left - width - gap >= 8;
  stacked.value = !right && !left;
  await nextTick();
  if (!panel.value || !open.value) return;
  const activeRow = menu.value?.querySelector<HTMLElement>(
    `[data-menu="${category.value}"]`,
  );
  const height = Math.min(panel.value.offsetHeight, window.innerHeight - 16);
  const desiredTop = stacked.value
    ? anchor.top
    : (activeRow?.getBoundingClientRect().top ?? anchor.top) - 8;
  const top = Math.max(
    8,
    Math.min(desiredTop, window.innerHeight - height - 8),
  );
  panelStyle.value = {
    left: stacked.value
      ? `${Math.max(8, Math.min(anchor.left, window.innerWidth - width - 8)) - anchor.left}px`
      : right
        ? `${anchor.width + gap}px`
        : `${-width - gap}px`,
    top: `${top - anchor.top}px`,
    bottom: "auto",
    maxHeight: `${window.innerHeight - top - 8}px`,
  };
}
function back() {
  const previous = category.value;
  resourceRequest++;
  category.value = null;
  stacked.value = false;
  nextTick(() =>
    menu.value
      ?.querySelector<HTMLElement>(`[data-menu="${previous}"]`)
      ?.focus(),
  );
}
async function positionMenu() {
  await nextTick();
  if (!open.value || !menu.value || !trigger.value) return;
  const anchor = trigger.value.getBoundingClientRect();
  const height = menu.value.offsetHeight;
  menuStyle.value = {
    left: `${Math.max(8, Math.min(anchor.left, window.innerWidth - menu.value.offsetWidth - 8))}px`,
    top: `${Math.max(8, Math.min(anchor.top - height - 8, window.innerHeight - height - 8))}px`,
  };
  await positionPanel();
}
async function show() {
  if (props.disabled) return;
  open.value = true;
  await positionMenu();
}
async function openCategory(value: Category) {
  cancelHover();
  if (category.value === value) return;
  resourceRequest++;
  category.value = value;
  search.value = "";
  resourceError.value = "";
  resources.value = [];
  loadingResources.value = false;
  await positionPanel();
  if (value === "connectors" && props.canManageResources)
    await loadResources(value);
}
function hoverCategory(value: Category) {
  // A stacked submenu covers its parent row: open it on click, not hover.
  const bounds = menu.value?.getBoundingClientRect();
  if (bounds && bounds.right + 245 > window.innerWidth - 8 && bounds.left < 253)
    return;
  cancelHover();
  if (!category.value || category.value === value) void openCategory(value);
  else hoverTimer = setTimeout(() => void openCategory(value), 100);
}
async function enterCategory(value: Category) {
  await openCategory(value);
  panel.value
    ?.querySelector<HTMLElement>("input, button:not(:disabled)")
    ?.focus();
}
function leaveCategory() {
  const previous = category.value;
  menu.value?.querySelector<HTMLElement>(`[data-menu="${previous}"]`)?.focus();
}
async function loadResources(
  kind: "skills" | "connectors",
  preservePage = false,
) {
  const request = ++resourceRequest;
  resourceError.value = "";
  if (kind === "skills") {
    const previousCount = preservePage ? skills.items.value.length : 0;
    await skills.search(search.value);
    while (
      request === resourceRequest && category.value === kind &&
      skills.items.value.length < previousCount &&
      skills.hasMore.value && !skills.error.value
    ) {
      await skills.loadMore();
    }
    return;
  }
  loadingResources.value = true;
  resources.value = [];
  try {
    const result = await manager.resources("connectors");
    if (request === resourceRequest && category.value === kind)
      resources.value = result.items;
  } catch (error) {
    if (request === resourceRequest && category.value === kind)
      resourceError.value = errorText(error);
  } finally {
    if (request === resourceRequest && category.value === kind)
      loadingResources.value = false;
  }
}
async function changeResource(resource: Resource) {
  if (
    !props.canManageResources ||
    (category.value !== "skills" && category.value !== "connectors") ||
    changingResource.value
  )
    return;
  const kind = category.value;
  if (kind === "connectors" && !resource.is_installed && !resource.is_authorized) {
    close();
    await router.push("/connectors");
    return;
  }
  const request = resourceRequest;
  changingResource.value = resource.resource_id;
  resourceError.value = "";
  try {
    if (kind === "connectors" && resource.is_installed)
      await manager.removeInstallation(kind, resource.resource_id);
    else if (resource.is_installed)
      await manager.toggle(
        kind,
        resource.resource_id,
        !resource.is_enabled,
      );
    else
      await manager.install(
        kind,
        resource.resource_id,
      );
    if (request === resourceRequest && category.value === kind)
      await loadResources(kind, true);
  } catch (error) {
    if (request === resourceRequest && category.value === kind)
      resourceError.value = errorText(error);
  } finally {
    changingResource.value = "";
  }
}
function resourceActionLabel(resource: Resource) {
  if (!resource.is_usable) return "未获授权";
  if (changingResource.value === resource.resource_id) return "处理中…";
  if (category.value === "connectors") {
    if (resource.is_installed) return "取消添加";
    return resource.is_authorized ? "添加" : "去广场授权";
  }
  if (!resource.is_installed) return "安装";
  return resource.is_enabled ? "已启用 · 停用" : "启用";
}
function selectExpert(definition: Definition) {
  emit("select", definition);
  closeAndFocus();
}
function selectMode(option: PermissionModeOption) {
  if (props.settingsDisabled || !option.is_enabled) return;
  emit("update:permissionMode", option.value);
  closeAndFocus();
}
function addFiles() {
  emit("add-files");
  close();
}
function clickOutside(event: PointerEvent) {
  const target = event.target as Node;
  if (!trigger.value?.contains(target) && !menu.value?.contains(target))
    close();
}
function scrollOutside(event: Event) {
  if (menu.value?.contains(event.target as Node) || !open.value) return;
  const anchor = trigger.value?.getBoundingClientRect();
  if (anchor && (anchor.bottom < 0 || anchor.top > window.innerHeight)) close();
  else void positionMenu();
}
watch(
  [open, category, search, () => props.canManageResources],
  ([visible, kind, , allowed], _, onCleanup) => {
    if (!visible || kind !== "skills" || !allowed) {
      skills.dispose();
      return;
    }
    const timer = setTimeout(
      () => void loadResources("skills"), search.value ? 180 : 0,
    );
    onCleanup(() => clearTimeout(timer));
  },
);
watch([isLoadingResources, () => filteredResources.value.length, search], () => {
  void positionPanel();
});
watch(
  () => props.disabled,
  (disabled) => {
    if (disabled) close();
  },
);
onMounted(() => {
  document.addEventListener("pointerdown", clickOutside);
  window.addEventListener("resize", positionMenu);
  document.addEventListener("scroll", scrollOutside, true);
});
onBeforeUnmount(() => {
  skills.dispose();
  cancelHover();
  resourceRequest++;
  document.removeEventListener("pointerdown", clickOutside);
  window.removeEventListener("resize", positionMenu);
  document.removeEventListener("scroll", scrollOutside, true);
});
</script>

<template>
  <div class="composer-menu">
    <button
      ref="trigger"
      type="button"
      class="plain add-button"
      :class="{ active: open }"
      aria-label="添加资源"
      :aria-expanded="open"
      aria-haspopup="menu"
      :aria-controls="menuId"
      title="添加文件或能力"
      :disabled="disabled"
      @click="open ? close() : show()"
      @keydown.esc.stop.prevent="closeAndFocus"
      @keydown.down.prevent="
        show().then(() => menu?.querySelector<HTMLElement>('button')?.focus())
      "
    >
      <X v-if="open" :size="20" :stroke-width="1.7" /><Plus
        v-else
        :size="20"
        :stroke-width="1.7"
      />
    </button>
    <Teleport to="body">
      <div
        v-if="open"
        :id="menuId"
        ref="menu"
        class="resource-picker add-menu"
        :style="menuStyle"
        role="menu"
        aria-label="添加上下文菜单"
        @keydown.esc.stop.prevent="closeAndFocus"
      >
        <template v-for="entry in entries" :key="entry.id">
          <button
            type="button"
            class="menu-row"
            :class="{ active: category === entry.id }"
            role="menuitem"
            :data-menu="entry.id"
            aria-haspopup="menu"
            :aria-expanded="category === entry.id"
            :disabled="
              entry.id === 'mode' &&
              (settingsDisabled || !permissionOptions?.length)
            "
            @mouseenter="hoverCategory(entry.id)"
            @click="openCategory(entry.id)"
            @keydown.right.prevent="enterCategory(entry.id)"
          >
            <component
              :is="entry.icon"
              :size="17"
              :stroke-width="1.7"
            /><span>{{ entry.label }}</span
            ><ChevronRight :size="14" class="next" />
          </button>
          <div
            v-if="entry.id === 'files'"
            class="menu-divider"
            role="separator"
          />
        </template>
        <div
          v-if="category"
          ref="panel"
          class="picker-panel submenu"
          :class="{ 'is-stacked': stacked }"
          :style="panelStyle"
          role="menu"
          :aria-label="categoryLabel"
          @mouseenter="cancelHover"
          @keydown.left.stop.prevent="leaveCategory"
        >
          <button
            v-if="stacked"
            type="button"
            class="menu-row submenu-back"
            @click="back"
          >
            <ChevronLeft :size="16" /><span>返回</span>
          </button>
          <template v-if="category === 'files'">
            <button
              type="button"
              class="menu-row"
              role="menuitem"
              @click="addFiles"
            >
              <FileUp :size="17" :stroke-width="1.7" /><span>从本地上传</span>
            </button>
          </template>
          <div v-else-if="category === 'mode'" class="picker-list mode-list">
            <button
              v-for="option in permissionOptions"
              :key="option.value"
              type="button"
              class="catalog-item mode-row"
              role="menuitemradio"
              :aria-checked="permissionMode === option.value"
              :data-mode="option.value"
              :disabled="settingsDisabled || !option.is_enabled"
              @click="selectMode(option)"
            >
              <span
                >{{ option.label }}{{ option.is_enabled ? "" : "（不可用）"
                }}<small>{{ option.description }}</small></span
              ><Check
                v-if="permissionMode === option.value"
                :size="15"
                class="check"
              />
            </button>
          </div>
          <template v-else>
            <label
              v-if="category === 'experts' || canManageResources"
              class="catalog-search"
              ><Search :size="14" /><input
                v-model="search"
                :placeholder="`搜索${categoryLabel}`"
                :aria-label="`搜索${categoryLabel}`"
            /></label>
            <div v-if="category === 'experts'" class="picker-list">
              <p v-if="!canInviteExperts" class="menu-hint">
                仅个人助理对话可以邀请专家
              </p>
              <template v-else>
                <button
                  v-for="definition in filteredDefinitions"
                  :key="`${definition.id}-${definition.resource_view_type}-${definition.resource_version}`"
                  type="button"
                  class="catalog-item"
                  role="menuitem"
                  @click="selectExpert(definition)"
                >
                  <span class="catalog-name"
                    >{{ definitionName(definition)
                    }}<small>{{ definition.payload.description }}</small></span
                  >
                </button>
                <p v-if="!filteredDefinitions.length" class="menu-hint">
                  没有匹配的专家
                </p>
              </template>
            </div>
            <div v-else-if="!canManageResources" class="picker-list">
              <p class="menu-hint">当前对话使用其预设的技能和连接器</p>
            </div>
            <div v-else class="picker-list">
              <p v-if="isLoadingResources" class="menu-hint">加载中…</p>
              <p
                v-else-if="!filteredResources.length && !displayedResourceError"
                class="menu-hint"
              >
                没有匹配的{{ categoryLabel }}
              </p>
              <button
                v-for="resource in filteredResources"
                :key="`${resource.resource_id}-${resource.resource_version}`"
                type="button"
                class="catalog-item"
                role="menuitemcheckbox"
                :aria-checked="resource.is_installed && resource.is_enabled"
                :disabled="!resource.is_usable || !!changingResource"
                @click="changeResource(resource)"
              >
                <span class="catalog-name"
                  >{{ resource.display_name
                  }}<small>{{ resource.description }}</small></span
                ><small class="resource-state">{{ resourceActionLabel(resource) }}</small>
              </button>
              <button
                v-if="category === 'skills' && skills.hasMore.value"
                type="button" class="catalog-item"
                :disabled="isLoadingResources || !!changingResource"
                @click="skills.loadMore"
              >加载更多技能</button>
              <p v-if="displayedResourceError" class="menu-hint" role="alert">
                {{ displayedResourceError }}
                <button
                  v-if="category === 'skills'" type="button" class="plain"
                  :disabled="isLoadingResources" @click="loadResources('skills')"
                >重新加载技能</button>
              </p>
            </div>
          </template>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped src="../../styles/components/composer-menu.css"></style>
