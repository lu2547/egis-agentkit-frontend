<script setup lang="ts">
import { onMounted, ref, watch } from "vue";
import { manager } from "../../api/manager";
import { errorText } from "../../api/http";
import { useAdminPage } from "../../composables/useAdminPage";
import type { SkillImportJob } from "../../types/api";
import AsyncState from "../common/AsyncState.vue";
import AdminPagination from "./AdminPagination.vue";
import AdminTable from "./AdminTable.vue";

const emit = defineEmits<{ changed: [] }>();
const { data, loading, error, load, changePage } = useAdminPage((page) =>
  manager.adminPage<SkillImportJob>("skill-imports", page),
);
const selected = ref<string[]>([]);
const reason = ref("");
const reviewing = ref(false);
const notice = ref("");
const outcome = ref("");
onMounted(load);
watch(data, (current, previous) => {
  selected.value =
    current?.page === previous?.page
      ? selected.value.filter((id) =>
          current?.items.some((job) => job.job_id === id),
        )
      : [];
  if (!selected.value.length) reason.value = "";
});

function select(id: string, checked: boolean) {
  selected.value = checked
    ? [...selected.value, id]
    : selected.value.filter((value) => value !== id);
}

async function decide(approved: boolean) {
  if (
    reviewing.value ||
    !selected.value.length ||
    (!approved && !reason.value.trim())
  )
    return;
  reviewing.value = true;
  notice.value = "";
  outcome.value = "";
  try {
    const { items } = await manager.decideSkillImports(
      selected.value,
      approved,
      reason.value.trim(),
    );
    selected.value = items.filter((item) => !item.ok).map((item) => item.id);
    notice.value = items
      .filter((item) => !item.ok)
      .map((item) => {
        const job = data.value?.items.find((entry) => entry.job_id === item.id);
        return `${job?.filename || item.id} · ${item.detail || "审核失败"}`;
      })
      .join("\n");
    if (!selected.value.length) reason.value = "";
    await load();
    const reviewed = items.filter((item) => item.ok).length;
    if (reviewed) {
      outcome.value = approved
        ? `已通过 ${reviewed} 项，等待后台发布。`
        : `已拒绝 ${reviewed} 项。`;
      emit("changed");
    }
  } catch (error) {
    notice.value = errorText(error);
  } finally {
    reviewing.value = false;
  }
}

async function download(job: SkillImportJob) {
  notice.value = "";
  try {
    const response = await manager.downloadSkillImport(job.job_id);
    const url = URL.createObjectURL(await response.blob());
    const link = document.createElement("a");
    link.href = url;
    link.download = job.filename;
    link.click();
    queueMicrotask(() => URL.revokeObjectURL(url));
  } catch (error) {
    notice.value = errorText(error);
  }
}
</script>

<template>
  <section class="skill-reviews" aria-label="系统技能导入审核">
    <div class="review-heading">
      <h3>系统技能导入审核</h3>
      <t-button
        size="small"
        variant="outline"
        theme="default"
        :loading="loading"
        :disabled="reviewing"
        @click="load"
        >刷新</t-button
      >
    </div>
    <p v-if="notice" class="error review-notice" role="alert">
      {{ notice }}
    </p>
    <p v-if="outcome" class="muted" role="status">{{ outcome }}</p>
    <AsyncState :loading="loading" :error="error" @retry="load">
      <p v-if="!data?.items.length" class="muted">暂无待审核的导入</p>
      <AdminTable v-else label="系统技能导入审核表格">
        <table>
          <thead>
            <tr>
              <th scope="col">导入技能</th>
              <th scope="col">版本</th>
              <th scope="col">上传者</th>
              <th scope="col">操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="job in data.items" :key="job.job_id">
              <td>
                <label class="review-job">
                  <input
                    type="checkbox"
                    :checked="selected.includes(job.job_id)"
                    :disabled="reviewing"
                    @change="
                      select(
                        job.job_id,
                        ($event.target as HTMLInputElement).checked,
                      )
                    "
                  />
                  <strong>{{
                    job.result?.display_name || job.filename
                  }}</strong>
                </label>
              </td>
              <td>{{ job.resource_version }}</td>
              <td>
                {{ job.uploader_type === "virtual" ? "虚拟用户" : "管理员" }} ·
                {{ job.uploaded_by }}
              </td>
              <td>
                <t-button
                  size="small"
                  variant="outline"
                  theme="default"
                  @click="download(job)"
                  >查看 ZIP</t-button
                >
              </td>
            </tr>
          </tbody>
        </table>
      </AdminTable>
    </AsyncState>
    <div v-if="selected.length && !loading && !error" class="review-actions">
      <input
        v-model="reason"
        aria-label="审核意见"
        maxlength="1000"
        placeholder="拒绝时填写原因"
      />
      <t-button
        size="small"
        variant="outline"
        :disabled="reviewing || !reason.trim()"
        @click="decide(false)"
      >
        拒绝所选
      </t-button>
      <t-button size="small" :disabled="reviewing" @click="decide(true)"
        >通过所选</t-button
      >
    </div>
    <AdminPagination
      v-if="data?.items.length"
      label="系统技能导入审核"
      :page="data.page"
      :has-next="data.has_next"
      :disabled="loading || reviewing"
      @change="changePage"
    />
  </section>
</template>

<style scoped>
.skill-reviews {
  margin-block: 16px 24px;
}
.review-heading,
.review-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}
.review-heading {
  justify-content: space-between;
  margin-bottom: 8px;
}
.review-actions {
  flex-wrap: wrap;
  margin-top: 12px;
}
.review-job {
  display: flex;
  align-items: center;
  gap: 8px;
}
.review-notice {
  white-space: pre-line;
}
.review-actions > input {
  min-width: 0;
  flex: 1;
}
</style>
