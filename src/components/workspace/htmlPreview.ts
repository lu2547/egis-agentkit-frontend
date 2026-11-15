/** HTML 预览协议：交互文档在独立源沙箱内运行，框选时只回传静态页面快照。 */
import DOMPurify from "dompurify";
import type {
  PreviewOptions,
  PreviewRegion,
} from "../../domain/previewReferences";
import { capturePreview } from "./previewCapture";

const STATIC_POLICY =
  "default-src 'none'; img-src data: blob:; style-src 'unsafe-inline'; font-src data:; form-action 'none'; base-uri 'none'";
const INTERACTIVE_POLICY = `${STATIC_POLICY}; script-src 'unsafe-inline'`;

/** 注入的桥只处理父窗口的快照请求，不持有主应用凭据或访问主应用 DOM。 */
function frameBridge(channel: string) {
  const send = (type: string, payload: Record<string, unknown> = {}) =>
    parent.postMessage({ channel, type, ...payload }, "*");
  let scheduled = false;
  const size = () => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      send("size", {
        width: Math.max(
          document.documentElement.scrollWidth,
          document.body.scrollWidth,
        ),
        height: Math.max(
          document.documentElement.scrollHeight,
          document.body.scrollHeight,
        ),
      });
    });
  };
  window.addEventListener("message", (event) => {
    if (
      event.source !== parent ||
      event.data?.channel !== channel ||
      event.data?.type !== "capture"
    )
      return;
    try {
      const clone = document.documentElement.cloneNode(true) as HTMLElement;
      const originals = document.querySelectorAll("canvas");
      clone.querySelectorAll("canvas").forEach((canvas, index) => {
        const original = originals[index]!;
        const image = document.createElement("img");
        for (const attribute of canvas.attributes)
          image.setAttribute(attribute.name, attribute.value);
        const style = getComputedStyle(original);
        for (const name of style)
          image.style.setProperty(name, style.getPropertyValue(name));
        image.src = original.toDataURL("image/png");
        canvas.replaceWith(image);
      });
      const originalInputs = document.querySelectorAll("input,textarea,select");
      clone.querySelectorAll("input,textarea,select").forEach((node, index) => {
        const original = originalInputs[index] as HTMLInputElement;
        if (node instanceof HTMLTextAreaElement)
          node.textContent = original.value;
        else if (node instanceof HTMLInputElement) {
          node.setAttribute("value", original.value);
          node.toggleAttribute("checked", original.checked);
        } else if (node instanceof HTMLSelectElement)
          Array.from(node.options).forEach((option) =>
            option.toggleAttribute("selected", option.value === original.value),
          );
      });
      clone
        .querySelectorAll("script,iframe,object,embed")
        .forEach((node) => node.remove());
      send("capture", {
        requestId: event.data.requestId,
        html: clone.outerHTML,
        width: document.documentElement.scrollWidth,
        height: document.documentElement.scrollHeight,
      });
    } catch {
      send("capture", {
        requestId: event.data.requestId,
        error: "无法生成 HTML 页面快照",
      });
    }
  });
  window.addEventListener(
    "DOMContentLoaded",
    () => {
      new ResizeObserver(size).observe(document.documentElement);
      new MutationObserver(size).observe(document.body, {
        subtree: true,
        childList: true,
        attributes: true,
        characterData: true,
      });
      size();
    },
    { once: true },
  );
  window.addEventListener("load", size);
}

/** 保留内联样式、画布和交互；禁止嵌套页面、外部脚本及自定义 CSP 绕过。 */
export function interactiveHtml(content: string, channel: string) {
  const doc = new DOMParser().parseFromString(content, "text/html");
  doc
    .querySelectorAll("base,meta,link,iframe,object,embed,script[src]")
    .forEach((node) => node.remove());
  doc
    .querySelectorAll("[href],[action],[formaction],[target]")
    .forEach((node) => {
      for (const name of ["href", "action", "formaction", "target"])
        node.removeAttribute(name);
    });
  const policy = doc.createElement("meta");
  policy.httpEquiv = "Content-Security-Policy";
  policy.content = INTERACTIVE_POLICY;
  const bridge = doc.createElement("script");
  bridge.textContent = `(${frameBridge.toString()})(${JSON.stringify(channel)})`;
  doc.head.prepend(bridge);
  doc.head.prepend(policy);
  return "<!doctype html>" + doc.documentElement.outerHTML;
}

export interface HtmlSnapshot {
  html: string;
  width: number;
  height: number;
}
/** 仅将静态快照放入可读的无脚本文档，复用统一截图与区域文字提取。 */
export async function captureHtmlSnapshot(
  snapshot: HtmlSnapshot,
  regions: PreviewRegion[],
  options: PreviewOptions,
) {
  const frame = document.createElement("iframe");
  frame.setAttribute("sandbox", "allow-same-origin");
  frame.setAttribute("aria-hidden", "true");
  frame.style.cssText = `position:fixed;left:100%;top:0;border:0;width:${snapshot.width}px;height:${snapshot.height}px;pointer-events:none`;
  const clean = DOMPurify.sanitize(snapshot.html, {
    WHOLE_DOCUMENT: true,
    FORBID_TAGS: [
      "script",
      "iframe",
      "object",
      "embed",
      "form",
      "base",
      "meta",
      "link",
    ],
    FORBID_ATTR: ["href", "action", "formaction", "srcset"],
  });
  const wrapper = document.createElement("div");
  wrapper.append(frame);
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const loaded = new Promise<void>((resolve, reject) => {
      frame.onload = () => resolve();
      timer = setTimeout(
        () => reject(new Error("HTML 快照加载超时")),
        options.captureTimeoutMs,
      );
    });
    frame.srcdoc = `<meta http-equiv="Content-Security-Policy" content="${STATIC_POLICY}">${clean}`;
    document.body.append(wrapper);
    await loaded;
    const images = Array.from(frame.contentDocument?.images || []);
    await Promise.all(images.map((image) => image.decode().catch(() => {})));
    return await capturePreview(wrapper, regions, options);
  } finally {
    clearTimeout(timer);
    wrapper.remove();
  }
}
