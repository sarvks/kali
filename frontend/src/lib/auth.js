import { API } from "./api";

async function post(path, body) {
  const res = await fetch(`${API}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(formatDetail(data.detail));
  return data;
}

export function formatDetail(detail) {
  if (detail == null) return "Something went wrong. Please try again.";
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail))
    return detail
      .map((e) => (e && typeof e.msg === "string" ? e.msg : JSON.stringify(e)))
      .filter(Boolean)
      .join(" ");
  if (detail && typeof detail.msg === "string") return detail.msg;
  return String(detail);
}

export const authRegister = (email, password, name) =>
  post("/auth/register", { email, password, name });
export const authLogin = (email, password) =>
  post("/auth/login", { email, password });
export const authLogout = () => post("/auth/logout");
export const claimThread = (token) => post("/auth/claim", { token });

export async function authMe() {
  const res = await fetch(`${API}/auth/me`, { credentials: "include" });
  if (!res.ok) return null;
  return res.json();
}

export async function loadAuthThread() {
  const res = await fetch(`${API}/auth/thread`, { credentials: "include" });
  if (!res.ok) return [];
  const data = await res.json();
  return data.messages || [];
}

export async function clearAuthThread() {
  await fetch(`${API}/auth/thread`, {
    method: "DELETE",
    credentials: "include",
  });
}

export async function deleteAccount() {
  await fetch(`${API}/auth/account`, {
    method: "DELETE",
    credentials: "include",
  });
}
