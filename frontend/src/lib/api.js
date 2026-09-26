const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
export const API = `${BACKEND_URL}/api`;

const TOKEN_KEY = "kali_session_token";

export function getToken() {
  let t = localStorage.getItem(TOKEN_KEY);
  if (!t) {
    t =
      (crypto.randomUUID && crypto.randomUUID()) ||
      `k-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    localStorage.setItem(TOKEN_KEY, t);
  }
  return t;
}

export function resetToken() {
  const t =
    (crypto.randomUUID && crypto.randomUUID()) ||
    `k-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  localStorage.setItem(TOKEN_KEY, t);
  return t;
}

export async function loadSession(token) {
  const res = await fetch(`${API}/session/${token}`);
  if (!res.ok) return [];
  const data = await res.json();
  return data.messages || [];
}

export async function clearSession(token) {
  await fetch(`${API}/session/${token}`, { method: "DELETE" });
}

/**
 * Streams Kali's reply. Calls onDelta(text) for each chunk.
 * Returns a promise resolving when done. Pass an AbortSignal to stop.
 */
export async function streamChat(token, message, { onDelta, onError, signal }) {
  const res = await fetch(`${API}/chat/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token, message }),
    signal,
  });

  if (!res.ok) {
    let msg = "The connection wavered.";
    try {
      const j = await res.json();
      msg = j.detail || msg;
    } catch (e) {}
    onError && onError(msg, res.status);
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split("\n\n");
    buffer = parts.pop();
    for (const part of parts) {
      const line = part.trim();
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      try {
        const evt = JSON.parse(payload);
        if (evt.type === "delta") onDelta && onDelta(evt.content);
        else if (evt.type === "error") onError && onError(evt.message);
      } catch (e) {}
    }
  }
}

/** Split a raw reply into { sanskrit, english, guidance }. */
export function parseReply(raw) {
  const text = (raw || "").trim();
  if (text.startsWith("[GUIDANCE]")) {
    return { guidance: true, english: text.replace("[GUIDANCE]", "").trim(), sanskrit: "" };
  }
  const idx = text.indexOf("///");
  if (idx === -1) {
    return { guidance: false, sanskrit: "", english: text };
  }
  return {
    guidance: false,
    sanskrit: text.slice(0, idx).trim(),
    english: text.slice(idx + 3).trim(),
  };
}
