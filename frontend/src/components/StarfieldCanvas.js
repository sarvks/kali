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

export const StarfieldCanvas = ({ reducedMotion, showConstellation }) => {
  const canvasRef = useRef(null);
  const pointer = useRef({ x: 0, y: 0, tx: 0, ty: 0 });
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

      // Orion
      const { ox, oy, size } = orionRegion();
      const pos = (k) => ({
        x: ox + ORION.stars[k].x * size + px,
        y: oy + ORION.stars[k].y * size + py,
      });

      if (showConstellation) {
        ctx.strokeStyle = "rgba(245,158,11,0.28)";
        ctx.lineWidth = 1;
        for (const [a, b] of ORION.lines) {
          const pa = pos(a);
          const pb = pos(b);
          ctx.beginPath();
          ctx.moveTo(pa.x, pa.y);
          ctx.lineTo(pb.x, pb.y);
          ctx.stroke();
        }
      }

      for (const key of Object.keys(ORION.stars)) {
        const st = ORION.stars[key];
        const p = pos(key);
        const r = Math.max(1.3, (3.2 - st.m) * 1.1 + 1.3);
        const tw = reducedMotion ? 0 : Math.sin(t * 0.0015 + st.x * 10) * 0.15;
        // glow
        const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r * 5);
        grad.addColorStop(0, "rgba(255,240,210,0.5)");
        grad.addColorStop(1, "rgba(255,240,210,0)");
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(p.x, p.y, r * 5, 0, Math.PI * 2);
        ctx.fill();
        drawStar(p.x, p.y, r, 0.95 + tw, st.c || "rgba(255,250,240,0.98)");
      }

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
  }, [reducedMotion, showConstellation]);

  return (
    <canvas
      ref={canvasRef}
      data-testid="starfield-canvas"
      className="absolute inset-0 z-0 w-full h-full block"
      aria-hidden="true"
    />
  );
};
