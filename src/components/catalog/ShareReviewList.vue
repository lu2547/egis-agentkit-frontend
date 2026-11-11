<script setup lang="ts">
import { ref } from "vue";
import { principalName, type Review } from "../../types/api";
import { manager } from "../../api/manager";
import { errorText } from "../../api/http";
const props = defineProps<{ reviews: Review[]; admin?: boolean }>();
const emit = defineEmits<{ changed: [] }>();
const selected = ref<Review | null>(null),
  reason = ref(""),
  pending = ref(false),
  error = ref("");
const names: Record<string, string> = {
  pending: "审核中",
  approved: "已通过",
  rejected: "已拒绝",
  cancelled: "已取消",
};
const types: Record<string, string> = {
  agent: "专家",
  team: "专家团",
  skill: "技能",
  mcp: "连接器",
};
async function decide(allowed: boolean) {
  if (!selected.value) return;
  pending.value = true;
  error.value = "";
  try {
    await manager.decide(selected.value.review_id, allowed, reason.value);
    selected.value = null;
    reason.value = "";
    emit("changed");
  } catch (e) {
    error.value = errorText(e);
  } finally {
    pending.value = false;
  }
}
</script>
<template>
  <div class="reviews">
    <article
      v-for="review in reviews"
      :key="review.review_id"
      class="review-row"
    >
      <div>
        <span class="badge">{{
          types[review.resource_type] || review.resource_type
        }}</span
        ><strong>{{ review.resource_id }} · {{ review.version_label || review.resource_version }}</strong>
        <p>
          {{ review.share_scope_type && review.principal_id ? principalName(review.share_scope_type, review.principal_id) : "现有共享受众" }}
          <template v-if="review.review_reason">
            · {{ review.review_reason }}</template
          >
        </p>
      </div>
      <span
        class="badge"
        :class="{ green: review.review_status_type === 'approved' }"
        >{{
          names[review.review_status_type] || review.review_status_type
        }}</span
      ><t-button
        variant="text"
        size="small"
        @click="
          selected = review;
          reason = '';
          error = '';
        "
        >{{
          admin && review.review_status_type === "pending"
            ? "审核版本"
            : "查看申请"
        }}</t-button
      >
    </article>
    <t-dialog
      role="dialog"
      aria-modal="true"
      aria-label="共享申请详情"
      :visible="!!selected"
      header="共享申请详情"
      :footer="false"
      width="760px"
      @close="selected = null"
      ><template v-if="selected"
        ><p>{{ types[selected.resource_type] }} {{ selected.resource_id }} · 发布版本 {{ selected.version_label || selected.resource_version }}</p>
        <p>
          接收对象
          {{ selected.share_scope_type && selected.principal_id ? principalName(selected.share_scope_type, selected.principal_id) : "现有共享受众" }}
        </p>
        <p class="muted">申请编号 {{ selected.review_id }}</p>
        <template v-if="admin && selected.review_status_type === 'pending'"
          ><div v-field-label class="field">
            <label>审核意见</label
            ><t-textarea v-model="reason" placeholder="说明通过或拒绝的原因" />
          </div>
          <div v-if="error" class="error">{{ error }}</div>
          <div class="form-actions">
            <t-button
              variant="outline"
              :disabled="pending || !reason.trim()"
              @click="decide(false)"
              >拒绝共享</t-button
            ><t-button theme="primary" :loading="pending" @click="decide(true)"
              >通过共享申请</t-button
            >
          </div></template
        ></template
      ></t-dialog
    >
  </div>
</template>
<style scoped src="../../styles/components/ShareReviewList.css"></style>
