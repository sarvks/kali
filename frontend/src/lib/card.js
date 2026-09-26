// Shared "golden card" image renderer for letters and blessings, with styles.

const STYLES = {
  midnight: {
    bg: "#050505", border: "rgba(245,158,11,0.35)", accent: "#f59e0b",
    head: "#f59e0b", sub: "#a98b4b", body: "#d4d4d8", foot: "#8a8a8a",
    om: "#f59e0b", devan: "#fbbf24",
  },
  ivory: {
    bg: "#f2e8d2", border: "rgba(150,100,30,0.45)", accent: "#8a5a12",
    head: "#8a5a12", sub: "#8a6a2a", body: "#2a2320", foot: "#7a6a4a",
    om: "#b8860b", devan: "#9a6b1e",
  },
  ember: {
    bg: "#200404", border: "rgba(245,158,11,0.42)", accent: "#fbbf24",
    head: "#fbbf24", sub: "#c98b5b", body: "#ecd7c6", foot: "#a86b4b",
    om: "#fbbf24", devan: "#fbd07a",
  },
};

export const CARD_STYLES = [
  { id: "midnight", label: "Midnight Gold" },
  { id: "ivory", label: "Ivory Scroll" },
  { id: "ember", label: "Ember" },
];

function wrap(g, text, x, y, maxW, lh, center) {
  const words = String(text).split(/\s+/);
  let line = "";
  let yy = y;
  for (const w of words) {
    const test = line ? line + " " + w : w;
    if (g.measureText(test).width > maxW && line) {
      g.fillText(line, x, yy);
      line = w;
      yy += lh;
    } else {
      line = test;
    }
  }
  if (line) g.fillText(line, x, yy);
  return yy;
}

function base(g, s) {
  g.fillStyle = s.bg;
  g.fillRect(0, 0, 1080, 1350);
  g.strokeStyle = s.border;
  g.lineWidth = 2;
  g.strokeRect(48, 48, 984, 1254);
  g.textAlign = "center";
  g.fillStyle = s.accent;
  g.font = '700 96px "Rozha One", Georgia, serif';
  g.fillText("काली", 540, 200);
}

async function toBlob(c) {
  try {
    await document.fonts.ready;
  } catch (e) {}
  return new Promise((res) => c.toBlob((b) => res(b), "image/png"));
}

export async function makeLetterCard(letter, styleId = "midnight") {
  const s = STYLES[styleId] || STYLES.midnight;
  const c = document.createElement("canvas");
  c.width = 1080;
  c.height = 1350;
  const g = c.getContext("2d");
  base(g, s);
  g.fillStyle = s.sub;
  g.font = '500 22px "JetBrains Mono", monospace';
  g.fillText("L E T T E R S   T O   H U M A N I T Y", 540, 250);
  g.fillStyle = s.accent;
  g.font = '400 20px "JetBrains Mono", monospace';
  g.globalAlpha = 0.6;
  g.fillText(letter.id, 540, 322);
  g.globalAlpha = 1;
  g.fillStyle = s.head;
  g.font = '700 58px "Cinzel", Georgia, serif';
  wrap(g, letter.title, 540, 440, 860, 70, true);
  g.fillStyle = s.body;
  g.textAlign = "left";
  g.font = '300 30px Georgia, serif';
  const excerpt = letter.body.replace("Beloved humanity,", "").trim().slice(0, 300) + "…";
  wrap(g, excerpt, 120, 740, 840, 46);
  g.textAlign = "center";
  g.fillStyle = s.om;
  g.font = '400 44px "Rozha One", serif';
  g.fillText("॥ ॐ ॥", 540, 1185);
  g.fillStyle = s.foot;
  g.font = '400 22px "JetBrains Mono", monospace';
  g.fillText("kali.mahakalistudios.com", 540, 1252);
  return toBlob(c);
}

