const storageKey = "egis_access_token";
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export function getToken() {
  return sessionStorage.getItem(storageKey);
}
export function setToken(token: string | null) {
  token
    ? sessionStorage.setItem(storageKey, token)
    : sessionStorage.removeItem(storageKey);
}
export function apiUrl(
  path: string,
  params?: Record<string, string | number | undefined | null>,
) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params || {}))
    if (value != null) query.set(key, String(value));
  return `/api${path}${query.size ? `?${query}` : ""}`;
}
export async function requestRaw(
  path: string,
  init: RequestInit = {},
  params?: Record<string, string | number | undefined | null>,
) {
  const headers = new Headers(init.headers);
  const token = getToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const response = await fetch(apiUrl(path, params), { ...init, headers });
  if (!response.ok) {
    let detail = `${response.status} ${response.statusText}`;
    try {
      const error = await response.json();
      detail =
        typeof error.detail === "string"
          ? error.detail
          : JSON.stringify(error.detail || error);
    } catch {
      /* preserve status */
    }
    if (response.status === 401) {
      setToken(null);
      window.dispatchEvent(new Event("egis:unauthorized"));
    }
    throw new ApiError(response.status, detail);
  }
  return response;
}
export async function http<T>(
  path: string,
  init: RequestInit = {},
  params?: Record<string, string | number | undefined | null>,
): Promise<T> {
  const response = await requestRaw(path, init, params);
  return response.status === 204 ? (undefined as T) : response.json();
}
export const json = (method: string, body?: unknown): RequestInit => ({
  method,
  headers: { "Content-Type": "application/json" },
  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
});
export function errorText(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
