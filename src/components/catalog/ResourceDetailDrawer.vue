<script setup lang="ts">
import { computed, watch, reactive, onUnmounted, ref } from "vue";
import { skillOwnerName, type Resource } from "../../types/api";
import { manager } from "../../api/manager";
import { requestRaw, errorText } from "../../api/http";
import { ResourceDetailState } from "../../domain/resourceState";
import CatalogAvatar from "../common/CatalogAvatar.vue";
import AsyncState from "../common/AsyncState.vue";
import MarkdownContent from "../conversation/MarkdownContent.vue";
import OwnerShareManagement from "./OwnerShareManagement.vue";
import ShareRequestDialog from "./ShareRequestDialog.vue";
import ConnectorAuthorization from "../connectors/ConnectorAuthorization.vue";
const props = defineProps<{
  resource: Resource | null;
  resources: Resource[];
  kind: "skills" | "connectors" | "tools";
}>();
defineEmits<{ close: []; edit: [r: Resource]; changed: [] }>();
const detail = reactive(new ResourceDetailState<Resource>()),
  notice = ref(""),
  shareOpen = ref(false),
  shareUpdate = ref(false);
watch(
  () => props.resource,
  (r) => {
    notice.value = "";
    shareOpen.value = false;
    if (r) void select(r.resource_version || "");
    else detail.dispose();
  },
);
onUnmounted(() => detail.dispose());
async function select(version: string) {
  const r = props.resource;
  if (r)
    await detail.select(version, () =>
      manager.resource(props.kind, r.resource_id, props.kind === "connectors" ? undefined : version),
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
</script>
<template>
  <t-drawer
    :visible="!!resource"
    :header="resource?.display_name"
    :footer="false"
    :size="'min(620px, 100vw)'"
    @close="$emit('close')"
    ><div v-if="resource" class="resource-detail">
      <div class="detail-identity">
        <CatalogAvatar
          :avatar="(detail.value || resource).payload.avatar"
          :name="(detail.value || resource).display_name"
          :skill="kind === 'skills' ? (detail.value || resource) : undefined"
        /><strong>{{ resource.display_name }}</strong>
      </div>
      <p v-if="kind !== 'connectors'" class="muted">
        v{{ detail.value?.version_label || resource.version_label || resource.resource_version }}
        <template v-if="kind === 'skills'">
          · <span>{{ skillOwnerName(detail.value || resource) }}</span>
        </template>
      </p>
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
                v-if="detail.value.can_share"
                variant="text"
                @click="shareUpdate = false; shareOpen = true"
                >申请共享</t-button>
              <t-button v-if="detail.value.can_share_update" variant="text"
                @click="shareUpdate = true; shareOpen = true">共享新版本</t-button>
            </div></template
          ><template v-else-if="kind === 'connectors'"
            ><div class="connector-summary">
              <span class="badge">{{
                connectorConfig.transport || "MCP"
              }}</span>
              <p>{{ connectorConfig.url || "" }}</p>
            </div>
            <ConnectorAuthorization
              v-if="
                detail.value.is_usable &&
                detail.value.auth_type &&
                detail.value.auth_type !== 'none'
              "
              :key="resource.resource_id"
              :resource-id="resource.resource_id"
              :method="detail.value.auth_type"
              @changed="$emit('changed')"
            />
          </template
          ><template v-else>
            <p class="muted">{{ detail.value.is_optional_tool ? "在工具目录勾选后供个人助理使用" : detail.value.is_system_default ? "系统默认工具" : "由专家配置使用的工具" }}</p>
            <details v-if="detail.value.payload.input_schema">
              <summary>输入参数</summary>
              <pre>{{ JSON.stringify(detail.value.payload.input_schema, null, 2) }}</pre>
            </details>
          </template></template
        ></AsyncState
      >
      <OwnerShareManagement v-if="kind === 'skills' && detail.value"
        :key="`${detail.value.resource_id}:${detail.value.owner_id}`"
        resource-type="skill" :resource-id="detail.value.resource_id"
        :owner-type="detail.value.owner_type" :owner-id="detail.value.owner_id"
        @changed="select(detail.selectedVersion); $emit('changed')"
      />
      <div v-if="notice" class="detail-notice" role="status">{{ notice }}</div>
    </div></t-drawer
  >
  <ShareRequestDialog
    v-if="kind === 'skills'"
    :visible="shareOpen"
    resource-type="skill"
    :resource-id="detail.value?.resource_id || ''"
    :version="(!shareUpdate && (detail.value?.share_version_label || detail.value?.share_version)) || detail.value?.version_label || detail.selectedVersion"
    :update="shareUpdate"
    @close="shareOpen = false"
    @submitted="
      shareOpen = false;
      notice = '共享申请已提交。';
      select(detail.selectedVersion); $emit('changed');
    "
  />
</template>
<style scoped src="../../styles/components/resource-detail.css"></style>
