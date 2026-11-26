<script setup lang="ts">
import { computed, ref, watch, watchEffect } from "vue";
import {
  MAX_SKILL_BATCH_SIZE,
  principalName,
  type BatchAccessResult,
  type Review,
  type ReviewDetail,
} from "../../types/api";
import { manager } from "../../api/manager";
import { errorText } from "../../api/http";
import ShareReviewContent from "./ShareReviewContent.vue";
import AsyncState from "../common/AsyncState.vue";
import AdminStatusBadge from "../admin/AdminStatusBadge.vue";
import AdminTable from "../admin/AdminTable.vue";
import BatchAccessNotice from "../common/BatchAccessNotice.vue";
const props = defineProps<{
  reviews: Review[];
  admin?: boolean;
  disabled?: boolean;
}>();
const emit = defineEmits<{ changed: []; busy: [value: boolean] }>();
const selected = ref<Review | null>(null),
  reason = ref(""),
  pending = ref(false),
  error = ref("");
const content = ref<ReviewDetail | null>(null);
const contentLoading = ref(false),
  contentError = ref("");
const batchContent = ref<ReviewDetail[]>([]);
const batchContentLoading = ref(false);
let batchGeneration = 0;
const contentReadable = (detail: ReviewDetail) =>
  [detail.content.root, ...detail.content.dependencies].every(
    (node) => !node.content_error,
  );
const canApprove = computed(
  () =>
    !!content.value &&
    !contentLoading.value &&
    !contentError.value &&
    contentReadable(content.value),
);
const canApproveBatch = computed(
  () =>
    !batchContentLoading.value &&
    !batchError.value &&
    batchContent.value.length === batchIds.value.length &&
    batchIds.value.every((id) =>
      batchContent.value.some((detail) => detail.review_id === id),
    ) &&
    batchContent.value.every(contentReadable),
);
const actions: Record<string, string> = {
  share: "新增共享",
  update: "共享新版本",
  revoke: "撤回共享",
};
const batchIds = ref<string[]>([]);
const batchOpen = ref(false);
watch(batchOpen, (open) => {
  if (!open) batchGeneration++;
});
const batchReason = ref("");
const batchPending = ref(false);
const batchError = ref("");
const batchResults = ref<BatchAccessResult[]>([]);
const batchLabels = ref<Record<string, string>>({});
const eligibleIds = computed(
  () =>
    new Set(
      props.reviews
        .filter(
          (review) =>
            props.admin &&
            review.resource_type === "skill" &&
            review.review_status_type === "pending",
        )
        .map((review) => review.review_id),
    ),
);
watch(eligibleIds, (ids) => {
  batchIds.value = batchIds.value.filter((id) => ids.has(id));
});
watchEffect(() =>
  emit(
    "busy",
    !!selected.value || batchOpen.value || pending.value || batchPending.value,
  ),
);
const names: Record<string, string> = {
  pending: "审核中",
  approved: "已通过",
  rejected: "已拒绝",
  cancelled: "已取消",
};
const tones: Partial<Record<string, "warning" | "success" | "danger">> = {
  pending: "warning",
  approved: "success",
  rejected: "danger",
};
const types: Record<string, string> = {
  agent: "专家",
  team: "专家团",
  skill: "技能",
  mcp: "连接器",
};

async function openReview(review: Review) {
  selected.value = review;
  reason.value = "";
  error.value = "";
  content.value = null;
  contentError.value = "";
  if (!props.admin) return;
  contentLoading.value = true;
  try {
    const detail = await manager.reviewDetail(review.review_id);
    if (selected.value?.review_id === review.review_id) content.value = detail;
  } catch (cause) {
    if (selected.value?.review_id === review.review_id)
      contentError.value = errorText(cause);
  } finally {
    if (selected.value?.review_id === review.review_id)
      contentLoading.value = false;
  }
}

