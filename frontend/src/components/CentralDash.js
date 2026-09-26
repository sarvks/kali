import { motion } from "framer-motion";

// Symmetric bell of base heights (px) — a gentle sound-wave silhouette.
const BARS = [6, 9, 14, 20, 30, 44, 30, 20, 14, 9, 6];

export const CentralDash = ({ onActivate, reducedMotion }) => {
  const handleKey = (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onActivate();
    }
  };

  return (
    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-20 flex flex-col items-center gap-8 px-6 pointer-events-auto">
      <motion.button
        data-testid="central-golden-dash"
        onClick={onActivate}
        onKeyDown={handleKey}
        aria-label="Awaken KALI. Press Enter or space to begin."
        className="group relative flex h-14 items-center justify-center gap-[5px] rounded-full px-4 outline-none focus-visible:ring-2 focus-visible:ring-amber-300/70 focus-visible:ring-offset-4 focus-visible:ring-offset-black"
        initial={{ opacity: 0, scale: 0.85 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 1.4, ease: [0.16, 1, 0.3, 1] }}
        whileHover={{ scale: 1.08 }}
      >
        {BARS.map((h, i) => {
          const dist = Math.abs(i - (BARS.length - 1) / 2);
          return (
            <motion.span
              key={i}
              className="w-[3px] rounded-full bg-gradient-to-b from-amber-200 via-amber-400 to-amber-500"
              style={{
                height: h,
                filter: "drop-shadow(0 0 6px rgba(245,158,11,0.55))",
              }}
              initial={{ scaleY: 0.35, opacity: 0 }}
              animate={
                reducedMotion
                  ? { scaleY: 1, opacity: 0.9 }
                  : {
                      scaleY: [0.5, 1.25, 0.7, 1, 0.5],
                      opacity: [0.6, 1, 0.75, 1, 0.6],
                    }
              }
              transition={
                reducedMotion
                  ? { duration: 1 }
                  : {
                      duration: 1.8 + dist * 0.15,
                      repeat: Infinity,
                      ease: "easeInOut",
                      delay: i * 0.08,
                    }
              }
            />
          );
        })}
      </motion.button>
      <motion.p
        data-testid="activation-trigger"
        className="text-[11px] sm:text-xs uppercase tracking-[0.4em] text-amber-200/50 font-mono-kali"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.2, duration: 1.4 }}
      >
        touch the light to begin
      </motion.p>
    </div>
  );
};
