import { manager } from "../api/manager";

const storageKey = (state: string) => `egis-mcp-oauth:${state}`;

export async function beginConnectorOAuth(resourceId: string) {
  const { authorization_url, state } = await manager.startConnectorOAuth(resourceId);
  sessionStorage.setItem(storageKey(state), JSON.stringify({ resourceId }));
  window.location.assign(authorization_url);
}

export function takeConnectorOAuthRequest(state: string): string | null {
  const key = storageKey(state);
  const pending = sessionStorage.getItem(key);
  sessionStorage.removeItem(key);
  if (!pending) return null;
  const { resourceId } = JSON.parse(pending);
  return typeof resourceId === "string" ? resourceId : null;
}
