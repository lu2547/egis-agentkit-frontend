<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { Plus, X } from "lucide-vue-next";
import { errorText } from "../../api/http";
import { manager } from "../../api/manager";
import {
  scheduleApi,
  type ScheduleForm,
  type ScheduleKind,
  type ScheduleRule,
} from "../../api/schedules";
import {
  dateTime,
  defaultRule,
  intervalParts,
  intervalUnits,
  ruleLabel,
  scheduleKinds,
  weekdays,
} from "../../domain/schedules";
import {
  workspaceDisplayPath,
  type WorkspaceArea,
} from "../../domain/workspaceView";
import { useIdentity } from "../../composables/useIdentity";
import { useRuntimeOptions } from "../../composables/useRuntimeOptions";
import DialogShell from "../common/DialogShell.vue";
import IconButton from "../common/IconButton.vue";
import ScheduleSelect from "./ScheduleSelect.vue";

const props = defineProps<{
  initial: ScheduleForm;
  editing: boolean;
  saving: boolean;
  error: string;
}>();
const emit = defineEmits<{ close: []; save: [form: ScheduleForm] }>();
const { projects, models, defaultModelKey } = useIdentity();
const runtime = useRuntimeOptions();
void runtime.load();
const form = ref<ScheduleForm>({
  ...props.initial,
  rule: {
    ...props.initial.rule,
    weekdays: [...(props.initial.rule.weekdays ?? [])],
  },
  files: [...(props.initial.files ?? [])],
});
const hasValidity = ref(Boolean(form.value.starts_on || form.value.ends_on));
const filesOpen = ref(false);
const fileArea = ref<WorkspaceArea>("uploads");
const availableFiles = ref<{ path: string; label: string }[]>([]);
const filesLoading = ref(false);
const filesError = ref("");
const validation = ref("");
const { amount, unit } = intervalParts(
  form.value.rule.interval_seconds ?? 3600,
);
const intervalAmount = ref(amount);
const intervalUnit = ref(unit.seconds);
const label = computed(() => (props.editing ? "编辑定时任务" : "新建定时任务"));
const defaultModel = computed(() =>
  models.value.find((item) => item.key === defaultModelKey.value),
);
const currentProjectMissing = computed(
  () =>
    form.value.project_id &&
    !projects.value.some((project) => project.id === form.value.project_id),
);
const canExplore = computed(() =>
  runtime.options.value.some((option) => option.value === "explore"),
);
const areaOptions: { value: WorkspaceArea; label: string }[] = [
  { value: "uploads", label: "项目文件" },
  { value: "artifacts", label: "项目产物" },
  { value: "work", label: "工作文件" },
];
const modelOptions = computed(() => [
  {
    value: "",
    label: defaultModel.value
      ? `默认模型（${defaultModel.value.display_name}）`
      : "默认模型",
  },
  ...models.value.map((item) => ({
    value: item.key,
    label: item.display_name,
  })),
  ...(form.value.model_key &&
  !models.value.some((item) => item.key === form.value.model_key)
    ? [{ value: form.value.model_key, label: form.value.model_key }]
    : []),
]);
const projectOptions = computed(() => [
  { value: "", label: "选择项目", disabled: true },
  ...(currentProjectMissing.value
    ? [{ value: form.value.project_id, label: "原项目不可用", disabled: true }]
    : []),
  ...projects.value.map((project) => ({
    value: project.id,
    label: project.project_name,
  })),
]);
const permissionOptions = computed(() => [
  { value: "dont_ask", label: "无人值守" } as const,
  ...(canExplore.value || form.value.permission_mode === "explore"
    ? [{ value: "explore", label: "只读探索" } as const]
    : []),
]);
const kindOptions = Object.entries(scheduleKinds).map(([value, label]) => ({
  value: value as ScheduleKind,
  label,
}));
const unitOptions = computed(() =>
  unit.seconds === 1
    ? [
        { value: 1, label: "秒" },
        ...intervalUnits.map((item) => ({
          value: item.seconds,
          label: item.label,
        })),
      ]
    : intervalUnits.map((item) => ({ value: item.seconds, label: item.label })),
);
const preview = ref<string | null>();
const previewSettled = ref(false);
const timezoneLabel = computed(() =>
  form.value.timezone === "Asia/Shanghai"
    ? "北京时间（UTC+8）"
    : form.value.timezone,
);
const timing = computed(() => {
  const { kind, time, date, weekdays: days, month, day } = form.value.rule;
  const rule: ScheduleRule = { kind, time };
  if (kind === "once" || kind === "biweekly" || kind === "interval")
    rule.date = date;
  if (kind === "weekly" || kind === "biweekly")
    rule.weekdays = [...(days ?? [])].sort((a, b) => a - b);
  if (kind === "monthly" || kind === "yearly") rule.day = day;
  if (kind === "yearly") rule.month = month;
  if (kind === "interval")
    rule.interval_seconds = intervalAmount.value * intervalUnit.value;
  return {
    timezone: form.value.timezone,
    enabled: form.value.enabled,
    starts_on: (hasValidity.value && form.value.starts_on) || null,
    ends_on: (hasValidity.value && form.value.ends_on) || null,
    rule,
  };
});