async function decide(allowed: boolean) {
  if (!selected.value || (allowed && !canApprove.value)) return;
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

async function openBatch() {
  const generation = ++batchGeneration;
  const ids = [...batchIds.value];
  batchError.value = "";
  batchReason.value = "";
  batchOpen.value = true;
  batchContent.value = [];
  batchContentLoading.value = true;
  try {
    const details = await Promise.all(
      ids.map((id) => manager.reviewDetail(id)),
    );
    if (generation === batchGeneration && batchOpen.value)
      batchContent.value = details;
  } catch (cause) {
    if (generation === batchGeneration && batchOpen.value)
      batchError.value = errorText(cause);
  } finally {
    if (generation === batchGeneration && batchOpen.value)
      batchContentLoading.value = false;
  }
}

async function decideBatch(allowed: boolean) {
  if (
    batchPending.value ||
    !batchIds.value.length ||
    (allowed && !canApproveBatch.value)
  )
    return;
  batchPending.value = true;
  batchError.value = "";
  batchLabels.value = Object.fromEntries(
    props.reviews.map((review) => [
      review.review_id,
      `${review.resource_id} · ${review.version_label || review.resource_version}`,
    ]),
  );
  try {
    const response = await manager.decideShares(
      batchIds.value,
      allowed,
      batchReason.value,
    );
    batchResults.value = response.items;
    batchIds.value = response.items
      .filter((item) => !item.success)
      .map((item) => item.id);
    batchOpen.value = false;
    emit("changed");
  } catch (err) {
    batchError.value = errorText(err);
  } finally {
    batchPending.value = false;
  }
}
</script>
<template>
  <div class="reviews">
    <div v-if="eligibleIds.size" class="toolbar">
      <t-button
        variant="outline"
        :disabled="disabled || !batchIds.length"
        @click="openBatch"
      >
        批量审核
      </t-button>
      <span v-if="batchIds.length" class="muted"
        >已选择 {{ batchIds.length }} 项</span
      >
    </div>
    <BatchAccessNotice
      v-if="batchResults.length"
      :results="batchResults"
      :labels="batchLabels"
    />
    <AdminTable v-if="admin" label="共享审核表格">
      <table>
        <thead>
          <tr>
            <th scope="col">资源与版本</th>
            <th scope="col">申请类型</th>
            <th scope="col">接收对象</th>
            <th scope="col">申请原因</th>
            <th scope="col">状态</th>
            <th scope="col">操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="review in reviews" :key="review.review_id">
            <td>
              <div class="review-resource">
                <input
                  v-if="eligibleIds.has(review.review_id)"
                  v-model="batchIds"
                  type="checkbox"
                  :value="review.review_id"
                  :aria-label="`选择 ${review.resource_id}`"
                  :disabled="
                    disabled ||
                    batchPending ||
                    (batchIds.length >= MAX_SKILL_BATCH_SIZE &&
                      !batchIds.includes(review.review_id))
                  "
                />
                <span>
                  <span class="badge">{{
                    types[review.resource_type] || review.resource_type
                  }}</span>
                  <strong
                    >{{ review.resource_id }} ·
                    {{
                      review.version_label || review.resource_version
                    }}</strong
                  >
                </span>
              </div>
            </td>
            <td>{{ actions[review.review_type || "share"] }}</td>
            <td>
              {{
                review.share_scope_type && review.principal_id
                  ? principalName(review.share_scope_type, review.principal_id)
                  : "现有共享受众"
              }}
            </td>
            <td>{{ review.review_reason || "—" }}</td>
            <td>
              <AdminStatusBadge :tone="tones[review.review_status_type]">
                {{
                  names[review.review_status_type] || review.review_status_type
                }}
              </AdminStatusBadge>
            </td>
            <td>
              <t-button
                size="small"
                variant="outline"
                theme="default"
                :disabled="disabled"
                @click="openReview(review)"
              >
                {{
                  review.review_status_type === "pending"
                    ? "审核版本"
                    : "查看申请"
                }}
              </t-button>
            </td>
          </tr>
        </tbody>
      </table>
    </AdminTable>
    <template v-else>
      <article
        v-for="review in reviews"
        :key="review.review_id"
        class="review-row"
      >
        <div>
          <span class="badge">{{
            types[review.resource_type] || review.resource_type
          }}</span
          ><strong
            >{{ review.resource_id }} ·
            {{ review.version_label || review.resource_version }}</strong
          >
          <p>
            {{
              review.share_scope_type && review.principal_id
                ? principalName(review.share_scope_type, review.principal_id)
                : "现有共享受众"
            }}
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
        ><t-button variant="text" size="small" @click="openReview(review)"
          >查看申请</t-button
        >
      </article>
    </template>
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
        ><p>
          {{ types[selected.resource_type] }} {{ selected.resource_id }} ·
          发布版本 {{ selected.version_label || selected.resource_version }}
        </p>
        <p>
          接收对象
          {{
            selected.share_scope_type && selected.principal_id
              ? principalName(selected.share_scope_type, selected.principal_id)
              : "现有共享受众"
          }}
        </p>
        <p>申请类型 {{ actions[selected.review_type || "share"] }}</p>
        <p v-if="selected.review_type === 'revoke'">
          原共享申请 {{ selected.original_review_id }}；审核通过前共享继续生效。
        </p>
        <p class="muted">申请编号 {{ selected.review_id }}</p>
        <AsyncState
          v-if="admin"
          :loading="contentLoading"
          :error="contentError"
          @retry="openReview(selected)"
        >
          <ShareReviewContent
            v-if="content"
            :content="content.content"
            :review-id="selected.review_id"
          />
        </AsyncState>
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
              >{{
                selected.review_type === "revoke" ? "拒绝撤回" : "拒绝共享"
              }}</t-button
            ><t-button
              theme="primary"
              :loading="pending"
              :disabled="!canApprove"
              @click="decide(true)"
              >{{
                selected.review_type === "revoke"
                  ? "批准撤回共享"
                  : "通过共享申请"
              }}</t-button
            >
          </div></template
        ></template
      ></t-dialog
    >
    <t-dialog
      role="dialog"
      aria-modal="true"
      aria-label="批量审核"
      :visible="batchOpen"
      header="批量审核"
      :footer="false"
      :close-on-overlay-click="!batchPending"
      :close-on-esc-keydown="!batchPending"
      @close="!batchPending && (batchOpen = false)"
    >
      <div class="form-stack">
        <p class="muted">批量处理已选的 {{ batchIds.length }} 项共享申请。</p>
        <p v-if="batchContentLoading" role="status">正在读取提交内容…</p>
        <ShareReviewContent
          v-for="detail in batchContent"
          :key="detail.review_id"
          :content="detail.content"
          :review-id="detail.review_id"
        />
        <div v-field-label class="field">
          <label>审核意见</label>
          <t-textarea
            v-model="batchReason"
            :maxlength="2000"
            :disabled="batchPending"
          />
        </div>
        <div v-if="batchError" class="error" role="alert">{{ batchError }}</div>
        <div class="form-actions">
          <t-button
            variant="outline"
            :disabled="batchPending"
            @click="batchOpen = false"
            >取消</t-button
          >
          <t-button
            variant="outline"
            :disabled="batchPending || !batchIds.length || !batchReason.trim()"
            @click="decideBatch(false)"
            >批量拒绝</t-button
          >
          <t-button
            theme="primary"
            :loading="batchPending"
            :disabled="!batchIds.length || !canApproveBatch"
            @click="decideBatch(true)"
            >批量通过</t-button
          >
        </div>
      </div>
    </t-dialog>
  </div>
</template>
<style scoped src="../../styles/components/ShareReviewList.css"></style>
