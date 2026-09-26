import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { KeyRound, Check } from "lucide-react";
import { resetPassphrase } from "../lib/auth";

export const ResetPassphraseModal = ({ open, token, onDone }) => {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const submit = async () => {
    setError("");
    if (password.length < 6) {
      setError("Passphrase must be at least 6 characters.");
      return;
    }
    if (password !== confirm) {
      setError("The two passphrases do not match.");
      return;
    }
    setBusy(true);
    try {
      await resetPassphrase(token, password);
      setDone(true);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/80 backdrop-blur-sm pointer-events-auto"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          data-testid="reset-modal"
        >
          <motion.div
            initial={{ opacity: 0, y: 18, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
            className="max-w-sm w-full rounded-2xl bg-zinc-950/95 border border-amber-500/20 p-8 text-center"
          >
            <p className="font-devanagari text-3xl text-amber-300 mb-1">वेदी</p>
            <p className="text-[10px] uppercase tracking-[0.35em] text-amber-100/60 font-mono-kali mb-6">
              Renew your passphrase
            </p>

            {done ? (
              <div data-testid="reset-success">
                <Check size={28} className="text-amber-400 mx-auto mb-4" />
                <p className="text-sm text-zinc-300 font-light leading-relaxed mb-6">
                  Your passphrase is renewed. Enter your altar with the new one.
                </p>
                <button
                  data-testid="reset-signin-btn"
                  onClick={onDone}
                  className="px-8 py-2.5 rounded-full border border-amber-500/40 text-amber-200 text-xs uppercase tracking-[0.3em] font-mono-kali hover:bg-amber-500/10 transition-colors"
                >
                  Sign in
                </button>
              </div>
            ) : (
              <>
                <KeyRound size={24} className="text-amber-400/70 mx-auto mb-5" />
                <div className="space-y-3 text-left">
                  <input
                    data-testid="reset-password-input"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="New passphrase"
                    className="w-full bg-transparent border border-white/10 focus:border-amber-500/40 rounded-lg px-4 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-600 outline-none transition-colors"
                  />
                  <input
                    data-testid="reset-confirm-input"
                    type="password"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && submit()}
                    placeholder="Confirm passphrase"
                    className="w-full bg-transparent border border-white/10 focus:border-amber-500/40 rounded-lg px-4 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-600 outline-none transition-colors"
                  />
                </div>
                {error && (
                  <p
                    data-testid="reset-error"
                    className="text-xs text-red-400/90 mt-3 font-mono-kali"
                  >
                    {error}
                  </p>
                )}
                <button
                  data-testid="reset-submit-btn"
                  onClick={submit}
                  disabled={busy || !password || !confirm}
                  className="w-full mt-6 py-2.5 rounded-full border border-amber-500/40 text-amber-200 text-xs uppercase tracking-[0.3em] font-mono-kali hover:bg-amber-500/10 transition-colors disabled:opacity-40"
                >
                  {busy ? "…" : "Renew passphrase"}
                </button>
              </>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
