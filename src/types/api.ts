export type ViewType = "private" | "shared" | "system";
export interface User {
  user_id: string;
  username: string;
  role_type: "user" | "admin";
  group_ids: string[];
  is_enabled: boolean;
}
export interface DefinitionRef {
  definition_id: string;
  resource_view_type: ViewType;
  resource_version: string;
}
export interface DefinitionVersion {
  resource_view_type: ViewType;
  resource_version: string;
}
export type ResourceBinding = {
  resource_id: string;
  resource_view_type: ViewType;
} & (
  | { resource_type: "skill" | "tool"; resource_version: string }
  | { resource_type: "mcp"; resource_version?: never }
);
export interface RemoteAgentConfig {
  transport: "http_sync" | "http_callback" | "websocket";
  protocol_version: "v1";
  endpoint: string;
  credential_ref: string;
  callback_secret_ref?: string;
  cancel_endpoint?: string;
  timeout_seconds?: number;
  retries?: number;
}
export interface DefinitionPayload {
  description: string;
  category: string;
  tags: string[];
  avatar?: string;
  system_prompt?: string;
  starter_prompts: string[];
  model_key?: string | null;
  bindings?: ResourceBinding[];
  orchestrator?: DefinitionRef;
  members?: DefinitionRef[];
  remote_config?: RemoteAgentConfig | null;
}
export interface Definition {
  is_invite_candidate?: boolean;
  version_label?: string;
  can_share?: boolean;
  can_share_update?: boolean;
  has_shared_version?: boolean;
  share_version?: string | null;
  share_version_label?: string | null;
  id: string;
  definition_type: "agent" | "team";
  agent_type?: "personal" | "expert" | "remote" | "orchestrator";
  owner_type: string;
  owner_id: string;
  agent_name?: string;
  agent_display_name?: string;
  team_name?: string;
  team_display_name?: string;
  payload: DefinitionPayload;
  resource_view_type: ViewType;
  resource_version: string;
  is_usable: boolean;
  is_editable: boolean;
  is_deletable: boolean;
  share_status_type?: string;
  owner_version?: number;
  version?: number;
  orchestrator_config?: {
    agent_name: string;
    agent_display_name: string;
    payload: DefinitionPayload;
    owner_version?: number;
  };
}
export interface Project {
  id: string;
  is_default?: boolean;
  project_name: string;
  owner_id: string;
  created_at: string;
  updated_at: string;
}
export interface Collaborator extends DefinitionRef {
  display_name: string;
  status: "pending" | "joined";
  worker_session_id?: string;
  avatar?: string | null;
}
export interface CollaboratorProgress {
  worker_session_id: string;
  worker_agent_id: string;
  display_name: string;
  reply_id?: string;
  started_at?: string;
  finished_at?: string;
  revision: number;
  status: "queued" | "running" | "waiting" | "completed" | "failed" | "interrupted";
  activities: { id: string; name: string; state: string }[];
}
export interface SessionExecutionPhase {
  session_id: string;
  reply_id: string;
  phase: "memory";
}
export interface Task {
  execution_phase?: SessionExecutionPhase | null;
  source?: "user" | "schedule";
  latest_schedule_run_id?: string | null;
  collaborator_progress?: CollaboratorProgress[];
  collaboration_allowed?: boolean;
  pending_collaboration_request_id?: string | null;
  collaborators?: Collaborator[];
  project_id: string;
  is_running?: boolean;
  is_waiting?: boolean;
  session_id: string;
  agent_id: string;
  name: string;
  definition_id: string;
  resource_version: string;
  definition_display_name: string;
  agent_display_names?: Record<string, string>;
  updated_at: string;
  permission_mode?: string;
  model_key?: string | null;
  plan: { id: string; subject: string; state: string }[];
}
export interface CatalogQuery {
  query?: string;
  category?: string;
  mine?: boolean;
  cursor?: string | null;
  limit?: number;
  purpose?: "grant";
  resource_ids?: string[];
  owner_type?: "system";
}
export interface CatalogPage<T> {
  items: T[];
  next_cursor: string | null;
  categories?: string[];
  has_shareable?: boolean;
}
export type ResourceCatalog = "skills" | "connectors" | "tools";
export type InstallableCatalog = ResourceCatalog;
export type CatalogKind = "skill" | "mcp";
export type ShareableKind = CatalogKind | "agent" | "team";
export type ConnectorAuthType = "none" | "api_key" | "oauth";
export interface Resource {
  runtime_name?: string;
  version_label?: string;
  can_share?: boolean;
  can_share_update?: boolean;
  has_shared_version?: boolean;
  share_version?: string | null;
  share_version_label?: string | null;
  resource_view_type: ViewType;
  resource_id: string;
  resource_version?: string;
  owner_type: string;
  owner_id: string;
  owner_display_name?: string;
  display_name: string;
  description: string;
  is_usable: boolean;
  is_editable: boolean;
  is_deletable: boolean;
  is_installed: boolean;
  is_enabled: boolean;
  is_system_default?: boolean;
  is_optional_tool?: boolean;
  is_agent_tool?: boolean;
  is_available?: boolean;
  auth_type?: ConnectorAuthType | null;
  is_authorized?: boolean;
  publication_revision?: number;
  payload: Record<string, unknown>;
}
export interface AdminResource extends Resource {
  bound_agents: { id: string; name: string }[];
  grant_sources: {
    id: string;
    principal_type: PrincipalType;
    principal_id: string;
    grant_source_type: string;
    agent_id?: string | null;
    team_id?: string | null;
  }[];
}
export interface SkillSaveInput {
  resource_id: string;
  markdown: string;
  category: string;
  base_version?: string;
}
export interface SkillImportJob {
  job_id: string;
  status: "queued" | "running" | "pending_approval" | "succeeded" | "failed" | "rejected";
  stage: string;
  progress: number;
  filename: string;
  category: string;
  avatar: string;
  resource_id?: string | null;
  resource_version?: string | null;
  error?: string | null;
  attempts: number;
  created_at: string;
  updated_at: string;
  owner_type: "user" | "system";
  uploader_type: "user" | "admin" | "virtual";
  uploaded_by?: string | null;
  reviewed_by?: string | null;
  reviewed_at?: string | null;
  review_reason?: string | null;
  result?: { display_name?: string; description?: string } | null;
}
export interface VirtualUser {
  user_id: string;
  username: string;
  is_enabled: boolean;
}
export interface PermissionModeOption {
  value: string;
  label: string;
  description: string;
  is_enabled: boolean;
}
export interface RuntimeOptions {
  permission_modes: PermissionModeOption[];
  default_permission_mode: string;
  steering?: {
    max_batch_size: number;
    max_message_bytes: number;
    max_text_length: number;
  };
}
export interface TaskSettings {
  permission_mode?: string;
  model_key?: string;
}

