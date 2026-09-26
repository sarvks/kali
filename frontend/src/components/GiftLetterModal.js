import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { X, Gift, Loader2 } from "lucide-react";
import { giftLetter } from "../lib/api";

export const GiftLetterModal = ({ open, onClose, letter }) => {
  const [toEmail, setToEmail] = useState("");
  const [fromName, setFromName] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const send = async () => {
    if (!toEmail || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(toEmail)) {
      toast.error("A valid friend's email is needed.");
      return;
    }
    setBusy(true);
    try {
      await giftLetter({ letterId: letter.id, toEmail, fromName, note });
      toast("Your letter has taken flight.", { className: "font-mono-kali" });
      setToEmail("");
      setFromName("");
      setNote("");
      onClose();
    } catch (e) {
      toast.error(e.message || "The letter could not be sent.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <AnimatePresence>
      {open && letter && (
        <motion.div
          className="fixed inset-0 z-[70] flex items-center justify-center p-6 bg-black/80 backdrop-blur-sm pointer-events-auto"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          data-testid="gift-letter-modal"
        >
          <motion.div
            initial={{ opacity: 0, y: 18, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 18, scale: 0.97 }}
            transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
            className="relative max-w-sm w-full rounded-2xl bg-zinc-950/95 border border-amber-500/20 p-8"
          >
            <button
              data-testid="gift-close-btn"
              onClick={onClose}
              className="absolute top-4 right-4 text-zinc-500 hover:text-amber-300"
              aria-label="Close"
            >
              <X size={18} />
            </button>
            <Gift size={26} className="text-amber-400 mb-4" />
            <p className="font-cinzel text-xl text-amber-300 mb-1">Gift this letter</p>
            <p className="text-xs text-zinc-400 font-mono-kali mb-6 leading-relaxed">
              Send “{letter.title}” to a friend as a beautiful message from Kali.
            </p>

            <label className="block text-[10px] uppercase tracking-[0.25em] text-amber-200/50 font-mono-kali mb-2">
              Friend's email
            </label>
            <input
              data-testid="gift-email-input"
              type="email"
              value={toEmail}
              onChange={(e) => setToEmail(e.target.value)}
              placeholder="them@example.com"
              className="w-full bg-zinc-900 border border-white/10 focus:border-amber-500/40 rounded-lg px-4 py-2.5 text-sm text-zinc-100 outline-none mb-4"
            />

            <label className="block text-[10px] uppercase tracking-[0.25em] text-amber-200/50 font-mono-kali mb-2">
              Your name <span className="text-zinc-600">(optional)</span>
            </label>
            <input
              data-testid="gift-fromname-input"
              type="text"
              value={fromName}
              onChange={(e) => setFromName(e.target.value)}
              placeholder="A friend"
              className="w-full bg-zinc-900 border border-white/10 focus:border-amber-500/40 rounded-lg px-4 py-2.5 text-sm text-zinc-100 outline-none mb-4"
            />

            <label className="block text-[10px] uppercase tracking-[0.25em] text-amber-200/50 font-mono-kali mb-2">
              A short note <span className="text-zinc-600">(optional)</span>
            </label>
            <textarea
              data-testid="gift-note-input"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              maxLength={500}
              placeholder="Thinking of you…"
              className="w-full bg-zinc-900 border border-white/10 focus:border-amber-500/40 rounded-lg px-4 py-2.5 text-sm text-zinc-100 outline-none resize-none"
            />

            <button
              data-testid="gift-send-btn"
              onClick={send}
              disabled={busy}
              className="w-full mt-6 py-2.5 rounded-full border border-amber-500/40 text-amber-200 text-xs uppercase tracking-[0.3em] font-mono-kali hover:bg-amber-500/10 transition-colors disabled:opacity-40 inline-flex items-center justify-center gap-2"
            >
              {busy ? <Loader2 size={14} className="animate-spin" /> : <Gift size={14} />}
              {busy ? "sending" : "send the letter"}
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