watch(
  timing,
  (input, _, onCleanup) => {
    previewSettled.value = false;
    if (!input.enabled || !input.rule.time) return;
    const controller = new AbortController();
    const timeout = setTimeout(async () => {
      try {
        const result = await scheduleApi.preview(input, controller.signal);
        if (!controller.signal.aborted) {
          preview.value = result.next_run_at;
          previewSettled.value = true;
        }
      } catch {
        // Saving still validates against the server if a preview is unavailable.
      }
    }, 300);
    onCleanup(() => {
      clearTimeout(timeout);
      controller.abort();
    });
  },
  { immediate: true },
);

watch(
  [filesOpen, () => form.value.project_id, fileArea],
  async ([open, projectId, area], _, onCleanup) => {
    availableFiles.value = [];
    filesError.value = "";
    filesLoading.value = false;
    if (!open || !projectId) return;
    const controller = new AbortController();
    onCleanup(() => controller.abort());
    filesLoading.value = true;
    try {
      const { items } = await manager.files(
        projectId,
        area,
        "",
        controller.signal,
        true,
      );
      if (!controller.signal.aborted) {
        availableFiles.value = items
          .filter((file) => !file.is_directory)
          .map((file) => ({
            path: `${area}/${file.path}`,
            label: workspaceDisplayPath(area, file.path),
          }));
      }
    } catch (e) {
      if (!controller.signal.aborted) filesError.value = errorText(e);
    } finally {
      if (!controller.signal.aborted) filesLoading.value = false;
    }
  },
);

function changeKind(kind: ScheduleKind) {
  form.value.rule = defaultRule(kind, form.value.rule.time);
  if (form.value.rule.kind === "interval") {
    intervalAmount.value = 1;
    intervalUnit.value = 3600;
  }
}

function changeProject(projectId: string) {
  form.value.project_id = projectId;
  form.value.files = [];
  fileArea.value = "uploads";
}

function toggleFile(path: string) {
  const files = form.value.files ?? [];
  form.value.files = files.includes(path)
    ? files.filter((file) => file !== path)
    : [...files, path];
}

function save() {
  validation.value = "";
  const { rule, starts_on, ends_on } = timing.value;
  if (
    (rule.kind === "weekly" || rule.kind === "biweekly") &&
    !rule.weekdays?.length
  ) {
    validation.value = "请至少选择一个执行星期。";
    return;
  }
  if (starts_on && ends_on && starts_on > ends_on) {
    validation.value = "有效期结束日期需在开始日期当天或之后。";
    return;
  }
  if (hasValidity.value && !starts_on && !ends_on) {
    validation.value = "请填写有效期开始日期或结束日期。";
    return;
  }
  if (
    !form.value.name.trim() ||
    !form.value.description.trim() ||
    !form.value.project_id ||
    currentProjectMissing.value
  ) {
    validation.value = "请填写任务名称、执行内容并选择可用项目。";
    return;
  }
  emit("save", {
    name: form.value.name.trim(),
    description: form.value.description,
    project_id: form.value.project_id,
    model_key: form.value.model_key || null,
    permission_mode: form.value.permission_mode,
    files: form.value.files,
    stateful: form.value.stateful,
    ...timing.value,
  });
}
</script>

