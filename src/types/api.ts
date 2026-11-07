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
}
export interface ResourceBinding {
  resource_type: "skill" | "mcp";
  resource_id: string;
  resource_version: string;
  resource_view_type: ViewType;
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
  implementation?: { assembly_ref: string; assembly_version: string };
}
export interface Definition {
  id: string;
  definition_type: "agent" | "team";
  agent_type?: string;
  owner_type: string;
  owner_id: string;
  agent_name?: string;
  agent_display_name?: string;
  team_name?: string;
  team_display_name?: string;
  payload: DefinitionPayload;
  resource_view_type: ViewType;
  is_usable: boolean;
  is_editable: boolean;
  is_deletable: boolean;
  share_status_type?: string;
  config_version: number;
  orchestrator_config?: {
    agent_name: string;
    agent_display_name: string;
    payload: DefinitionPayload;
    config_version?: number;
  };
}
export interface Project {
  id: string;
  project_name: string;
  owner_id: string;
  created_at: string;
  updated_at: string;
}
export interface Task {
  project_id?: string;
  is_running?: boolean;
  is_waiting?: boolean;
  session_id: string;
  agent_id: string;
  name: string;
  definition_id: string;
  definition_display_name: string;
  agent_display_names?: Record<string, string>;
  updated_at: string;
  permission_mode?: string;
  model_key?: string | null;
  plan?: { id: string; subject: string; state: string }[];
}
export interface Resource {
  resource_view_type?: ViewType;
  resource_id: string;
  resource_version: string;
  owner_type: string;
  owner_id: string;
  display_name: string;
  description: string;
  is_usable: boolean;
  is_editable: boolean;
  is_installed: boolean;
  is_enabled: boolean;
  is_skill_market_visible?: boolean;
  payload: Record<string, unknown>;
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
}
export interface TaskSettings {
  permission_mode?: string;
  model_key?: string;
}
export interface ModelOption {
  key: string;
  display_name: string;
}
export interface WorkspaceFile {
  area?: "uploads" | "work" | "artifacts";
  name: string;
  path: string;
  is_directory: boolean;
  size: number;
  modified_at: string;
}
export interface Review {
  review_id: string;
  resource_type: string;
  resource_id: string;
  review_status_type: string;
  shared_version: number;
  review_reason: string;
  snapshot: Record<string, unknown>;
  source_versions?: Record<string, unknown>;
}
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
