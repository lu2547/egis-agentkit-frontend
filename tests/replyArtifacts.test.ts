import { describe, expect, it } from "vitest";
import { groupReplyArtifacts } from "../src/domain/replyArtifacts";

const file = (reply_id: string, path: string) => ({
  reply_id,
  path,
  name: path,
  size: 10,
  modified_at: "",
  is_directory: false,
});

describe("reply artifact ownership", () => {
  it("keeps deliveries on their original reply while the next reply is thinking", () => {
    const old = file("previous-reply", "report.pptx");
    const files = groupReplyArtifacts([old]);
    expect(files["previous-reply"]).toEqual([old]);
    expect(files["new-thinking-reply"]).toBeUndefined();
  });
  it("does not guess a reply for historical project files", () => {
    const files = groupReplyArtifacts([
      file("", "legacy.pptx"),
      file("one", "one.docx"),
      file("two", "two.pptx"),
      { ...file("two", "directory"), is_directory: true },
    ]);
    expect(Object.keys(files)).toEqual(["one", "two"]);
    expect(files.one?.map((f) => f.path)).toEqual(["one.docx"]);
    expect(files.two?.map((f) => f.path)).toEqual(["two.pptx"]);
  });
});
