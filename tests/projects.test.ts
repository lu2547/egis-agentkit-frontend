import { beforeEach, describe, expect, it, vi } from "vitest";
import { manager } from "../src/api/manager";
import { workspace } from "../src/api/workspace";

describe("project API targeting", () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    fetchMock.mockReset().mockImplementation(async () => new Response("{}"));
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("sessionStorage", { getItem: () => "token" });
  });
  it("creates projects and places new conversations inside the selected project", async () => {
    await manager.createProject("客户服务");
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/manager/projects");
    expect(JSON.parse(fetchMock.mock.calls[0]?.[1].body)).toEqual({
      project_name: "客户服务",
    });
    await manager.createTask(
      { definition_id: "personal", resource_view_type: "private" },
      undefined,
      "default",
      "p 1",
    );
    expect(JSON.parse(fetchMock.mock.calls[1]?.[1].body)).toMatchObject({
      project_id: "p 1",
    });
  });
  it("targets shared project files and changes while preserving the legacy session route", async () => {
    await manager.files("s1", "uploads", "资料", undefined, false, "p 1");
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "/api/manager/projects/p%201/files?area=uploads&path=%E8%B5%84%E6%96%99",
    );
    await workspace.changes("s1", undefined, undefined, "p 1");
    expect(fetchMock.mock.calls[1]?.[0]).toBe(
      "/api/manager/projects/p%201/file-changes",
    );
    await manager.files("s1", "work");
    expect(fetchMock.mock.calls[2]?.[0]).toBe(
      "/api/manager/tasks/s1/files?area=work&path=",
    );
  });
});