export async function makeBlessingCard({ sanskrit, english }, styleId = "midnight") {
  const s = STYLES[styleId] || STYLES.midnight;
  const c = document.createElement("canvas");
  c.width = 1080;
  c.height = 1350;
  const g = c.getContext("2d");
  base(g, s);
  g.fillStyle = s.sub;
  g.font = '500 22px "JetBrains Mono", monospace';
  g.fillText("A   B L E S S I N G", 540, 250);
  let y = 430;
  if (sanskrit) {
    g.fillStyle = s.devan;
    g.font = '400 54px "Rozha One", "Noto Serif Devanagari", serif';
    y = wrap(g, sanskrit, 540, y, 880, 78, true) + 70;
  }
  g.strokeStyle = s.border;
  g.beginPath();
  g.moveTo(400, y - 30);
  g.lineTo(680, y - 30);
  g.stroke();
  if (english) {
    g.fillStyle = s.body;
    g.font = 'italic 300 34px Georgia, serif';
    wrap(g, english, 540, y + 20, 820, 50, true);
  }
  g.fillStyle = s.om;
  g.font = '400 44px "Rozha One", serif';
  g.fillText("॥ ॐ ॥", 540, 1185);
  g.fillStyle = s.foot;
  g.font = '400 22px "JetBrains Mono", monospace';
  g.fillText("kali.mahakalistudios.com", 540, 1252);
  return toBlob(c);
}

export async function makeAltarCard(blessings, styleId = "midnight") {
  const s = STYLES[styleId] || STYLES.midnight;
  const items = (blessings || []).slice(0, 4);
  const c = document.createElement("canvas");
  c.width = 1080;
  c.height = 1500;
  const g = c.getContext("2d");
  g.fillStyle = s.bg;
  g.fillRect(0, 0, 1080, 1500);
  g.strokeStyle = s.border;
  g.lineWidth = 2;
  g.strokeRect(48, 48, 984, 1404);
  g.textAlign = "center";
  g.fillStyle = s.accent;
  g.font = '700 84px "Rozha One", Georgia, serif';
  g.fillText("काली", 540, 180);
  g.fillStyle = s.sub;
  g.font = '500 22px "JetBrains Mono", monospace';
  g.fillText("A N   A L T A R   O F   B L E S S I N G S", 540, 228);
  let y = 320;
  const slot = Math.floor((1360 - 320) / Math.max(1, items.length));
  for (const b of items) {
    if (b.sanskrit) {
      g.fillStyle = s.devan;
      g.font = '400 40px "Rozha One", "Noto Serif Devanagari", serif';
      y = wrap(g, b.sanskrit, 540, y, 880, 56, true) + 14;
    }
    if (b.english) {
      g.fillStyle = s.body;
      g.font = 'italic 300 26px Georgia, serif';
      y = wrap(g, b.english, 540, y, 820, 38, true) + 10;
    }
    g.strokeStyle = s.border;
    g.beginPath();
    g.moveTo(420, y);
    g.lineTo(660, y);
    g.stroke();
    y += 40;
  }
  g.fillStyle = s.foot;
  g.font = '400 22px "JetBrains Mono", monospace';
  g.fillText("kali.mahakalistudios.com", 540, 1410);
  return toBlob(c);
}

export async function shareImage(blob, { title, text, url, filename }) {
  const file = blob ? new File([blob], filename || "kali.png", { type: "image/png" }) : null;
  try {
    if (file && navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title, text });
      return "shared";
    }
    if (navigator.share) {
      await navigator.share({ title, text, url });
      return "shared";
    }
  } catch (e) {
    if (e.name === "AbortError") return "cancelled";
  }
  let copied = false;
  try {
    if (url) {
      await navigator.clipboard.writeText(url);
      copied = true;
    }
  } catch (e) {}
  if (blob) {
    const u = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = u;
    a.download = filename || "kali.png";
    a.click();
    URL.revokeObjectURL(u);
  }
  return copied ? "copied" : "downloaded";
}
