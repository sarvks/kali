import { useEffect, useRef } from "react";

// Orion, normalized coordinates within the constellation region (y grows downward).
const ORION = {
  stars: {
    meissa: { x: 0.5, y: 0.12, m: 3.4, name: "Meissa" },
    betelgeuse: { x: 0.38, y: 0.3, m: 0.5, name: "Betelgeuse", c: "#ffb27a" },
    bellatrix: { x: 0.63, y: 0.27, m: 1.6, name: "Bellatrix", c: "#cfe3ff" },
    alnitak: { x: 0.44, y: 0.52, m: 1.7, name: "Alnitak" },
    alnilam: { x: 0.5, y: 0.53, m: 1.6, name: "Alnilam" },
    mintaka: { x: 0.56, y: 0.54, m: 2.2, name: "Mintaka" },
    saiph: { x: 0.42, y: 0.78, m: 2.0, name: "Saiph" },
    rigel: { x: 0.64, y: 0.8, m: 0.1, name: "Rigel", c: "#cfe3ff" },
  },
  lines: [
    ["meissa", "betelgeuse"],
    ["meissa", "bellatrix"],
    ["betelgeuse", "bellatrix"],
    ["betelgeuse", "alnitak"],
    ["bellatrix", "mintaka"],
    ["alnitak", "alnilam"],
    ["alnilam", "mintaka"],
    ["alnitak", "saiph"],
    ["mintaka", "rigel"],
    ["saiph", "rigel"],
  ],
};

function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ORION_LORE = {
  meissa: { name: "Meissa", lore: "The head of the hunter — a faint double star, a mind only half-revealed." },
  betelgeuse: { name: "Betelgeuse", lore: "A red supergiant near its death — vast, trembling, already saying farewell." },
  bellatrix: { name: "Bellatrix", lore: "The Amazon star — hot, blue, and fierce, the warrior's left shoulder." },
  alnitak: { name: "Alnitak", lore: "Eastern jewel of the belt, beside the flaming Horsehead nebula." },
  alnilam: { name: "Alnilam", lore: "The central belt star — a string of pearls, blazing across great distance." },
  mintaka: { name: "Mintaka", lore: "The belt's girdle, sitting almost exactly on the celestial equator." },
  saiph: { name: "Saiph", lore: "The hunter's right knee — hot and blue, yet quiet in our sky." },
  rigel: { name: "Rigel", lore: "The hunter's foot — the brightest of Orion, a blue-white beacon." },
};

export const StarfieldCanvas = ({ reducedMotion, showConstellation, onStarSelect }) => {
  const canvasRef = useRef(null);
  const pointer = useRef({ x: 0, y: 0, tx: 0, ty: 0 });
  const positions = useRef({});
  const raf = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    let w, h, dpr, bgStars;

    const buildStars = () => {
      const rand = mulberry32(20260601);
      const count = Math.min(520, Math.floor((w * h) / 4200));
      const arr = [];
      for (let i = 0; i < count; i++) {
        arr.push({
          x: rand(),
          y: rand(),
          r: rand() * 1.1 + 0.25,
          base: rand() * 0.5 + 0.25,
          tw: rand() * Math.PI * 2,
          sp: rand() * 0.9 + 0.3,
        });
      }
      bgStars = arr;
    };

    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = canvas.clientWidth;
      h = canvas.clientHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      buildStars();
    };

    // Orion region: centered, sized to viewport
    const orionRegion = () => {
      const size = Math.min(w, h) * 0.62;
      return {
        ox: w / 2 - size / 2,
        oy: h / 2 - size * 0.62,
        size,
      };
    };

    const drawStar = (px, py, r, alpha, color) => {
      ctx.beginPath();
      ctx.fillStyle = color || `rgba(255,255,255,${alpha})`;
      ctx.arc(px, py, r, 0, Math.PI * 2);
      ctx.fill();
    };

    let meteor = null;
    let nextMeteorAt = 2200;

    const drawMeteor = (t) => {
      if (reducedMotion) return;
      if (!meteor && t > nextMeteorAt) {
        const ang = Math.PI * (0.13 + Math.random() * 0.22);
        const speed = 11 + Math.random() * 9;
        meteor = {
          x: w * (0.08 + Math.random() * 0.7),
          y: h * (0.03 + Math.random() * 0.22),
          vx: Math.cos(ang) * speed,
          vy: Math.sin(ang) * speed,
          life: 0,
          max: 55 + Math.random() * 35,
        };
      }
      if (!meteor) return;
      meteor.x += meteor.vx;
      meteor.y += meteor.vy;
      meteor.life += 1;
      const fade = Math.max(0, 1 - meteor.life / meteor.max);
      const tailX = meteor.x - meteor.vx * 7;
      const tailY = meteor.y - meteor.vy * 7;
      const grad = ctx.createLinearGradient(meteor.x, meteor.y, tailX, tailY);
      grad.addColorStop(0, `rgba(255,244,214,${0.9 * fade})`);
      grad.addColorStop(1, "rgba(255,244,214,0)");
      ctx.strokeStyle = grad;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(meteor.x, meteor.y);
      ctx.lineTo(tailX, tailY);
      ctx.stroke();
      ctx.fillStyle = `rgba(255,252,244,${fade})`;
      ctx.beginPath();
      ctx.arc(meteor.x, meteor.y, 1.7, 0, Math.PI * 2);
      ctx.fill();
      if (meteor.life > meteor.max || meteor.x > w + 60 || meteor.y > h + 60) {
        meteor = null;
        nextMeteorAt = t + 4000 + Math.random() * 8000;
      }
    };

    const render = (t) => {
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = "#000000";
      ctx.fillRect(0, 0, w, h);

      // parallax easing
      pointer.current.x += (pointer.current.tx - pointer.current.x) * 0.05;
      pointer.current.y += (pointer.current.ty - pointer.current.y) * 0.05;
      const px = pointer.current.x * 14;
      const py = pointer.current.y * 14;

      // background stars
      for (const s of bgStars) {
        const flick = reducedMotion
          ? s.base
          : s.base + Math.sin(t * 0.001 * s.sp + s.tw) * 0.28;
        const a = Math.max(0.05, Math.min(1, flick));
        drawStar(s.x * w + px * 0.4, s.y * h + py * 0.4, s.r, a);
      }

      drawMeteor(t);

      if (!reducedMotion) raf.current = requestAnimationFrame(render);
    };

    resize();
    window.addEventListener("resize", resize);

    const onMove = (e) => {
      const cx = (e.clientX / w) * 2 - 1;
      const cy = (e.clientY / h) * 2 - 1;
      pointer.current.tx = cx;
      pointer.current.ty = cy;
    };
    if (!reducedMotion) window.addEventListener("mousemove", onMove);

    if (reducedMotion) {
      render(0);
    } else {
      raf.current = requestAnimationFrame(render);
    }

    return () => {
      window.removeEventListener("resize", resize);
      window.removeEventListener("mousemove", onMove);
      if (raf.current) cancelAnimationFrame(raf.current);
    };
  }, [reducedMotion, showConstellation, onStarSelect]);

  return (
    <canvas
      ref={canvasRef}
      data-testid="starfield-canvas"
      className="absolute inset-0 z-0 w-full h-full block"
      aria-hidden="true"
    />
  );
};
