import { motion } from "framer-motion";

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
        className={`relative h-[3px] w-24 sm:w-28 rounded-full bg-amber-400 outline-none focus-visible:ring-2 focus-visible:ring-amber-300/70 focus-visible:ring-offset-4 focus-visible:ring-offset-black ${
          reducedMotion ? "" : "dash-breathe"
        }`}
        initial={{ opacity: 0, scaleX: 0.3 }}
        animate={{ opacity: 1, scaleX: 1 }}
        transition={{ duration: 1.6, ease: [0.16, 1, 0.3, 1] }}
        whileHover={{ scaleX: 1.15 }}
      />
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
