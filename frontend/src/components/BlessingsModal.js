import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Share2, Trash2, Loader2 } from "lucide-react";
import { getBlessings, deleteBlessing } from "../lib/auth";
import { makeBlessingCard, shareImage, CARD_STYLES } from "../lib/card";

export const BlessingsModal = ({ open, onClose }) => {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [shareFor, setShareFor] = useState(null);

  const load = () => {
    setLoading(true);
    getBlessings().then(setItems).finally(() => setLoading(false));
  };

  useEffect(() => {
    if (open) load();
  }, [open]);

  const remove = async (id) => {
    await deleteBlessing(id);
    setItems((xs) => xs.filter((x) => x.id !== id));
  };

  const share = async (b, styleId) => {
    const blob = await makeBlessingCard({ sanskrit: b.sanskrit, english: b.english }, styleId);
    await shareImage(blob, {
      title: "A blessing from Kali",
      text: b.english || "A blessing from Kali",
      url: window.location.origin,
      filename: "kali-blessing.png",
    });
    setShareFor(null);
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[60] bg-black/95 backdrop-blur-md pointer-events-auto flex flex-col kali-grain"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          data-testid="blessings-modal"
        >
          <div className="flex items-center justify-between px-5 sm:px-8 py-5 border-b border-amber-500/10 shrink-0">
            <div>
              <p className="font-devanagari text-lg text-amber-300 leading-none">आशीः</p>
              <p className="text-[10px] uppercase tracking-[0.3em] text-amber-100/50 font-mono-kali mt-1">
                Your Blessings
              </p>
            </div>
            <button
              data-testid="blessings-close-btn"
              onClick={onClose}
              className="text-zinc-400 hover:text-amber-300 transition-colors"
              aria-label="Close"
            >
              <X size={22} />
            </button>
          </div>

          <div className="kali-scroll flex-1 overflow-y-auto px-5 sm:px-8 py-8">
            {loading ? (
              <div className="flex justify-center py-20">
                <Loader2 className="animate-spin text-amber-500/60" />
              </div>
            ) : items.length === 0 ? (
              <p className="text-center text-zinc-600 py-20 font-mono-kali text-sm">
                No blessings kept yet. Tap "keep" beneath any verse Kali gives you.
              </p>
            ) : (
              <div className="max-w-2xl mx-auto space-y-8">
                {items.map((b) => (
                  <div
                    key={b.id}
                    data-testid="blessing-item"
                    className="rounded-2xl border border-amber-500/12 bg-zinc-950/50 p-6 text-center"
                  >
                    {b.sanskrit && (
                      <p className="font-devanagari text-2xl text-amber-400 leading-relaxed whitespace-pre-wrap drop-shadow-[0_0_12px_rgba(245,158,11,0.25)]">
                        {b.sanskrit}
                      </p>
                    )}
                    {b.sanskrit && b.english && (
                      <div className="mx-auto my-4 h-px w-32 bg-gradient-to-r from-transparent via-amber-500/40 to-transparent" />
                    )}
                    {b.english && (
                      <p className="text-base text-zinc-300 font-light leading-relaxed whitespace-pre-wrap">
                        {b.english}
                      </p>
                    )}
                    <div className="mt-5 flex items-center justify-center gap-6 relative">
                      <button
                        data-testid="blessing-share-btn"
                        onClick={() => setShareFor(shareFor === b.id ? null : b.id)}
                        className="inline-flex items-center gap-2 text-[10px] uppercase tracking-[0.25em] font-mono-kali text-zinc-500 hover:text-amber-300 transition-colors"
                      >
                        <Share2 size={13} /> share
                      </button>
                      <button
                        data-testid="blessing-delete-btn"
                        onClick={() => remove(b.id)}
                        className="inline-flex items-center gap-2 text-[10px] uppercase tracking-[0.25em] font-mono-kali text-zinc-500 hover:text-red-400 transition-colors"
                      >
                        <Trash2 size={13} /> remove
                      </button>
                      {shareFor === b.id && (
                        <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 w-44 rounded-xl bg-zinc-950/95 border border-amber-500/20 py-2 shadow-2xl shadow-black z-10">
                          <p className="px-4 py-1 text-[9px] uppercase tracking-[0.25em] text-amber-200/40 font-mono-kali">
                            Card style
                          </p>
                          {CARD_STYLES.map((st) => (
                            <button
                              key={st.id}
                              onClick={() => share(b, st.id)}
                              className="block w-full text-left px-4 py-2 text-xs font-mono-kali text-zinc-300 hover:text-amber-300 hover:bg-amber-500/5 transition-colors"
                            >
                              {st.label}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
