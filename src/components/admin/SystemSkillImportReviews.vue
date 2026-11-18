<script setup lang="ts">
import { onMounted, ref } from "vue";
import { manager } from "../../api/manager";
import { errorText } from "../../api/http";
import { useAsyncData } from "../../composables/useAsyncData";
import type { SkillImportJob } from "../../types/api";

const emit = defineEmits<{ changed: [] }>();
const { data, loading, error, load } = useAsyncData(manager.skillImportReviews);
const selected = ref<string[]>([]);
const reason = ref("");
const reviewing = ref(false);
const notice = ref("");
const outcome = ref("");
onMounted(load);

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
    selected.value = selected.value.filter((id) =>
      data.value?.items.some((job) => job.job_id === id),
    );
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
      <t-button size="small" variant="text" :loading="loading" @click="load"
        >刷新</t-button
      >
    </div>
    <p v-if="error || notice" class="error review-notice" role="alert">
      {{ error || notice }}
    </p>
    <p v-if="outcome" class="muted" role="status">{{ outcome }}</p>
    <p v-if="!data?.items.length && !loading" class="muted">暂无待审核的导入</p>
    <ul v-if="data?.items.length" class="review-list">
      <li v-for="job in data.items" :key="job.job_id">
        <label class="review-job">
          <input
            type="checkbox"
            :checked="selected.includes(job.job_id)"
            :disabled="reviewing"
            @change="
              select(job.job_id, ($event.target as HTMLInputElement).checked)
            "
          />
          <span>
            <strong>{{ job.result?.display_name || job.filename }}</strong>
            <span class="muted"> · {{ job.resource_version }}</span
            ><br />
            <span class="muted">
              {{ job.uploader_type === "virtual" ? "虚拟用户" : "管理员" }} ·
              {{ job.uploaded_by }}
            </span>
          </span>
        </label>
        <t-button size="small" variant="text" @click="download(job)"
          >查看 ZIP</t-button
        >
      </li>
    </ul>
    <div v-if="selected.length" class="review-actions">
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
  </section>
</template>

<style scoped>
.skill-reviews {
  margin-block: 16px 24px;
}
.review-heading,
.review-actions,
.review-list li {
  display: flex;
  align-items: center;
  gap: 12px;
}
.review-heading,
.review-list li {
  justify-content: space-between;
}
.review-list {
  margin: 0 0 12px;
  padding: 0;
  list-style: none;
}
.review-list li {
  padding: 8px 0;
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
