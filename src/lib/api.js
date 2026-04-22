const rawApiBaseUrl = import.meta.env.VITE_API_BASE_URL?.trim() || '';

export const API_BASE_URL = rawApiBaseUrl.replace(/\/+$/, '');

export function apiUrl(path) {
  if (!path.startsWith('/')) {
    throw new Error(`API path must start with "/": ${path}`);
  }

  return API_BASE_URL ? `${API_BASE_URL}${path}` : path;
}
