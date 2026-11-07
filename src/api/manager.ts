import { http, json } from "./http";
import type {
  ComposerOptionsPage,
  ComposerOptionsQuery,
  Definition,
  DefinitionRef,
  Task,
  Project,
  User,
  Resource,
  ModelOption,
  Review,
  WorkspaceFile,
  ReplyArtifact,
  RuntimeOptions,
  TaskSettings,
  SkillImportJob,
} from "../types/api";
const id = encodeURIComponent;
export const workspacePath = (sid: string, projectId?: string) =>
  projectId
    ? `/manager/projects/${id(projectId)}`
    : `/manager/tasks/${id(sid)}`;
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
  definitions: (kind: "agents" | "teams") =>
    http<{ items: Definition[] }>(`/manager/${kind}`),
  definition: (kind: "agents" | "teams", definitionId: string, view: string) =>
    http<Definition>(`/manager/${kind}/${id(definitionId)}`, {}, { view }),
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
  resources: (kind: "skills" | "connectors") =>
    http<{ items: Resource[] }>(`/manager/${kind}`),
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
  install: (kind: string, resourceId: string, version: string) =>
    http<unknown>(`/manager/${kind}/${id(resourceId)}/install`, json("POST"), {
      version,
    }),
  toggle: (
    kind: string,
    resourceId: string,
    version: string,
    is_enabled: boolean,
  ) =>
    http<unknown>(
      `/manager/${kind}/${id(resourceId)}/installation`,
      json("PATCH", { is_enabled }),
      { version },
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
  share: (
    resource_type: string,
    resource_id: string,
    resource_version?: string,
  ) =>
    http<unknown>(
      "/manager/share-requests",
      json("POST", { resource_type, resource_id, resource_version }),
    ),
  sessionArtifacts: (sid: string, signal?: AbortSignal) =>
    http<{ items: ReplyArtifact[] }>(`/manager/tasks/${id(sid)}/artifacts`, {
      signal,
    }),
  files: (
    sid: string,
    area: string,
    path = "",
    signal?: AbortSignal,
    recursive = false,
    projectId?: string,
  ) =>
    http<{ items: WorkspaceFile[] }>(
      `${workspacePath(sid, projectId)}/files`,
      { signal },
      { area, path, ...(recursive ? { recursive: "true" } : {}) },
    ),
  deleteFile: (sid: string, area: string, path: string, projectId?: string) =>
    http<void>(
      `${workspacePath(sid, projectId)}/files`,
      { method: "DELETE" },
      { area, path },
    ),
  uploadFile: (
    sid: string,
    file: File,
    signal?: AbortSignal,
    projectId?: string,
  ) => {
    const body = new FormData();
    body.append("file", file);
    return http<WorkspaceFile>(
      `${workspacePath(sid, projectId)}/files`,
      { method: "POST", body, signal },
      { area: "uploads" },
    );
  },
  deliver: (sid: string, path: string, projectId?: string) =>
    http<unknown>(
      `${workspacePath(sid, projectId)}/deliver`,
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
  disablePackage: (key: string, version: string) =>
    http<unknown>(`/manager/admin/packages/${id(key)}`, json("DELETE"), {
      version,
    }),
  decide: (reviewId: string, is_approved: boolean, reason: string) =>
    http<unknown>(
      `/manager/admin/share-reviews/${id(reviewId)}/decision`,
      json("POST", { is_approved, reason }),
    ),
};
