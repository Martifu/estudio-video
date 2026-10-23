// Thin fetch wrapper: the session token (injected into the page by the server) goes on every call.
const token = document.querySelector('meta[name="studio-token"]').content;

export async function api(method, path, body) {
  const res = await fetch(path, {
    method,
    headers: { "X-Studio-Token": token, ...(body !== undefined ? { "Content-Type": "application/json" } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined
  });
  let data = null;
  try { data = await res.json(); } catch { /* empty body */ }
  if (!res.ok) throw Object.assign(new Error(data?.error ?? res.statusText), { status: res.status, data });
  return data;
}
export const get = (p) => api("GET", p);
