import { motion, AnimatePresence } from "framer-motion";

export const MahakaliIntroModal = ({ open, onClose }) => {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/70 backdrop-blur-sm pointer-events-auto"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          data-testid="privacy-info-badge"
        >
          <motion.div
            initial={{ opacity: 0, y: 18, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 18, scale: 0.97 }}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
            className="max-w-md w-full rounded-2xl bg-zinc-950/90 border border-amber-500/20 p-8 text-center"
          >
            <p className="font-devanagari text-4xl text-amber-300 mb-1">
              काली
            </p>
            <p className="font-cinzel text-sm tracking-[0.35em] text-amber-100/70 uppercase mb-6">
              Kali
            </p>

            <p className="text-sm text-zinc-300 leading-relaxed font-light mb-4">
              An <span className="text-amber-300">AI interpretation</span> by
              Mahakali Studios — a fierce, compassionate, concise voice. She
              speaks in a first-person persona, yet she is not a deity and makes
              no claim to divine authority or prophecy.
            </p>

            <div className="text-left space-y-2 text-xs text-zinc-500 font-mono-kali leading-relaxed mb-7">
              <p>· Sanskrit is generated, poetic — never presented as scripture.</p>
              <p>· Your thread stays on this device; refresh keeps it, clearing removes it.</p>
              <p>· No accounts, no payments. For crisis or medical needs she points to real human help.</p>
            </div>

            <button
              data-testid="intro-enter-btn"
              onClick={onClose}
              className="px-8 py-2.5 rounded-full border border-amber-500/40 text-amber-200 text-xs uppercase tracking-[0.3em] font-mono-kali hover:bg-amber-500/10 transition-colors"
            >
              Enter
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