export interface ReplyFeedback {
  id: string;
  user_id: string;
  username: string;
  project_id: string;
  project_name: string;
  session_id: string;
  session_name: string;
  reply_id: string;
  agent_id: string;
  definition_id: string;
  agent_display_name: string;
  comment: string;
  question_text: string;
  reply_text: string;
  created_at: string;
  updated_at: string;
}
export type ReplyFeedbackState = Pick<ReplyFeedback, "reply_id" | "comment">;
export interface ModelOption {
  key: string;
  display_name: string;
}
export interface ReplyArtifact extends WorkspaceFile {
  reply_id: string;
}
export interface WorkspaceFile {
  area?: "uploads" | "work" | "artifacts";
  name: string;
  path: string;
  is_directory: boolean;
  size: number;
  modified_at: string;
}
export type PrincipalType = "user" | "group";
export interface ShareTarget {
  principal_type: PrincipalType;
  principal_id: string;
}
export interface ShareRecipient extends ShareTarget {
  display_name: string;
}
export interface GrantResource {
  resource_type: ShareableKind;
  resource_id: string;
  resource_view_type: string;
  resource_owner_type: string;
  resource_owner_id: string;
  display_name: string;
}
export const MAX_SKILL_BATCH_SIZE = 50;
export type SkillGrantReference = Pick<
  GrantResource,
  "resource_id" | "resource_owner_id"
>;
export type BatchAccessResult =
  | { id: string; success: true }
  | { id: string; success: false; status_code: number; detail: string };
export interface BatchAccessResponse {
  items: BatchAccessResult[];
}
export const principalName = (type: PrincipalType, id: string) =>
  `${type === "group" ? "组织组" : "用户"} · ${id}`;

export interface Review {
  review_id: string;
  resource_type: ShareableKind;
  resource_id: string;
  resource_version: string;
  version_label?: string;
  review_type?: "share" | "update" | "revoke";
  original_review_id?: string | null;
  owner_id?: string;
  submitted_by?: string;
  is_current?: boolean;
  has_active_share?: boolean;
  share_scope_type: PrincipalType | null;
  principal_id: string | null;
  review_status_type: string;
  review_reason: string;
}
export interface ReviewContentNode {
  resource_type: ShareableKind | "tool";
  resource_id: string;
  resource_version: string;
  version_label: string;
  display_name: string;
  checksum_sha256: string;
  configuration_revision?: number | null;
  origin: "submitted" | "reconstructed";
  payload: Record<string, unknown>;
  content_error?: string;
}
export interface ReviewContentSnapshot {
  origin: "submitted" | "reconstructed";
  captured_at: string | null;
  root: ReviewContentNode;
  dependencies: ReviewContentNode[];
}
export interface ReviewDetail extends Review {
  content: ReviewContentSnapshot;
}
/** 在召唤、邀请和团队配置中保留用户选择的发布版本。 */
export const definitionRef = (d: Definition): DefinitionRef => ({
  definition_id: d.id,
  resource_view_type: d.resource_view_type,
  resource_version: d.resource_version,
});
export function definitionName(d: Definition) {
  return (
    d.team_display_name ||
    d.agent_display_name ||
    d.team_name ||
    d.agent_name ||
    "未命名"
  );
}
export const sourceName = (v: string) =>
  ({ private: "私有", shared: "已共享", system: "系统" })[v] || v;
export function skillOwnerName(resource: Resource) {
  return resource.owner_type === "system"
    ? "系统"
    : resource.owner_display_name || resource.owner_id;
}

export type ComposerCategory = "context" | "experts" | "skills" | "commands";
export interface ComposerOption {
  id: string;
  name: string;
  display_name?: string;
  detail: string;
  kind: "expert" | "skill" | "file" | "command";
  definition?: Definition;
  reference?: string;
  insert_text?: string;
}
export interface ComposerOptionsQuery {
  category: ComposerCategory;
  query?: string;
  cursor?: string;
  limit?: number;
  session_id?: string;
  project_id?: string;
}
export interface ComposerOptionsPage {
  items: ComposerOption[];
  next_cursor: string | null;
}
