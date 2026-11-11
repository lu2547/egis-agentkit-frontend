import { http, json } from "./http";
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
  InstallableCatalog,
  CatalogKind,
  AdminResource,
  ConnectorAuthType,
  ConnectorDependencyAuthorization,
  ModelOption,
  Review,
  ShareTarget,
  ShareableKind,
  ShareRecipient,
  GrantResource,
  WorkspaceFile,
  ReplyArtifact,
  RuntimeOptions,
  TaskSettings,
  SkillImportJob,
} from "../types/api";
const id = encodeURIComponent;
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
  ) =>
    http<Task>(
      `/manager/tasks/${id(sid)}/collaborators`,
      json("POST", { request_id, experts }),
    ),
  runtimeOptions: () => http<RuntimeOptions>("/manager/runtime-options"),
  updateTaskSettings: (sid: string, settings: TaskSettings) =>
    http<Task>(`/manager/tasks/${id(sid)}/settings`, json("PATCH", settings)),
  models: () =>
    http<{ items: ModelOption[]; default_key?: string }>("/manager/models"),
  resources: (kind: ResourceCatalog) =>
    http<{ items: Resource[]; dependency_authorizations?: ConnectorDependencyAuthorization[] }>(`/manager/${kind}`),
  resource: (
    kind: string,
    resourceId: string,
    version: string,
    signal?: AbortSignal,
  ) =>
    http<Resource>(
      `/manager/${kind}/${id(resourceId)}`,
      { signal },
      { version },
    ),
  resourceVersions: (kind: ResourceCatalog, resourceId: string) =>
    http<{ items: Resource[] }>(`/manager/${kind}/${id(resourceId)}/versions`),
  adminResources: (kind: CatalogKind) =>
    http<{ items: AdminResource[] }>(`/manager/admin/resources/${kind}`),
  registerSystemResource: (kind: "skill" | "mcp", body: unknown) =>
    http<Resource>(`/manager/admin/resources/${kind}`, json("POST", body)),
  setResourceAvailability: (kind: CatalogKind, resourceId: string, version: string, is_enabled: boolean) =>
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
  skillImport: (jobId: string) =>
    http<SkillImportJob>(`/manager/skills/imports/${id(jobId)}`),
  importSkill: (file: File, category: string, avatar: string) => {
    const body = new FormData();
    body.append("file", file);
    body.append("category", category);
    body.append("avatar", avatar);
    return http<SkillImportJob>("/manager/skills/imports", {
      method: "POST",
      body,
    });
  },
  retrySkillImport: (jobId: string) =>
    http<SkillImportJob>(
      `/manager/skills/imports/${id(jobId)}/retry`,
      json("POST"),
    ),
  install: (kind: InstallableCatalog, resourceId: string, version: string) =>
    http<unknown>(`/manager/${kind}/${id(resourceId)}/install`, json("POST"), {
      version,
    }),
  toggle: (
    kind: InstallableCatalog,
    resourceId: string,
    version: string,
    is_enabled: boolean,
  ) =>
    http<unknown>(
      `/manager/${kind}/${id(resourceId)}/installation`,
      json("PATCH", { is_enabled }),
      { version },
    ),
  connectorAuthorization: (resourceId: string, version: string) =>
    http<{ authorized: boolean; auth_type: ConnectorAuthType }>(
      `/manager/connectors/${id(resourceId)}/authorization`, {}, { version },
    ),
  saveConnectorKey: (resourceId: string, version: string, key: string) =>
    http<{ authorized: boolean }>(
      `/manager/connectors/${id(resourceId)}/authorization/key`, json("PUT", { key }), { version },
    ),
  startConnectorOAuth: (resourceId: string, version: string) =>
    http<{ authorization_url: string; state: string }>(
      `/manager/connectors/${id(resourceId)}/authorization/start`, json("POST"), { version },
    ),
  finishConnectorOAuth: (resourceId: string, version: string, state: string, code: string | null) =>
    http<{ authorized: boolean }>(
      `/manager/connectors/${id(resourceId)}/authorization/callback`, json("POST", { state, code }), { version },
    ),
  revokeConnectorAuthorization: (resourceId: string, version: string) =>
    http<{ authorized: boolean }>(
      `/manager/connectors/${id(resourceId)}/authorization`, json("DELETE"), { version },
    ),
  connectorTest: (resourceId: string, version: string) =>
    http<{
      is_connected?: boolean;
      tools?: { name: string; description?: string }[];
      error?: string;
    }>(`/manager/connectors/${id(resourceId)}/test`, json("POST"), { version }),
  preferences: () =>
    http<{ agent_md: string; soul_md: string; user_md: string }>(
      "/manager/preferences",
    ),
  savePreferences: (body: unknown) =>
    http<unknown>("/manager/preferences", json("PUT", body)),
  reviews: () => http<{ items: Review[] }>("/manager/share-requests"),
  shareRecipients: () => http<{ items: ShareRecipient[] }>("/manager/share-recipients"),
  grantResources: () => http<{ items: GrantResource[] }>("/manager/admin/grant-resources"),
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
  adminList: <T>(kind: string) =>
    http<{ items: T[] }>(`/manager/admin/${kind}`),
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
};
