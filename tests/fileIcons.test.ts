import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { fileIconType, fileIconUrl } from "../src/domain/fileIcons";

describe("shared file format icons", () => {
  it.each([
    ["总结.MD", "markdown"],
    ["report.markdown", "markdown"],
    ["合同.doc", "word"],
    ["uploads/年度报告.DOCX", "word"],
    ["演示.pptx", "powerpoint"],
    ["演示.ppt", "powerpoint"],
    ["报表.xlsx", "excel"],
    ["报表.xls", "excel"],
    ["数据.csv", "excel"],
    ["report.pdf", "pdf"],
    ["说明.txt", "text"],
    ["trace.log", "text"],
    ["generate.py", "python"],
    ["Main.java", "java"],
    ["main.go", "go"],
    ["go.mod", "go"],
    ["index.js", "javascript"],
    ["index.tsx", "typescript"],
    ["index.html", "html"],
    ["theme.css", "css"],
    ["page.vue", "vue"],
    ["settings.json", "json"],
    ["settings.yaml", "yaml"],
    [".env.local", "config"],
    ["photo.png", "image"],
    ["录音.mp3", "audio"],
    ["录屏.mp4", "video"],
    ["bundle.tar.gz", "archive"],
    ["run.sh", "shell"],
    ["query.sql", "sql"],
    ["main.rs", "rust"],
    ["main.cpp", "cpp"],
    ["Main.kt", "kotlin"],
    ["Main.cs", "csharp"],
    ["index.php", "php"],
    ["main.rb", "ruby"],
    ["data.xml", "xml"],
    ["main.c", "c"],
    ["no-extension", "file"],
    ["file.unknown", "file"],
  ])("%s uses the %s asset", (name, type) => {
    expect(fileIconType(name)).toBe(type);
    const svg = readFileSync(
      new URL(`../public${fileIconUrl(name)}`, import.meta.url),
      "utf8",
    );
    expect(svg).toContain("<svg");
    expect(svg).toMatch(/#[a-f\d]{3,6}/i);
    expect(svg).not.toMatch(/<script|https?:\/\/(?!www\.w3\.org)/i);
  });
});
