import Sanscript from "@indic-transliteration/sanscript";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
export const API = `${BACKEND_URL}/api`;

/** Romanize Devanagari into readable IAST for the transliteration line + TTS. */
export function transliterate(devanagari) {
  if (!devanagari) return "";
  try {
    return Sanscript.t(devanagari, "devanagari", "iast");
  } catch (e) {
    return "";
  }
}

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
  const res = await fetch(`${API}/session/${token}`, { credentials: "include" });
  if (!res.ok) return [];
  const data = await res.json();
  return data.messages || [];
}

export async function clearSession(token) {
  await fetch(`${API}/session/${token}`, {
    method: "DELETE",
    credentials: "include",
  });
}

export async function fetchLetters() {
  const res = await fetch(`${API}/letters`);
  if (!res.ok) return [];
  const data = await res.json();
  return data.letters || [];
}

export async function fetchLetter(id) {
  const res = await fetch(`${API}/letters/${id}`);
  if (!res.ok) throw new Error("That letter is not in the archive.");
  return res.json();
}

export async function fetchDailyLetter() {
  const res = await fetch(`${API}/letters/daily`);
  if (!res.ok) return null;
  return res.json();
}

export async function fetchWeeklyDigest(weekday, tz) {
  const qs = new URLSearchParams();
  if (weekday != null) qs.set("weekday", String(weekday));
  if (tz) qs.set("tz", tz);
  const res = await fetch(`${API}/letters/weekly-digest?${qs.toString()}`);
  if (!res.ok) return { letters: [] };
  return res.json();
}

export async function giftLetter({ letterId, toEmail, fromName, note }) {
  const res = await fetch(`${API}/letters/gift`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ letter_id: letterId, to_email: toEmail, from_name: fromName, note }),
  });
  if (!res.ok) {
    let msg = "The letter could not be sent.";
    try {
      const j = await res.json();
      msg = j.detail || msg;
    } catch (e) {}
    throw new Error(msg);
  }
  return res.json();
}

export async function ttsGenerate(text) {
  const res = await fetch(`${API}/tts/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ text }),
  });
  if (!res.ok) {
    let msg = "Her voice could not be summoned.";
    try {
      const j = await res.json();
      msg = j.detail || msg;
    } catch (e) {}
    throw new Error(msg);
  }
  const data = await res.json();
  return data.audio;
}

/**
 * Streams Kali's reply. Calls onDelta(text) for each chunk.
 * Returns a promise resolving when done. Pass an AbortSignal to stop.
 */
export async function streamChat(token, message, { onDelta, onError, signal }) {
  const res = await fetch(`${API}/chat/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
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
