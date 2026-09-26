import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, MailCheck } from "lucide-react";
import { authLogin, authRegister, forgotPassphrase } from "../lib/auth";

export const AuthModal = ({ open, onClose, onAuthed }) => {
  const [mode, setMode] = useState("login"); // login | register | forgot
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  const reset = (m) => {
    setMode(m);
    setError("");
    setSent(false);
  };

  const submit = async () => {
    setError("");
    setBusy(true);
    try {
      if (mode === "forgot") {
        await forgotPassphrase(email.trim());
        setSent(true);
      } else {
        const user =
          mode === "login"
            ? await authLogin(email.trim(), password)
            : await authRegister(email.trim(), password, name.trim());
        onAuthed(user);
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const submitLabel =
    mode === "login"
      ? "Enter the altar"
      : mode === "register"
      ? "Light the altar"
      : "Send the light";

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/75 backdrop-blur-sm pointer-events-auto"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          data-testid="auth-modal"
        >
          <motion.div
            initial={{ opacity: 0, y: 18, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 18, scale: 0.97 }}
            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
            className="relative max-w-sm w-full rounded-2xl bg-zinc-950/95 border border-amber-500/20 p-8"
          >
            <button
              data-testid="auth-close-btn"
              onClick={onClose}
              className="absolute top-4 right-4 text-zinc-500 hover:text-amber-300"
              aria-label="Close"
            >
              <X size={18} />
            </button>

            <p className="font-devanagari text-3xl text-amber-300 text-center mb-1">
              वेदी
            </p>
            <p className="text-center text-[10px] uppercase tracking-[0.35em] text-amber-100/60 font-mono-kali mb-6">
              The Saved Altar
            </p>

            {sent ? (
              <div className="text-center py-4" data-testid="forgot-sent">
                <MailCheck size={28} className="text-amber-400 mx-auto mb-4" />
                <p className="text-sm text-zinc-300 font-light leading-relaxed mb-6">
                  If an altar exists for{" "}
                  <span className="text-amber-300">{email.trim()}</span>, a link
                  to renew your passphrase is on its way. It fades in 30 minutes.
                </p>
                <button
                  data-testid="forgot-back-btn"
                  onClick={() => reset("login")}
                  className="px-8 py-2.5 rounded-full border border-amber-500/40 text-amber-200 text-xs uppercase tracking-[0.3em] font-mono-kali hover:bg-amber-500/10 transition-colors"
                >
                  Back
                </button>
              </div>
            ) : (
              <>
                {mode !== "forgot" && (
                  <div className="flex gap-1 mb-6 p-1 rounded-full bg-white/5">
                    {["login", "register"].map((m) => (
                      <button
                        key={m}
                        data-testid={`auth-tab-${m}`}
                        onClick={() => reset(m)}
                        className={`flex-1 py-1.5 rounded-full text-[10px] uppercase tracking-[0.2em] font-mono-kali transition-colors ${
                          mode === m
                            ? "bg-amber-500/20 text-amber-200"
                            : "text-zinc-500 hover:text-amber-300"
                        }`}
                      >
                        {m === "login" ? "Enter" : "Consecrate"}
                      </button>
                    ))}
                  </div>
                )}

                {mode === "forgot" && (
                  <p className="text-xs text-zinc-400 font-mono-kali text-center mb-5 leading-relaxed">
                    Enter your email and we will send a link to set a new passphrase.
                  </p>
                )}

                <div className="space-y-3">
                  {mode === "register" && (
                    <input
                      data-testid="auth-name-input"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Name (optional)"
                      className="w-full bg-transparent border border-white/10 focus:border-amber-500/40 rounded-lg px-4 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-600 outline-none transition-colors"
                    />
                  )}
                  <input
                    data-testid="auth-email-input"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    onKeyDown={(e) => mode === "forgot" && e.key === "Enter" && submit()}
                    placeholder="Email"
                    className="w-full bg-transparent border border-white/10 focus:border-amber-500/40 rounded-lg px-4 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-600 outline-none transition-colors"
                  />
                  {mode !== "forgot" && (
                    <input
                      data-testid="auth-password-input"
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && submit()}
                      placeholder="Passphrase"
                      className="w-full bg-transparent border border-white/10 focus:border-amber-500/40 rounded-lg px-4 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-600 outline-none transition-colors"
                    />
                  )}
                </div>

                {mode === "login" && (
                  <button
                    data-testid="auth-forgot-link"
                    onClick={() => reset("forgot")}
                    className="mt-3 text-[10px] uppercase tracking-[0.2em] font-mono-kali text-zinc-500 hover:text-amber-300 transition-colors"
                  >
                    Forgot passphrase?
                  </button>
                )}

                {error && (
                  <p
                    data-testid="auth-error"
                    className="text-xs text-red-400/90 mt-3 text-center font-mono-kali"
                  >
                    {error}
                  </p>
                )}

                <button
                  data-testid="auth-submit-btn"
                  onClick={submit}
                  disabled={busy || !email || (mode !== "forgot" && !password)}
                  className="w-full mt-6 py-2.5 rounded-full border border-amber-500/40 text-amber-200 text-xs uppercase tracking-[0.3em] font-mono-kali hover:bg-amber-500/10 transition-colors disabled:opacity-40"
                >
                  {busy ? "…" : submitLabel}
                </button>

                {mode === "forgot" ? (
                  <button
                    data-testid="forgot-cancel-btn"
                    onClick={() => reset("login")}
                    className="w-full mt-3 text-[10px] uppercase tracking-[0.2em] font-mono-kali text-zinc-600 hover:text-amber-300 transition-colors"
                  >
                    Back to sign in
                  </button>
                ) : (
                  <p className="text-center text-[10px] text-zinc-600 font-mono-kali mt-4 leading-relaxed">
                    Optional. Your thread is saved so you can return to it on any device.
                  </p>
                )}
              </>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
