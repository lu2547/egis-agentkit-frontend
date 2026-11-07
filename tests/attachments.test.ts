import { beforeEach, describe, expect, it, vi } from "vitest";
const uploadFile = vi.hoisted(() => vi.fn());
vi.mock("../src/api/manager", () => ({ manager: { uploadFile } }));
import { useAttachments } from "../src/composables/useAttachments";

describe("session attachments", () => {
  beforeEach(() => uploadFile.mockReset());
  it("uploads on selection and reuses that reference on send", async () => {
    const file = new File(["input"], "资料.txt");
    uploadFile.mockResolvedValue({ path: "资料.txt", area: "uploads" });
    const attachments = useAttachments();
    attachments.add([file]);
    await attachments.ensureUploaded("s1", [file]);
    const text = await attachments.upload("s1", "检查资料");
    expect(uploadFile).toHaveBeenCalledTimes(1);
    expect(text).toContain("- 资料.txt");
    expect(text).not.toContain("uploads/");
    expect(text).toContain("检查资料");
  });
  it("retries failed uploads and never reuses a different session's reference", async () => {
    const file = new File(["input"], "资料.txt");
    const attachments = useAttachments();
    uploadFile.mockRejectedValueOnce(new Error("网络中断"));
    await expect(attachments.ensureUploaded("s1", [file])).rejects.toThrow(
      "网络中断",
    );
    uploadFile.mockResolvedValue({ path: "资料.txt", area: "uploads" });
    await attachments.ensureUploaded("s1", [file]);
    await attachments.ensureUploaded("s2", [file]);
    expect(uploadFile).toHaveBeenCalledTimes(3);
  });
  it("reuses a shared project upload across its conversations", async () => {
    const file = new File(["shared"], "项目资料.txt");
    uploadFile.mockResolvedValue({ path: "项目资料.txt", area: "uploads" });
    const attachments = useAttachments();
    await attachments.ensureUploaded("s1", [file], undefined, "p1");
    await attachments.ensureUploaded("s2", [file], undefined, "p1");
    expect(uploadFile).toHaveBeenCalledTimes(1);
    expect(uploadFile).toHaveBeenCalledWith("s1", file, undefined, "p1");
    await attachments.ensureUploaded("s3", [file], undefined, "p2");
    expect(uploadFile).toHaveBeenCalledTimes(2);
  });
});
