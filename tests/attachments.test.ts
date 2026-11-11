import { beforeEach, describe, expect, it, vi } from "vitest";
const uploadFile = vi.hoisted(() => vi.fn());
vi.mock("../src/api/manager", () => ({ manager: { uploadFile } }));
vi.mock("tdesign-vue-next/es/dialog", () => ({ DialogPlugin: { confirm: vi.fn() } }));
import { useAttachments } from "../src/composables/useAttachments";

describe("session attachments", () => {
  beforeEach(() => uploadFile.mockReset());
  it("uploads on selection and reuses that reference on send", async () => {
    const file = new File(["input"], "资料.txt");
    uploadFile.mockResolvedValue({ path: "资料.txt", area: "uploads" });
    const attachments = useAttachments();
    attachments.add([file]);
    await attachments.ensureUploaded("p1", [file]);
    const text = await attachments.upload("p1", "检查资料");
    expect(uploadFile).toHaveBeenCalledTimes(1);
    expect(text).toContain("- 资料.txt");
    expect(text).not.toContain("uploads/");
    expect(text).toContain("检查资料");
  });
  it("retries failed uploads in the current project", async () => {
    const file = new File(["input"], "资料.txt");
    const attachments = useAttachments();
    uploadFile.mockRejectedValueOnce(new Error("网络中断"));
    await expect(attachments.ensureUploaded("p1", [file])).rejects.toThrow(
      "网络中断",
    );
    uploadFile.mockResolvedValue({ path: "资料.txt", area: "uploads" });
    await attachments.ensureUploaded("p1", [file]);
    expect(uploadFile).toHaveBeenCalledTimes(2);
  });
  it("reuses an upload only inside the same project", async () => {
    const file = new File(["shared"], "项目资料.txt");
    uploadFile.mockResolvedValue({ path: "项目资料.txt", area: "uploads" });
    const attachments = useAttachments();
    await attachments.ensureUploaded("p1", [file]);
    await attachments.ensureUploaded("p1", [file]);
    expect(uploadFile).toHaveBeenCalledTimes(1);
    expect(uploadFile).toHaveBeenCalledWith("p1", file, undefined);
    await attachments.ensureUploaded("p2", [file]);
    expect(uploadFile).toHaveBeenCalledTimes(2);
  });
});
