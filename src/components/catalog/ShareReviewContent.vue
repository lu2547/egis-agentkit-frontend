<script setup lang="ts">
import { ref } from "vue";
import { requestRaw, errorText } from "../../api/http";
import type { ReviewContentSnapshot, ReviewContentNode } from "../../types/api";
import MarkdownContent from "../conversation/MarkdownContent.vue";
const props = defineProps<{
  content: ReviewContentSnapshot;
  reviewId: string;
}>();
const downloadError = ref(""),
  downloading = ref("");
async function download(node: ReviewContentNode) {
  downloading.value = node.resource_id;
  downloadError.value = "";
  try {
    const response = await requestRaw(
      `/manager/admin/share-reviews/${encodeURIComponent(props.reviewId)}/skills/${encodeURIComponent(node.resource_id)}/download`,
      {},
      { version: node.resource_version },
    );
    const url = URL.createObjectURL(await response.blob());
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${node.resource_id}-${node.resource_version}.zip`;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch (cause) {
    downloadError.value = errorText(cause);
  } finally {
    downloading.value = "";
  }
}
const kinds: Record<string, string> = {
  agent: "专家",
  team: "专家团",
  skill: "技能",
  mcp: "连接器",
  tool: "工具",
};
</script>
<template>
  <section class="submitted-content" aria-label="提交审核的资源内容">
    <p
      v-if="content.origin === 'reconstructed'"
      class="review-warning"
      role="status"
    >
      历史申请未保存提交快照。下列内容按记录版本重新读取；连接器展示当前配置，不能还原当时配置。
    </p>
    <p v-else class="muted">提交时保存的版本与依赖配置快照</p>
    <p v-if="downloadError" class="error" role="alert">{{ downloadError }}</p>
    <article
      v-for="(node, index) in [content.root, ...content.dependencies]"
      :key="`${node.resource_type}:${node.resource_id}:${node.resource_version}`"
      class="review-content-node"
    >
      <h3>
        {{ index ? "依赖" : "审核资源" }} · {{ kinds[node.resource_type] }} ·
        {{ node.display_name }}
      </h3>
      <p>
        {{ node.resource_id }} ·
        {{
          node.resource_type === "mcp"
            ? `配置修订 ${node.configuration_revision || "未知"}`
            : `版本 ${node.version_label}（${node.resource_version}）`
        }}
      </p>
      <p class="review-checksum">
        SHA-256 {{ node.checksum_sha256 || "未记录" }}
      </p>
      <p v-if="node.content_error" class="error" role="alert">
        {{ node.content_error }}
      </p>
      <template v-if="node.resource_type === 'skill'">
        <t-button
          variant="outline"
          size="small"
          :loading="downloading === node.resource_id"
          :disabled="!!downloading"
          @click="download(node)"
          >下载审核版本完整文件</t-button
        >
        <MarkdownContent
          v-if="node.payload.markdown"
          :text="String(node.payload.markdown)"
        />
        <details open>
          <summary>文件清单与校验值</summary>
          <pre>{{ JSON.stringify(node.payload.files || {}, null, 2) }}</pre>
        </details>
      </template>
      <template v-else>
        <p v-if="node.resource_type === 'mcp'" class="muted">
          连接器按 ID 使用；以下为{{
            node.origin === "submitted" ? "提交时" : "当前重建的"
          }}配置，后续配置可能更新。
        </p>
        <pre v-if="node.payload.system_prompt" class="review-prompt">{{
          node.payload.system_prompt
        }}</pre>
        <details open>
          <summary>
            {{
              node.resource_type === "mcp" ? "连接配置" : "完整配置与依赖引用"
            }}
          </summary>
          <pre>{{ JSON.stringify(node.payload, null, 2) }}</pre>
        </details>
      </template>
    </article>
  </section>
</template>
<style scoped>
.submitted-content {
  margin-block: 20px;
}
.review-content-node {
  border-block-start: 1px solid var(--border);
  padding-block: 14px;
}
.review-content-node h3 {
  margin-block: 0 8px;
  font-size: 14px;
}
.review-content-node p {
  overflow-wrap: anywhere;
}
.review-checksum {
  color: var(--muted);
  font-size: 11px;
}
pre {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  max-height: 360px;
  overflow: auto;
  background: var(--bg);
  padding: 12px;
  font-size: 12px;
}
.review-warning {
  color: var(--warning, #946200);
}
</style>
