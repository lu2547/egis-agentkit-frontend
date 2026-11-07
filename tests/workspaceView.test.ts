import { describe, expect, it } from "vitest";
import {
  workspaceDisplayPath,
  workspaceLinkLocation,
  workspaceRootFiles,
} from "../src/domain/workspaceView";

describe("one-project workspace view", () => {
  it("puts the two logical directories before flat inputs and retains each area", () => {
    const input = {
      name: ".work",
      path: ".work",
      is_directory: false,
      size: 12,
      modified_at: "",
    };
    const files = workspaceRootFiles([input]);
    expect(
      files.map(({ name, area, path, is_directory }) => ({
        name,
        area,
        path,
        is_directory,
      })),
    ).toEqual([
      { name: ".work", area: "work", path: "", is_directory: true },
      { name: "产物", area: "artifacts", path: "", is_directory: true },
      { name: ".work", area: "uploads", path: ".work", is_directory: false },
    ]);
    expect(input).not.toHaveProperty("area");
  });
  it("uses the same display paths for change records and links", () => {
    expect(workspaceDisplayPath("uploads", "资料/背景.md")).toBe(
      "资料/背景.md",
    );
    expect(workspaceDisplayPath("work", "generate.py")).toBe(
      ".work/generate.py",
    );
    expect(workspaceDisplayPath("artifacts", "report.docx")).toBe(
      "产物/report.docx",
    );
    expect(workspaceLinkLocation(".work/generate.py", "uploads")).toEqual({
      area: "work",
      path: "generate.py",
    });
    expect(workspaceLinkLocation("产物/report.docx", "work")).toEqual({
      area: "artifacts",
      path: "report.docx",
    });
    expect(workspaceLinkLocation("背景.md", "uploads")).toEqual({
      area: "uploads",
      path: "背景.md",
    });
    expect(workspaceLinkLocation("uploads/背景.md", "work")).toEqual({
      area: "uploads",
      path: "背景.md",
    });
  });
});
