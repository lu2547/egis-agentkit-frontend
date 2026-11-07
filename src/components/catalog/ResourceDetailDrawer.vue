<script setup lang="ts">
import { computed, watch, reactive, onUnmounted, ref } from "vue";
import type { Resource } from "../../types/api";
import { manager } from "../../api/manager";
import { requestRaw, errorText } from "../../api/http";
import { ResourceDetailState } from "../../domain/resourceState";
import CatalogAvatar from "../common/CatalogAvatar.vue";
import AsyncState from "../common/AsyncState.vue";
import MarkdownContent from "../conversation/MarkdownContent.vue";
import ConnectorConnectionTest from "../connectors/ConnectorConnectionTest.vue";
const props = defineProps<{
  resource: Resource | null;
  resources: Resource[];
  kind: "skills" | "connectors";
}>();
defineEmits<{ close: []; edit: [r: Resource] }>();
const detail = reactive(new ResourceDetailState<Resource>()),
  notice = ref("");
watch(
  () => props.resource,
  (r) => {
    notice.value = "";
    if (r) void select(r.resource_version);
    else detail.dispose();
  },
);
onUnmounted(() => detail.dispose());
async function select(version: string) {
  const r = props.resource;
  if (r)
    await detail.select(version, () =>
      manager.resource(props.kind, r.resource_id, version),
    );
}
const connectorConfig = computed(
  () => (detail.value?.payload.config || {}) as Record<string, string>,
);
async function download() {
  if (!props.resource) return;
  try {
    const response = await requestRaw(
      `/manager/skills/${encodeURIComponent(props.resource.resource_id)}/download`,
      {},
      { version: detail.selectedVersion },
    );
    const url = URL.createObjectURL(await response.blob());
    const a = document.createElement("a");
    a.href = url;
    a.download = `${props.resource.resource_id}-${detail.selectedVersion}.zip`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch (e) {
    notice.value = errorText(e);
  }
}
async function share() {
  if (!detail.value) return;
  try {
    await manager.share(
      props.kind === "skills" ? "skill" : "mcp",
      detail.value.resource_id,
      detail.value.resource_version,
    );
    notice.value = "共享申请已提交。";
  } catch (e) {
    notice.value = errorText(e);
  }
}
</script>
<template>
  <t-drawer
    :visible="!!resource"
    :header="resource?.display_name"
    :footer="false"
    :size="'min(620px, 100vw)'"
    @close="$emit('close')"
    ><div v-if="resource" class="resource-detail">
      <div class="detail-identity"><CatalogAvatar :avatar="resource.payload.avatar" :name="resource.display_name" /><strong>{{ resource.display_name }}</strong></div>
      <div class="version-row">
        <span class="muted">发布版本</span
        ><t-select
          :value="detail.selectedVersion"
          :options="
            [
              ...new Set(
                resources
                  .filter((r) => r.resource_id === resource?.resource_id)
                  .map((r) => r.resource_version),
              ),
            ].map((v) => ({ label: v, value: v }))
          "
          style="width: 140px"
          @change="(v: unknown) => select(String(v))"
        />
      </div>
      <AsyncState
        :loading="detail.loading"
        :error="detail.error"
        @retry="select(detail.selectedVersion)"
        ><template v-if="detail.value"
          ><p class="resource-description">{{ detail.value.description }}</p>
          <template v-if="kind === 'skills'"
            ><MarkdownContent
              :text="
                String(
                  detail.value.payload.markdown ||
                    detail.value.payload.content ||
                    '暂无技能文档',
                )
              "
            />
            <div class="detail-actions">
              <t-button variant="outline" @click="download">下载版本</t-button
              ><t-button
                v-if="detail.value.is_editable"
                variant="outline"
                @click="$emit('edit', detail.value)"
                >发布新版本</t-button
              ><t-button
                v-if="detail.value.is_editable"
                variant="text"
                @click="share"
                >申请共享</t-button
              >
            </div></template
          ><template v-else
            ><div class="connector-summary">
              <span class="badge">{{
                connectorConfig.transport || "MCP"
              }}</span>
              <p>{{ connectorConfig.url || "" }}</p>
            </div>
            <ConnectorConnectionTest
              :key="`${resource.resource_id}-${detail.selectedVersion}`"
              :resource-id="resource.resource_id"
              :version="detail.selectedVersion"
            />
            <div class="detail-actions">
              <t-button
                v-if="detail.value.is_editable"
                variant="outline"
                @click="$emit('edit', detail.value)"
                >发布新版本</t-button
              ><t-button
                v-if="detail.value.is_editable"
                variant="text"
                @click="share"
                >申请共享</t-button
              >
            </div></template
          ></template
        ></AsyncState
      >
      <div v-if="notice" class="detail-notice" role="status">{{ notice }}</div>
    </div></t-drawer
  >
</template>
<style scoped src="../../styles/components/resource-detail.css"></style>
