import type { WorkspaceFile } from "../types/api";

export type WorkspaceArea = NonNullable<WorkspaceFile["area"]>;
export interface WorkspaceLocation {
  area: WorkspaceArea;
  path: string;
}
export const workspaceAreaLabel: Record<WorkspaceArea, string> = {
  uploads: "",
  work: ".work",
  artifacts: "产物",
};

/** The file tree is one project view; storage areas are not directory names. */
export function workspaceRootFiles(inputs: WorkspaceFile[]): WorkspaceFile[] {
  return [
    ...(["work", "artifacts"] as const).map((area) => ({
      area,
      name: workspaceAreaLabel[area],
      path: "",
      is_directory: true,
      size: 0,
      modified_at: "",
    })),
    ...inputs.map((file) => ({ ...file, area: "uploads" as const })),
  ];
}
export function workspaceDisplayPath(
  area: WorkspaceArea,
  path: string,
): string {
  return [workspaceAreaLabel[area], path].filter(Boolean).join("/");
}
export function workspaceLinkLocation(
  path: string,
  fallback: WorkspaceArea,
): WorkspaceLocation {
  const prefixes: [string, WorkspaceArea][] = [
    [".work/", "work"],
    ["产物/", "artifacts"],
    ["artifacts/", "artifacts"],
    ["uploads/", "uploads"],
    ["work/", "work"],
  ];
  const value = path.replace(/^\.\//, "");
  const match = prefixes.find(([prefix]) => value.startsWith(prefix));
  return match
    ? { area: match[1], path: value.slice(match[0].length) }
    : { area: fallback, path };
}
