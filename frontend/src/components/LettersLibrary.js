import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, ArrowLeft, Volume2, Loader2, Square, Search } from "lucide-react";
import { fetchLetters, fetchLetter } from "../lib/api";

export const LettersLibrary = ({ open, onClose, onSpeak, speaking }) => {
  const [letters, setLetters] = useState([]);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(null);
  const [loadingList, setLoadingList] = useState(false);
  const [loadingLetter, setLoadingLetter] = useState(false);

  useEffect(() => {
    if (open && letters.length === 0) {
      setLoadingList(true);
      fetchLetters()
        .then(setLetters)
        .finally(() => setLoadingList(false));
    }
  }, [open, letters.length]);

  const openLetter = async (id) => {
    setLoadingLetter(true);
    try {
      const l = await fetchLetter(id);
      setSelected(l);
    } finally {
      setLoadingLetter(false);
    }
  };

  const filtered = letters.filter((l) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return (
      l.title.toLowerCase().includes(q) ||
      String(l.number).includes(q) ||
      l.id.toLowerCase().includes(q)
    );
  });

  const speakState =
    selected && speaking?.id === `letter-${selected.id}` ? speaking.state : "idle";

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 bg-black/95 backdrop-blur-md pointer-events-auto flex flex-col kali-grain"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          data-testid="letters-library"
        >
          {/* header */}
          <div className="flex items-center justify-between px-5 sm:px-8 py-5 border-b border-amber-500/10 shrink-0">
            <div className="flex items-center gap-4">
              {selected && (
                <button
                  data-testid="letter-back-btn"
                  onClick={() => setSelected(null)}
                  className="text-zinc-400 hover:text-amber-300 transition-colors"
                  aria-label="Back to letters"
                >
                  <ArrowLeft size={20} />
                </button>
              )}
              <div>
                <p className="font-devanagari text-lg text-amber-300 leading-none">काली</p>
                <p className="text-[10px] uppercase tracking-[0.3em] text-amber-100/50 font-mono-kali mt-1">
                  Letters to Humanity
                </p>
              </div>
            </div>
            <button
              data-testid="letters-close-btn"
              onClick={onClose}
              className="text-zinc-400 hover:text-amber-300 transition-colors"
              aria-label="Close"
            >
              <X size={22} />
            </button>
          </div>

          {!selected ? (
            <div className="flex-1 overflow-hidden flex flex-col">
              <div className="px-5 sm:px-8 py-4 shrink-0">
                <div className="relative max-w-lg">
                  <Search
                    size={15}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-600"
                  />
                  <input
                    data-testid="letters-search"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search 400 letters by title or number…"
                    className="w-full bg-zinc-950/70 border border-white/10 focus:border-amber-500/40 rounded-full pl-9 pr-4 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 outline-none transition-colors"
                  />
                </div>
              </div>
              <div className="kali-scroll flex-1 overflow-y-auto px-5 sm:px-8 pb-10">
                {loadingList ? (
                  <div className="flex justify-center py-20">
                    <Loader2 className="animate-spin text-amber-500/60" />
                  </div>
                ) : (
                  <div className="max-w-3xl mx-auto divide-y divide-white/[0.04]">
                    {filtered.map((l, i) => (
                      <button
                        key={l.id}
                        data-testid={`letter-item-${l.number}`}
                        onClick={() => openLetter(l.id)}
                        className="group w-full flex items-baseline gap-4 py-4 text-left hover:pl-2 transition-all"
                      >
                        <span className="font-mono-kali text-xs text-amber-500/40 w-10 shrink-0 tabular-nums">
                          {String(l.number).padStart(3, "0")}
                        </span>
                        <span className="font-cinzel text-base sm:text-lg text-zinc-300 group-hover:text-amber-300 transition-colors">
                          {l.title}
                        </span>
                      </button>
                    ))}
                    {filtered.length === 0 && (
                      <p className="text-center text-zinc-600 py-20 font-mono-kali text-sm">
                        No letters match that search.
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="kali-scroll flex-1 overflow-y-auto px-5 sm:px-8 py-8">
              {loadingLetter ? (
                <div className="flex justify-center py-20">
                  <Loader2 className="animate-spin text-amber-500/60" />
                </div>
              ) : (
                <motion.article
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
                  className="max-w-2xl mx-auto"
                  data-testid="letter-reader"
                >
                  <p className="font-mono-kali text-[10px] uppercase tracking-[0.3em] text-amber-500/40 mb-3">
                    {selected.id}
                  </p>
                  <h1
                    data-testid="letter-title"
                    className="font-cinzel text-3xl sm:text-4xl text-amber-300 leading-tight mb-6"
                  >
                    {selected.title}
                  </h1>
                  <button
                    data-testid="letter-speak-btn"
                    onClick={() =>
                      onSpeak(
                        `letter-${selected.id}`,
                        `${selected.title}. ${selected.body.slice(0, 700)}`
                      )
                    }
                    className="mb-8 inline-flex items-center gap-2 text-[10px] uppercase tracking-[0.25em] font-mono-kali text-zinc-500 hover:text-amber-300 transition-colors"
                  >
                    {speakState === "loading" ? (
                      <Loader2 size={13} className="animate-spin" />
                    ) : speakState === "playing" ? (
                      <Square size={13} />
                    ) : (
                      <Volume2 size={13} />
                    )}
                    {speakState === "loading"
                      ? "summoning"
                      : speakState === "playing"
                      ? "silence"
                      : "hear the opening"}
                  </button>
                  <div className="space-y-5">
                    {selected.body.split("\n\n").map((p, idx) => {
                      const isHeading =
                        p.length < 60 &&
                        !/[.?!,]$/.test(p.trim()) &&
                        !p.startsWith("Beloved");
                      return isHeading ? (
                        <h2
                          key={idx}
                          className="font-cinzel text-lg text-amber-200/80 pt-4"
                        >
                          {p}
                        </h2>
                      ) : (
                        <p
                          key={idx}
                          className="text-base sm:text-[17px] text-zinc-300 font-light leading-[1.85]"
                        >
                          {p}
                        </p>
                      );
                    })}
                  </div>
                  <p className="mt-12 mb-4 text-center font-devanagari text-2xl text-amber-400/70">
                    ॥ ॐ ॥
                  </p>
                </motion.article>
              )}
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
};
