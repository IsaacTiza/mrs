const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

function getToken() {
  return localStorage.getItem('jostum_token');
}

async function request(path, { method = 'GET', body, isFormData = false, full = false } = {}) {
  const headers = {};
  if (!isFormData) headers['Content-Type'] = 'application/json';
  const token = getToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers,
    body: body ? (isFormData ? body : JSON.stringify(body)) : undefined,
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    if (res.status === 401) {
      localStorage.removeItem('jostum_token');
    }
    throw new Error(data.message || `Request failed (${res.status})`);
  }
  // `full` returns the whole body (data + pagination, etc.) instead of
  // just the `data` payload — used by endpoints like /admin/audit-logs
  // that now return pagination metadata alongside the page of results.
  return full ? data : data.data;
}

export const api = {
  get: (path) => request(path),
  // Same as get(), but resolves the whole response body instead of just
  // `.data` — for endpoints that also return e.g. `pagination`.
  getFull: (path) => request(path, { full: true }),
  post: (path, body, opts = {}) => request(path, { method: 'POST', body, ...opts }),
  patch: (path, body) => request(path, { method: 'PATCH', body }),
};

export function setToken(token) {
  localStorage.setItem('jostum_token', token);
}
export function clearToken() {
  localStorage.removeItem('jostum_token');
}
export { getToken };