<template>
  <DialogShell
    :open="true"
    :label="label"
    :width="680"
    @close="!saving && emit('close')"
  >
    <form class="schedule-editor" @submit.prevent="save">
      <header class="schedule-dialog-header">
        <h2>{{ label }}</h2>
        <IconButton label="关闭" :disabled="saving" @click="emit('close')"
          ><X :size="18"
        /></IconButton>
      </header>
      <div class="schedule-editor-body">
        <label class="schedule-field">
          <span>任务名称</span>
          <input
            v-model="form.name"
            maxlength="80"
            placeholder="例如：每周项目周报"
            required
            autofocus
          />
        </label>
        <label class="schedule-field">
          <span>执行内容</span>
          <textarea
            v-model="form.description"
            rows="4"
            maxlength="4000"
            placeholder="描述任务运行时要完成的工作"
            required
          />
        </label>
        <div class="schedule-attachments">
          <button
            type="button"
            class="schedule-button quiet"
            :disabled="!form.project_id || !!currentProjectMissing"
            :aria-expanded="filesOpen"
            @click="filesOpen = !filesOpen"
          >
            <Plus :size="15" aria-hidden="true" /> 添加上下文
          </button>
          <small v-if="!form.project_id" class="schedule-help"
            >选择项目后可引用项目文件</small
          >
          <button
            v-for="file in form.files"
            :key="file"
            type="button"
            class="schedule-file-tag"
            :aria-label="`移除 ${file}`"
            @click="toggleFile(file)"
          >
            {{ file }} <X :size="13" aria-hidden="true" />
          </button>
        </div>
        <div
          v-if="filesOpen && form.project_id && !currentProjectMissing"
          class="schedule-file-picker"
        >
          <ScheduleSelect
            v-model="fileArea"
            label="文件区域"
            :options="areaOptions"
          />
          <p v-if="filesError" class="error" role="alert">
            无法读取项目文件。{{ filesError }}
          </p>
          <p v-else-if="filesLoading" class="schedule-help">
            正在读取项目文件…
          </p>
          <p v-else-if="!availableFiles.length" class="schedule-help">
            该区域暂无文件
          </p>
          <div v-else class="schedule-file-options">
            <label
              v-for="file in availableFiles"
              :key="file.path"
              class="schedule-check"
            >
              <input
                type="checkbox"
                :checked="form.files?.includes(file.path)"
                :disabled="
                  (form.files?.length || 0) >= 50 &&
                  !form.files?.includes(file.path)
                "
                @change="toggleFile(file.path)"
              />
              {{ file.label }}
            </label>
          </div>
        </div>
        <div class="schedule-form-row schedule-form-three">
          <div class="schedule-field">
            <span>模型</span>
            <ScheduleSelect
              label="模型"
              :model-value="form.model_key || ''"
              :options="modelOptions"
              @update:model-value="form.model_key = $event || null"
            />
          </div>
          <div class="schedule-field">
            <span>项目</span>
            <ScheduleSelect
              label="项目"
              :model-value="form.project_id"
              :options="projectOptions"
              @update:model-value="changeProject"
            />
          </div>
          <div class="schedule-field">
            <span>权限</span>
            <ScheduleSelect
              v-model="form.permission_mode"
              label="权限"
              :options="permissionOptions"
            />
          </div>
        </div>
        <p class="schedule-help">
          后台执行时，需要人工确认的工具调用会被拒绝。
        </p>
        <div class="schedule-form-row schedule-editor-rule">
          <div class="schedule-field">
            <span>重复方式</span>
            <ScheduleSelect
              label="重复方式"
              :model-value="form.rule.kind"
              :options="kindOptions"
              @update:model-value="changeKind"
            />
          </div>
          <label class="schedule-field">
            <span>执行时间</span>
            <input v-model="form.rule.time" type="time" required />
          </label>
          <p class="schedule-help schedule-timezone">{{ timezoneLabel }}</p>
        </div>
        <div
          v-if="
            form.rule.kind === 'once' ||
            form.rule.kind === 'biweekly' ||
            form.rule.kind === 'interval'
          "
          class="schedule-form-row"
        >
          <label class="schedule-field">
            <span>{{
              form.rule.kind === "once" ? "执行日期" : "起始日期"
            }}</span>
            <input v-model="form.rule.date" type="date" required />
          </label>
          <label v-if="form.rule.kind === 'interval'" class="schedule-field">
            <span>间隔数量</span>
            <input
              v-model.number="intervalAmount"
              type="number"
              :min="Math.ceil(60 / intervalUnit)"
              :max="Math.floor(2678400 / intervalUnit)"
              step="1"
              required
            />
          </label>
          <div v-if="form.rule.kind === 'interval'" class="schedule-field">
            <span>间隔单位</span>
            <ScheduleSelect
              v-model="intervalUnit"
              label="间隔单位"
              :options="unitOptions"
            />
          </div>
        </div>
        <fieldset
          v-if="form.rule.kind === 'weekly' || form.rule.kind === 'biweekly'"
          class="schedule-weekdays"
        >
          <legend>执行星期</legend>
          <label
            v-for="(day, index) in weekdays"
            :key="day"
            class="schedule-check"
          >
            <input
              v-model="form.rule.weekdays"
              type="checkbox"
              :value="index"
            />周{{ day }}
          </label>
        </fieldset>
        <div
          v-if="form.rule.kind === 'monthly' || form.rule.kind === 'yearly'"
          class="schedule-form-row"
        >
          <label v-if="form.rule.kind === 'yearly'" class="schedule-field">
            <span>执行月份</span>
            <input
              v-model.number="form.rule.month"
              type="number"
              min="1"
              max="12"
              step="1"
              required
            />
          </label>
          <label class="schedule-field">
            <span>执行日</span>
            <input
              v-model.number="form.rule.day"
              type="number"
              min="1"
              max="31"
              step="1"
              required
            />
          </label>
          <p
            v-if="(form.rule.day ?? 0) > 28"
            class="schedule-help schedule-timezone"
          >
            当月没有所选日期时跳过。
          </p>
        </div>
        <div class="schedule-form-row">
          <label class="schedule-field">
            <span>有效期</span>
            <select v-model="hasValidity">
              <option :value="false">长期</option>
              <option :value="true">指定日期</option>
            </select>
          </label>
          <label v-if="hasValidity" class="schedule-field"
            ><span>有效期开始</span><input v-model="form.starts_on" type="date"
          /></label>
          <label v-if="hasValidity" class="schedule-field"
            ><span>有效期结束</span><input v-model="form.ends_on" type="date"
          /></label>
        </div>
        <label class="schedule-check schedule-help">
          <input v-model="form.stateful" type="checkbox" />
          复用上次运行的会话上下文
        </label>
        <label class="schedule-check schedule-help">
          <input type="checkbox" disabled /> 企业微信推送（待接入）
        </label>
        <p class="schedule-help schedule-editor-preview" aria-live="polite">
          {{ ruleLabel(timing.rule) }}
          <span v-if="previewSettled">
            ·
            {{
              preview
                ? `下次运行 ${dateTime(preview, form.timezone)}`
                : "无后续运行"
            }}</span
          >
        </p>
        <p v-if="validation || error" class="error" role="alert">
          {{ validation || error }}
        </p>
      </div>
      <footer class="schedule-dialog-footer">
        <button
          type="button"
          class="schedule-button quiet"
          :disabled="saving"
          @click="emit('close')"
        >
          取消
        </button>
        <button
          type="submit"
          class="schedule-button primary"
          :disabled="saving"
        >
          {{ saving ? "正在保存…" : "确定" }}
        </button>
      </footer>
    </form>
  </DialogShell>
</template>
