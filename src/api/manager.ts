import { http, json, requestRaw } from "./http";
import type {
  ComposerOptionsPage,
  ComposerOptionsQuery,
  Definition,
  DefinitionRef,
  DefinitionVersion,
  ViewType,
  Task,
  Project,
  User,
  Resource,
  ResourceCatalog,
  CatalogQuery,
  CatalogPage,
  InstallableCatalog,
  CatalogKind,
  AdminResource,
  ConnectorAuthType,
  ModelOption,
  Review,
  BatchAccessResponse,
  SkillGrantReference,
  ShareTarget,
  ShareableKind,
  ShareRecipient,
  GrantResource,
  WorkspaceFile,
  ReplyArtifact,
  RuntimeOptions,
  TaskSettings,
  ReplyFeedback,
  ReplyFeedbackState,
  SkillImportJob,
  VirtualUser,
} from "../types/api";
const id = encodeURIComponent;
export interface AdminPage<T> {
  items: T[];
  page: number;
  page_size: number;
  has_next: boolean;
}

function catalogPage<T>(
  kind: "agents" | ResourceCatalog,
  { query, category, mine, cursor, limit, purpose, owner_type, resource_ids }: CatalogQuery,
  signal: AbortSignal,
) {
  return http<CatalogPage<T>>(`/manager/${kind}`, { signal }, {
    catalog: "true",
    query,
    category,
    mine: mine ? "true" : undefined,
    cursor, limit, purpose, owner_type, resource_ids,
  });
}

export const workspacePath = (projectId: string) =>
  `/manager/projects/${id(projectId)}`;
