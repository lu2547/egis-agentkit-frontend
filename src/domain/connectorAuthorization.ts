import { manager } from "../api/manager";

const channelName = "egis-mcp-oauth";
const storageKey = (state: string) => `egis-mcp-oauth:${state}`;
type OAuthRequest = { resourceId: string; authorizationTab?: boolean };

export async function beginConnectorOAuth(resourceId: string) {
  // 必须在点击回调内打开标签页，避免等待接口后被浏览器拦截。
  const tab = window.open("about:blank", "_blank");
  if (!tab) {
    throw new Error("浏览器阻止了授权标签页，请允许本站打开新标签页后重试。");
  }

  try {
    // 新标签页已取得独立的会话存储。跳转第三方前切断对原页的访问。
    tab.opener = null;
    tab.document.title = "连接器授权";
    tab.document.body.textContent = "正在打开授权页面…";
    const { authorization_url, state } =
      await manager.startConnectorOAuth(resourceId);
    if (tab.closed) return;
    tab.sessionStorage.setItem(
      storageKey(state),
      JSON.stringify({ resourceId, authorizationTab: true }),
    );
    sessionStorage.setItem(storageKey(state), JSON.stringify({ resourceId }));
    tab.location.replace(authorization_url);
  } catch (error) {
    tab.close();
    throw error;
  }
}

export function takeConnectorOAuthRequest(state: string): OAuthRequest | null {
  const key = storageKey(state);
  const pending = sessionStorage.getItem(key);
  sessionStorage.removeItem(key);
  if (!pending) return null;
  const request = JSON.parse(pending);
  return typeof request?.resourceId === "string" ? request : null;
}

export function notifyConnectorOAuthResult(state: string, message: string) {
  const channel = new BroadcastChannel(channelName);
  channel.postMessage({ state, message });
  channel.close();
}

export function watchConnectorOAuthResult(onResult: (message: string) => void) {
  const channel = new BroadcastChannel(channelName);
  channel.onmessage = ({ data }) => {
    if (
      typeof data?.state === "string" &&
      typeof data.message === "string" &&
      takeConnectorOAuthRequest(data.state)
    ) {
      onResult(data.message);
    }
  };
  return () => channel.close();
}
