import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, MailPlus } from "lucide-react";

const fmtHour = (h) => {
  const period = h < 12 ? "AM" : "PM";
  const hh = h % 12 === 0 ? 12 : h % 12;
  return `${hh}:00 ${period}`;
};

export const ReminderModal = ({ open, onClose, initialEnabled, initialHour, onSave }) => {
  const [enabled, setEnabled] = useState(!!initialEnabled);
  const [hour, setHour] = useState(initialHour ?? 8);
  const [busy, setBusy] = useState(false);
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";

  const save = async () => {
    setBusy(true);
    try {
      await onSave(enabled, hour, tz);
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[60] flex items-center justify-center p-6 bg-black/75 backdrop-blur-sm pointer-events-auto"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          data-testid="reminder-modal"
        >
          <motion.div
            initial={{ opacity: 0, y: 18, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 18, scale: 0.97 }}
            transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
            className="relative max-w-sm w-full rounded-2xl bg-zinc-950/95 border border-amber-500/20 p-8"
          >
            <button
              data-testid="reminder-close-btn"
              onClick={onClose}
              className="absolute top-4 right-4 text-zinc-500 hover:text-amber-300"
              aria-label="Close"
            >
              <X size={18} />
            </button>
            <MailPlus size={26} className="text-amber-400 mb-4" />
            <p className="font-cinzel text-xl text-amber-300 mb-1">A daily letter</p>
            <p className="text-xs text-zinc-400 font-mono-kali mb-6 leading-relaxed">
              Receive that day's Letter to Humanity in your inbox each morning.
            </p>

            <label className="flex items-center justify-between mb-6 cursor-pointer">
              <span className="text-sm text-zinc-300">Send me a daily letter</span>
              <button
                data-testid="reminder-enable-toggle"
                onClick={() => setEnabled((v) => !v)}
                className={`relative w-11 h-6 rounded-full transition-colors ${
                  enabled ? "bg-amber-500/70" : "bg-white/10"
                }`}
                aria-pressed={enabled}
              >
                <span
                  className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${
                    enabled ? "left-[22px]" : "left-0.5"
                  }`}
                />
              </button>
            </label>

            <div className={enabled ? "opacity-100" : "opacity-40 pointer-events-none"}>
              <p className="text-[10px] uppercase tracking-[0.25em] text-amber-200/50 font-mono-kali mb-2">
                Arrives at
              </p>
              <select
                data-testid="reminder-hour-select"
                value={hour}
                onChange={(e) => setHour(Number(e.target.value))}
                className="w-full bg-zinc-900 border border-white/10 focus:border-amber-500/40 rounded-lg px-4 py-2.5 text-sm text-zinc-100 outline-none"
              >
                {Array.from({ length: 24 }).map((_, h) => (
                  <option key={h} value={h}>
                    {fmtHour(h)}
                  </option>
                ))}
              </select>
              <p className="text-[10px] text-zinc-600 font-mono-kali mt-2">
                Your timezone: {tz}
              </p>
            </div>

            <button
              data-testid="reminder-save-btn"
              onClick={save}
              disabled={busy}
              className="w-full mt-7 py-2.5 rounded-full border border-amber-500/40 text-amber-200 text-xs uppercase tracking-[0.3em] font-mono-kali hover:bg-amber-500/10 transition-colors disabled:opacity-40"
            >
              {busy ? "…" : "Save"}
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
