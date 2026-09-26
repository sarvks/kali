import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import {
  X,
  ArrowLeft,
  Volume2,
  Loader2,
  Square,
  Search,
  Bookmark,
  BookmarkCheck,
  Sparkles,
  Sun,
  PlayCircle,
  Share2,
  Wand2,
  Flame,
} from "lucide-react";
import { fetchLetters, fetchLetter, fetchDailyLetter, ttsGenerate } from "../lib/api";
import { makeLetterCard, shareImage, CARD_STYLES } from "../lib/card";

function chunkText(text, size = 620) {
  const paras = text.split("\n\n");
  const chunks = [];
  let cur = "";
  const pushLong = () => {
    while (cur.length > size) {
      let cut = cur.lastIndexOf(". ", size);
      if (cut < 200) cut = size;
      chunks.push(cur.slice(0, cut + 1).trim());
      cur = cur.slice(cut + 1);
    }
  };
  for (const p of paras) {
    if (cur && (cur + " " + p).length > size) {
      chunks.push(cur.trim());
      cur = p;
    } else {
      cur = cur ? cur + "\n\n" + p : p;
    }
    pushLong();
  }
  if (cur.trim()) chunks.push(cur.trim());
  return chunks;
}

export const LettersLibrary = ({
  open,
  onClose,
  user,
  savedIds = [],
  onToggleSave,
  onSignInPrompt,
  onLetterToVerse,
  onVerseFromSaved,
  onProgress,
  stopExternal,
  autoOpenId,
  onConsumedAutoOpen,
}) => {
  const [letters, setLetters] = useState([]);
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState("all"); // all | saved
  const [selected, setSelected] = useState(null);
  const [loadingList, setLoadingList] = useState(false);
  const [loadingLetter, setLoadingLetter] = useState(false);
  const [player, setPlayer] = useState({ state: "idle", mode: null, index: 0, total: 0 });
  const [shareOpen, setShareOpen] = useState(false);
  const [streak, setStreak] = useState(() => {
    try {
      const s = JSON.parse(localStorage.getItem("kali_streak") || "null");
      return s ? s.count : 0;
    } catch (e) {
      return 0;
    }
  });

  const bumpStreak = () => {
    const today = new Date().toDateString();
    let s = null;
    try {
      s = JSON.parse(localStorage.getItem("kali_streak") || "null");
    } catch (e) {}
    if (!s) {
      s = { count: 1, last: today };
    } else if (s.last === today) {
      // already counted today
    } else {
      const y = new Date();
      y.setDate(y.getDate() - 1);
      s = s.last === y.toDateString()
        ? { count: s.count + 1, last: today }
        : { count: 1, last: today };
    }
    localStorage.setItem("kali_streak", JSON.stringify(s));
    setStreak(s.count);
  };

  const audioRef = useRef(null);
  const cancelRef = useRef(false);
  const readerRef = useRef(null);
  const scrollTimer = useRef(null);

  const saveProgress = () => {
    const el = readerRef.current;
    if (!el || !selected) return;
    const rec = { id: selected.id, title: selected.title, top: el.scrollTop };
    try {
      localStorage.setItem("kali_reading", JSON.stringify(rec));
    } catch (e) {}
    onProgress && onProgress(rec);
  };

  const onReaderScroll = () => {
    if (scrollTimer.current) return;
    scrollTimer.current = setTimeout(() => {
      scrollTimer.current = null;
      saveProgress();
    }, 400);
  };

  useEffect(() => {
    if (open && letters.length === 0) {
      setLoadingList(true);
      fetchLetters().then(setLetters).finally(() => setLoadingList(false));
    }
  }, [open, letters.length]);

  const openLetter = async (id) => {
    stopAudio();
    setShareOpen(false);
    bumpStreak();
    setLoadingLetter(true);
    try {
      const l = await fetchLetter(id);
      setSelected(l);
    } finally {
      setLoadingLetter(false);
    }
  };

  // auto-open (e.g. Today's Letter)
  useEffect(() => {
    if (open && autoOpenId) {
      openLetter(autoOpenId);
      onConsumedAutoOpen && onConsumedAutoOpen();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, autoOpenId]);

  const stopAudio = () => {
    cancelRef.current = true;
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    setPlayer({ state: "idle", mode: null, index: 0, total: 0 });
  };

  useEffect(() => {
    if (!open) stopAudio();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // restore scroll position when reopening a letter you were reading
  useEffect(() => {
    if (!selected || loadingLetter) return;
    let saved = null;
    try {
      saved = JSON.parse(localStorage.getItem("kali_reading") || "null");
    } catch (e) {}
    if (saved && saved.id === selected.id && readerRef.current) {
      requestAnimationFrame(() => {
        if (readerRef.current) readerRef.current.scrollTop = saved.top;
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, loadingLetter]);

  const shareLetter = async (letter, styleId) => {
    const link = `${window.location.origin}/?letter=${letter.id}`;
    let blob = null;
    try {
      blob = await makeLetterCard(letter, styleId);
    } catch (e) {}
    const result = await shareImage(blob, {
      title: letter.title,
      text: `A letter from Kali — ${letter.title}`,
      url: link,
      filename: `${letter.id}.png`,
    });
    if (result === "copied") toast("Link copied · card saved.", { className: "font-mono-kali" });
    else if (result === "downloaded") toast("Card image saved.", { className: "font-mono-kali" });
    setShareOpen(false);
  };

  const playSequence = async (chunks, mode) => {
    stopExternal && stopExternal();
    stopAudio();
    cancelRef.current = false;
    for (let i = 0; i < chunks.length; i++) {
      if (cancelRef.current) return;
      setPlayer({ state: "loading", mode, index: i, total: chunks.length });
      let url;
      try {
        url = await ttsGenerate(chunks[i]);
      } catch (e) {
        toast.error(e.message || "Her voice could not be summoned.");
        stopAudio();
        return;
      }
      if (cancelRef.current) return;
      await new Promise((resolve) => {
        const a = new Audio(url);
        audioRef.current = a;
        a.onended = resolve;
        a.onerror = resolve;
        setPlayer({ state: "playing", mode, index: i, total: chunks.length });
        a.play().catch(resolve);
      });
    }
    if (!cancelRef.current) setPlayer({ state: "idle", mode: null, index: 0, total: 0 });
  };

  const playOpening = () => {
    if (player.mode === "opening") return stopAudio();
    playSequence([`${selected.title}. ${selected.body.slice(0, 700)}`], "opening");
  };

  const playFull = () => {
    if (player.mode === "full") return stopAudio();
    playSequence(chunkText(`${selected.title}.\n\n${selected.body}`), "full");
  };

  const openDaily = async () => {
    const d = await fetchDailyLetter();
    if (d) openLetter(d.id);
  };

  const handleBookmark = () => {
    if (!user) {
      toast("Sign in to keep this letter on your altar.", { className: "font-mono-kali" });
      onSignInPrompt && onSignInPrompt();
      return;
    }
    onToggleSave && onToggleSave(selected.id, savedIds.includes(selected.id));
  };

  const savedSet = new Set(savedIds);
  const base = tab === "saved" ? letters.filter((l) => savedSet.has(l.id)) : letters;
  const filtered = base.filter((l) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return (
      l.title.toLowerCase().includes(q) ||
      String(l.number).includes(q) ||
      l.id.toLowerCase().includes(q)
    );
  });

  const isSaved = selected && savedSet.has(selected.id);

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
          <div className="flex items-center justify-between px-5 sm:px-8 py-5 border-b border-amber-500/10 shrink-0">
            <div className="flex items-center gap-4">
              {selected && (
                <button
                  data-testid="letter-back-btn"
                  onClick={() => {
                    stopAudio();
                    setSelected(null);
                  }}
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
            <div className="flex items-center gap-3">
              {streak > 0 && (
                <span
                  data-testid="reading-streak"
                  className="hidden sm:inline-flex items-center gap-1.5 text-[10px] uppercase tracking-[0.2em] font-mono-kali text-amber-300/70"
                  title="Days you've read a letter"
                >
                  <Flame size={13} className="text-amber-400" /> {streak}-day streak
                </span>
              )}
              <button
                data-testid="daily-letter-btn"
                onClick={openDaily}
                className="hidden sm:inline-flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] font-mono-kali text-amber-200/70 hover:text-amber-300 border border-amber-500/20 hover:border-amber-500/40 rounded-full px-3 py-1.5 transition-colors"
              >
                <Sun size={13} /> Today's Letter
              </button>
              <button
                data-testid="letters-close-btn"
                onClick={onClose}
                className="text-zinc-400 hover:text-amber-300 transition-colors"
                aria-label="Close"
              >
                <X size={22} />
              </button>
            </div>
          </div>

          {!selected ? (
            <div className="flex-1 overflow-hidden flex flex-col">
              <div className="px-5 sm:px-8 py-4 shrink-0 flex flex-col sm:flex-row sm:items-center gap-3">
                <div className="relative flex-1 max-w-lg">
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
                <div className="flex gap-1 p-1 rounded-full bg-white/5 w-fit">
                  {["all", "saved"].map((t) => (
                    <button
                      key={t}
                      data-testid={`letters-tab-${t}`}
                      onClick={() => setTab(t)}
                      className={`px-4 py-1.5 rounded-full text-[10px] uppercase tracking-[0.2em] font-mono-kali transition-colors ${
                        tab === t
                          ? "bg-amber-500/20 text-amber-200"
                          : "text-zinc-500 hover:text-amber-300"
                      }`}
                    >
                      {t === "all" ? "All" : "Saved"}
                    </button>
                  ))}
                </div>
                <button
                  data-testid="daily-letter-btn-mobile"
                  onClick={openDaily}
                  className="sm:hidden inline-flex items-center justify-center gap-2 text-[10px] uppercase tracking-[0.2em] font-mono-kali text-amber-200/70 border border-amber-500/20 rounded-full px-3 py-2 transition-colors"
                >
                  <Sun size={13} /> Today's Letter
                </button>
              </div>
              <div className="kali-scroll flex-1 overflow-y-auto px-5 sm:px-8 pb-10">
                {loadingList ? (
                  <div className="flex justify-center py-20">
                    <Loader2 className="animate-spin text-amber-500/60" />
                  </div>
                ) : (
                  <div className="max-w-3xl mx-auto">
                    {tab === "saved" && user && filtered.length > 0 && (
                      <button
                        data-testid="verse-from-saved-btn"
                        onClick={() =>
                          onVerseFromSaved &&
                          onVerseFromSaved(filtered.map((l) => l.title))
                        }
                        className="w-full mb-4 inline-flex items-center justify-center gap-2 rounded-xl border border-amber-500/25 hover:border-amber-500/50 bg-amber-500/[0.04] hover:bg-amber-500/[0.08] py-3 text-[11px] uppercase tracking-[0.25em] font-mono-kali text-amber-200/80 hover:text-amber-200 transition-colors"
                      >
                        <Wand2 size={15} /> Weave these into a closing blessing
                      </button>
                    )}
                    <div className="divide-y divide-white/[0.04]">
                      {filtered.map((l) => (
                        <button
                          key={l.id}
                          data-testid={`letter-item-${l.number}`}
                          onClick={() => openLetter(l.id)}
                          className="group w-full flex items-baseline gap-4 py-4 text-left hover:pl-2 transition-all"
                        >
                          <span className="font-mono-kali text-xs text-amber-500/40 w-10 shrink-0 tabular-nums">
                            {String(l.number).padStart(3, "0")}
                          </span>
                          <span className="font-cinzel text-base sm:text-lg text-zinc-300 group-hover:text-amber-300 transition-colors flex-1">
                            {l.title}
                          </span>
                          {savedSet.has(l.id) && (
                            <BookmarkCheck size={14} className="text-amber-500/60 shrink-0" />
                          )}
                        </button>
                      ))}
                      {filtered.length === 0 && (
                        <p className="text-center text-zinc-600 py-20 font-mono-kali text-sm">
                          {tab === "saved"
                            ? user
                              ? "No saved letters yet. Open a letter and tap the bookmark."
                              : "Sign in to keep letters on your altar."
                            : "No letters match that search."}
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div
              ref={readerRef}
              onScroll={onReaderScroll}
              className="kali-scroll flex-1 overflow-y-auto px-5 sm:px-8 py-8"
            >
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

                  <div className="flex flex-wrap items-center gap-x-6 gap-y-3 mb-9">
                    <button
                      data-testid="letter-speak-btn"
                      onClick={playOpening}
                      className="inline-flex items-center gap-2 text-[10px] uppercase tracking-[0.25em] font-mono-kali text-zinc-500 hover:text-amber-300 transition-colors"
                    >
                      {player.mode === "opening" && player.state === "loading" ? (
                        <Loader2 size={13} className="animate-spin" />
                      ) : player.mode === "opening" ? (
                        <Square size={13} />
                      ) : (
                        <Volume2 size={13} />
                      )}
                      {player.mode === "opening" ? "silence" : "hear the opening"}
                    </button>

                    <button
                      data-testid="letter-readfull-btn"
                      onClick={playFull}
                      className="inline-flex items-center gap-2 text-[10px] uppercase tracking-[0.25em] font-mono-kali text-zinc-500 hover:text-amber-300 transition-colors"
                    >
                      {player.mode === "full" && player.state === "loading" ? (
                        <Loader2 size={13} className="animate-spin" />
                      ) : player.mode === "full" ? (
                        <Square size={13} />
                      ) : (
                        <PlayCircle size={13} />
                      )}
                      {player.mode === "full"
                        ? `reading ${player.index + 1}/${player.total} — stop`
                        : "read in full"}
                    </button>

                    <button
                      data-testid="letter-save-btn"
                      onClick={handleBookmark}
                      className={`inline-flex items-center gap-2 text-[10px] uppercase tracking-[0.25em] font-mono-kali transition-colors ${
                        isSaved ? "text-amber-300" : "text-zinc-500 hover:text-amber-300"
                      }`}
                    >
                      {isSaved ? <BookmarkCheck size={13} /> : <Bookmark size={13} />}
                      {isSaved ? "saved" : "save"}
                    </button>

                    <button
                      data-testid="letter-to-verse-btn"
                      onClick={() => onLetterToVerse && onLetterToVerse(selected)}
                      className="inline-flex items-center gap-2 text-[10px] uppercase tracking-[0.25em] font-mono-kali text-zinc-500 hover:text-amber-300 transition-colors"
                    >
                      <Sparkles size={13} /> distil to a verse
                    </button>

                    <div className="relative">
                      <button
                        data-testid="letter-share-btn"
                        onClick={() => setShareOpen((v) => !v)}
                        className="inline-flex items-center gap-2 text-[10px] uppercase tracking-[0.25em] font-mono-kali text-zinc-500 hover:text-amber-300 transition-colors"
                      >
                        <Share2 size={13} /> share
                      </button>
                      {shareOpen && (
                        <div className="absolute left-0 bottom-full mb-2 w-44 rounded-xl bg-zinc-950/95 border border-amber-500/20 py-2 shadow-2xl shadow-black z-10">
                          <p className="px-4 py-1 text-[9px] uppercase tracking-[0.25em] text-amber-200/40 font-mono-kali">
                            Card style
                          </p>
                          {CARD_STYLES.map((st) => (
                            <button
                              key={st.id}
                              data-testid={`share-style-${st.id}`}
                              onClick={() => shareLetter(selected, st.id)}
                              className="block w-full text-left px-4 py-2 text-xs font-mono-kali text-zinc-300 hover:text-amber-300 hover:bg-amber-500/5 transition-colors"
                            >
                              {st.label}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="space-y-5">
                    {selected.body.split("\n\n").map((p, idx) => {
                      const isHeading =
                        p.length < 60 &&
                        !/[.?!,]$/.test(p.trim()) &&
                        !p.startsWith("Beloved");
                      return isHeading ? (
                        <h2 key={idx} className="font-cinzel text-lg text-amber-200/80 pt-4">
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