export const manager = {
  composerOptions: (params: ComposerOptionsQuery, signal?: AbortSignal) =>
    http<ComposerOptionsPage>(
      "/manager/composer/options",
      { signal },
      { ...params },
    ),
  me: () => http<User>("/manager/me"),
  createVirtualUser: (username: string) =>
    http<VirtualUser & { token: string }>(
      "/manager/admin/virtual-users",
      json("POST", { username }),
    ),
  setVirtualUserEnabled: (userId: string, is_enabled: boolean) =>
    http<VirtualUser>(
      `/manager/admin/virtual-users/${id(userId)}`,
      json("PATCH", { is_enabled }),
    ),
  rotateVirtualUser: (userId: string) =>
    http<VirtualUser & { token: string }>(
      `/manager/admin/virtual-users/${id(userId)}/rotate`,
      json("POST"),
    ),
  login: (user_id: string, password: string) =>
    http<{ access_token: string }>(
      "/auth/login",
      json("POST", { user_id, password }),
    ),
  async definitions(kind: "agents" | "teams") {
    if (kind === "teams") return http<{ items: Definition[] }>("/manager/teams");
    const items: Definition[] = [];
    let cursor: string | null = null;
    do {
      const page: { items: Definition[]; next_cursor: string | null } =
        await http("/manager/agents", {}, { cursor });
      items.push(...page.items);
      cursor = page.next_cursor;
    } while (cursor !== null);
    return { items };
  },
  expertCatalog: (params: CatalogQuery, signal: AbortSignal) =>
    catalogPage<Definition>("agents", params, signal),
  setExpertCandidate: (definitionId: string, view: ViewType, selected: boolean) =>
    http<void>(
      `/manager/agents/${id(definitionId)}/invite-candidate`,
      { method: selected ? "PUT" : "DELETE" },
      { view },
    ),
  skillNames: (runtimeNames: string[]) =>
    http<CatalogPage<Resource>>("/manager/skills", {}, { runtime_names: runtimeNames, limit: 100 }),
  resourceCatalog: (kind: ResourceCatalog, params: CatalogQuery, signal: AbortSignal) =>
    catalogPage<Resource>(kind, params, signal),
  definition: (
    kind: "agents" | "teams",
    definitionId: string,
    view: ViewType,
    resource_version?: string,
    signal?: AbortSignal,
  ) =>
    http<Definition>(
      `/manager/${kind}/${id(definitionId)}`,
      { signal },
      { view, resource_version },
    ),
  definitionVersions: (kind: "agents" | "teams", definitionId: string) =>
    http<{ items: DefinitionVersion[] }>(`/manager/${kind}/${id(definitionId)}/versions`),
  assistant: () => http<Definition>("/manager/assistant"),
  saveDefinition: (
    kind: "agents" | "teams",
    body: unknown,
    definitionId?: string,
  ) =>
    http<Definition>(
      `/manager/${kind}${definitionId ? `/${id(definitionId)}` : ""}`,
      json(definitionId ? "PUT" : "POST", body),
    ),
  deleteDefinition: (kind: "agents" | "teams", definitionId: string) =>
    http<void>(`/manager/${kind}/${id(definitionId)}`, json("DELETE")),
  tasks: () => http<{ items: Task[] }>("/manager/tasks"),
  projects: () => http<{ items: Project[] }>("/manager/projects"),
  project: (projectId: string) =>
    http<Project>(`/manager/projects/${id(projectId)}`),
  createProject: (project_name: string) =>
    http<Project>("/manager/projects", json("POST", { project_name })),
  renameProject: (projectId: string, project_name: string) =>
    http<Project>(
      `/manager/projects/${id(projectId)}`,
      json("PATCH", { project_name }),
    ),
  deleteProject: (projectId: string) =>
    http<void>(`/manager/projects/${id(projectId)}`, json("DELETE")),
  renameTask: (sid: string, name: string) =>
    http<Task>(`/manager/tasks/${id(sid)}/name`, json("PATCH", { name })),
  deleteTask: (sid: string) =>
    http<void>(`/manager/tasks/${id(sid)}`, json("DELETE")),
  task: (sid: string, signal?: AbortSignal) =>
    http<Task>(`/manager/tasks/${id(sid)}`, { signal }),
  addSessionBranch: (sid: string, replyId: string) =>
    http<Task>(`/manager/tasks/${id(sid)}/replies/${id(replyId)}/branch`, json("POST")),
  listReplyFeedback: (sid: string, signal?: AbortSignal) =>
    http<{items: ReplyFeedbackState[]}>(`/manager/tasks/${id(sid)}/reply-feedback`, {signal}),
  saveReplyFeedback: (sid: string, replyId: string, comment: string) =>
    http<ReplyFeedback>(`/manager/tasks/${id(sid)}/replies/${id(replyId)}/feedback`, json("PUT", {comment})),
  pageReplyFeedback: (cursor?: string) =>
    http<{items: ReplyFeedback[]; next_cursor: string | null}>("/manager/admin/reply-feedback", {}, {cursor}),
  createTask: (
    definition: DefinitionRef,
    model_key?: string,
    permission_mode?: string,
    project_id?: string,
  ) =>
    http<Task>(
      "/manager/tasks",
      json("POST", {
        ...definition,
        ...(model_key ? { model_key } : {}),
        ...(permission_mode ? { permission_mode } : {}),
        ...(project_id ? { project_id } : {}),
      }),
    ),
  prepareCollaborators: (
    sid: string,
    request_id: string,
    experts: DefinitionRef[],
    signal?: AbortSignal,
  ) =>
    http<Task>(
      `/manager/tasks/${id(sid)}/collaborators`,
      { ...json("POST", { request_id, experts }), signal },
    ),
  removeCollaborator: (sid: string, workerSid: string, signal: AbortSignal) =>
    http<Task>(`/manager/tasks/${id(sid)}/collaborators/${id(workerSid)}`, {
      method: "DELETE",
      signal,
    }),
  runtimeOptions: () => http<RuntimeOptions>("/manager/runtime-options"),
  updateTaskSettings: (sid: string, settings: TaskSettings) =>
    http<Task>(`/manager/tasks/${id(sid)}/settings`, json("PATCH", settings)),
  models: () =>
    http<{ items: ModelOption[]; default_key?: string }>("/manager/models"),
  resources: (kind: ResourceCatalog) =>
    http<{ items: Resource[] }>(`/manager/${kind}`),
  resource: (
    kind: string,
    resourceId: string,
    version?: string,
    signal?: AbortSignal,
  ) =>
    http<Resource>(
      `/manager/${kind}/${id(resourceId)}`,
      { signal },
      { version },
    ),
  resourceVersions: (kind: ResourceCatalog, resourceId: string) =>
    http<{ items: Resource[] }>(`/manager/${kind}/${id(resourceId)}/versions`),
  registerSystemResource: (kind: "skill" | "mcp", body: unknown) =>
    http<Resource>(`/manager/admin/resources/${kind}`, json("POST", body)),
  setResourceAvailability: (kind: CatalogKind, resourceId: string, version: string | undefined, is_enabled: boolean) =>
    http<AdminResource>(
      `/manager/admin/resources/${kind}/${id(resourceId)}`,
      json("PATCH", { is_enabled }), { version },
    ),
  saveResource: (kind: string, body: unknown, resourceId?: string) =>
    http<Resource>(
      `/manager/${kind}${resourceId ? `/${id(resourceId)}` : ""}`,
      json(resourceId ? "PUT" : "POST", body),
    ),
  skillImports: () =>
    http<{ items: SkillImportJob[] }>("/manager/skills/imports"),
  deleteSkill: (resourceId: string) =>
    http<void>(`/manager/skills/${id(resourceId)}`, json("DELETE")),
  skillImport: (jobId: string) =>
    http<SkillImportJob>(`/manager/skills/imports/${id(jobId)}`),
  importSkill: (file: File, category: string, system = false) => {
    const body = new FormData();
    body.append("file", file);
    body.append("category", category);
    body.append("owner_type", system ? "system" : "user");
    return http<SkillImportJob>("/manager/skills/imports", {
      method: "POST",
      body,
    });
  },
  skillAvatar: (rid: string, version: string, signal: AbortSignal) =>
    requestRaw(`/manager/skills/${id(rid)}/avatar`, { signal }, { version }),
  retrySkillImport: (jobId: string) =>
    http<SkillImportJob>(
      `/manager/skills/imports/${id(jobId)}/retry`,
      json("POST"),
    ),
  decideSkillImports: (job_ids: string[], approved: boolean, reason: string) =>
    http<{ items: { id: string; ok: boolean; detail?: string }[] }>(
      "/manager/admin/skill-imports/batch/decision",
      json("POST", { job_ids, approved, reason }),
    ),
  downloadSkillImport: (jobId: string) =>
    requestRaw(`/manager/admin/skill-imports/${id(jobId)}/download`),
  install: (kind: InstallableCatalog, resourceId: string) =>
    http<unknown>(`/manager/${kind}/${id(resourceId)}/install`, json("POST")),
  toggle: (
    kind: InstallableCatalog,
    resourceId: string,
    is_enabled: boolean,
  ) =>
    http<unknown>(
      `/manager/${kind}/${id(resourceId)}/installation`,
      json("PATCH", { is_enabled }),
    ),
  removeInstallation: (kind: InstallableCatalog, resourceId: string) =>
    http<void>(
      `/manager/${kind}/${id(resourceId)}/installation`,
      json("DELETE"),
    ),
  connectorAuthorization: (resourceId: string) =>
    http<{ authorized: boolean; auth_type: ConnectorAuthType }>(
      `/manager/connectors/${id(resourceId)}/authorization`,
    ),
  saveConnectorKey: (resourceId: string, key: string) =>
    http<{ authorized: boolean }>(
      `/manager/connectors/${id(resourceId)}/authorization/key`, json("PUT", { key }),
    ),
  startConnectorOAuth: (resourceId: string) =>
    http<{ authorization_url: string; state: string }>(
      `/manager/connectors/${id(resourceId)}/authorize`, json("POST"),
    ),
  finishConnectorOAuth: (resourceId: string, state: string, code: string | null) =>
    http<{ authorized: boolean }>(
      `/manager/connectors/${id(resourceId)}/authorization/callback`, json("POST", { state, code }),
    ),
  revokeConnectorAuthorization: (resourceId: string) =>
    http<{ authorized: boolean }>(
      `/manager/connectors/${id(resourceId)}/authorization`, json("DELETE"),
    ),
  connectorTest: (resourceId: string) =>
    http<{
      is_connected?: boolean;
      tools?: { name: string; description?: string }[];
      error?: string;
    }>(`/manager/connectors/${id(resourceId)}/test`, json("POST")),
  preferences: () =>
    http<{ agent_md: string; soul_md: string; user_md: string }>(
      "/manager/preferences",
    ),
  savePreferences: (body: unknown) =>
    http<unknown>("/manager/preferences", json("PUT", body)),
  withdrawShare: (reviewId: string) =>
    http<void>(`/manager/share-requests/${id(reviewId)}`, { method: "DELETE" }),
  reviews: () => http<{ items: Review[] }>("/manager/share-requests"),
  shareRecipients: () => http<{ items: ShareRecipient[] }>("/manager/share-recipients"),
  searchRecipients: (
    principal_type: ShareTarget["principal_type"],
    q: string,
    page: number,
    signal?: AbortSignal,
  ) =>
    http<AdminPage<ShareRecipient>>(
      "/manager/share-recipients",
      { signal },
      { principal_type, q, page },
    ),
  grantResources: (includeSkills = true) => http<{ items: GrantResource[] }>("/manager/admin/grant-resources", {}, { include_skills: includeSkills ? undefined : "false" }),
  shareSkills: (resource_ids: string[], target: ShareTarget) =>
    http<BatchAccessResponse>(
      "/manager/share-requests/batch",
      json("POST", { resource_ids, target }),
    ),
  grantSkills: (resources: SkillGrantReference[], target: ShareTarget) =>
    http<BatchAccessResponse>(
      "/manager/admin/grants/batch",
      json("POST", { resources, target }),
    ),
  share: (
    resource_type: ShareableKind,
    resource_id: string,
    target?: ShareTarget,
  ) =>
    http<unknown>(
      "/manager/share-requests",
      json("POST", { resource_type, resource_id, target }),
    ),
  sessionArtifacts: (sid: string, signal?: AbortSignal) =>
    http<{ items: ReplyArtifact[] }>(`/manager/tasks/${id(sid)}/artifacts`, {
      signal,
    }),
  files: (
    projectId: string,
    area: string,
    path = "",
    signal?: AbortSignal,
    recursive = false,
  ) =>
    http<{ items: WorkspaceFile[] }>(
      `${workspacePath(projectId)}/files`,
      { signal },
      { area, path, ...(recursive ? { recursive: "true" } : {}) },
    ),
  deleteFile: (projectId: string, area: string, path: string) =>
    http<void>(
      `${workspacePath(projectId)}/files`,
      { method: "DELETE" },
      { area, path },
    ),
  uploadFile: (
    projectId: string,
    file: File,
    signal?: AbortSignal,
    overwrite = false,
  ) => {
    const body = new FormData();
    body.append("file", file);
    return http<WorkspaceFile>(
      `${workspacePath(projectId)}/files`,
      { method: "POST", body, signal },
      { area: "uploads", overwrite: overwrite ? "true" : undefined },
    );
  },
  deliver: (projectId: string, path: string) =>
    http<unknown>(
      `${workspacePath(projectId)}/deliver`,
      json("POST", { path }),
    ),
  groupOptions: () =>
    http<{ items: { group_id: string; group_name: string }[] }>(
      "/manager/admin/groups", {}, { include_members: "false" },
    ),
  adminPage: <T>(kind: string, page: number, filters?: { group_id?: string }) =>
    http<AdminPage<T>>(`/manager/admin/${kind}`, {}, { page, ...filters }),
  adminSave: (kind: string, body: unknown, key?: string) =>
    http<unknown>(
      `/manager/admin/${kind}${key ? `/${id(key)}` : ""}`,
      json(key ? "PUT" : "POST", body),
    ),
  adminDelete: (kind: string, key: string) =>
    http<unknown>(`/manager/admin/${kind}/${id(key)}`, json("DELETE")),
  decide: (reviewId: string, is_approved: boolean, reason: string) =>
    http<unknown>(
      `/manager/admin/share-reviews/${id(reviewId)}/decision`,
      json("POST", { is_approved, reason }),
    ),
  decideShares: (review_ids: string[], is_approved: boolean, reason: string) =>
    http<BatchAccessResponse>(
      "/manager/admin/share-reviews/batch/decision",
      json("POST", { review_ids, is_approved, reason }),
    ),
};
