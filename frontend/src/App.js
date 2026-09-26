import { useEffect, useRef, useState, useCallback } from "react";
import "@/App.css";
import { Toaster, toast } from "sonner";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { StarfieldCanvas } from "./components/StarfieldCanvas";
import { CentralDash } from "./components/CentralDash";
import { DevotionalStream } from "./components/DevotionalStream";
import { InputPanel } from "./components/InputPanel";
import { MinimalMenu } from "./components/MinimalMenu";
import { MahakaliIntroModal } from "./components/MahakaliIntroModal";
import { AuthModal } from "./components/AuthModal";
import { ResetPassphraseModal } from "./components/ResetPassphraseModal";
import { LettersLibrary } from "./components/LettersLibrary";
import { ReminderModal } from "./components/ReminderModal";
import { BlessingsModal } from "./components/BlessingsModal";
import { ShareCardModal } from "./components/ShareCardModal";
import {
  getToken,
  resetToken,
  loadSession,
  clearSession,
  streamChat,
  ttsGenerate,
  parseReply,
  transliterate,
  fetchDailyLetter,
} from "./lib/api";
import {
  authMe,
  authLogout,
  claimThread,
  loadAuthThread,
  clearAuthThread,
  deleteAccount,
  getSavedLetters,
  saveLetter,
  unsaveLetter,
  setDailyReminder,
  saveBlessing,
} from "./lib/auth";

const prefersReduced =
  typeof window !== "undefined" &&
  window.matchMedia &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function App() {
  const [token, setToken] = useState(() => getToken());
  const [user, setUser] = useState(null);
  const [messages, setMessages] = useState([]);
  const [activated, setActivated] = useState(false);
  const [showIntro, setShowIntro] = useState(false);
  const [showAuth, setShowAuth] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [streamText, setStreamText] = useState("");
  const [reducedMotion, setReducedMotion] = useState(prefersReduced);
  const [constellationOn, setConstellationOn] = useState(true);
  const [audioOn, setAudioOn] = useState(false);
  const [selectedStar, setSelectedStar] = useState(null);
  const [speaking, setSpeaking] = useState(null); // { id, state }
  const [showLetters, setShowLetters] = useState(false);
  const [dailyLetter, setDailyLetter] = useState(null);
  const [savedIds, setSavedIds] = useState([]);
  const [autoOpenLetterId, setAutoOpenLetterId] = useState(null);
  const [dailyReminderOn, setDailyReminderOn] = useState(false);
  const [reminderHour, setReminderHour] = useState(8);
  const [reminderFreq, setReminderFreq] = useState("daily");
  const [reminderWeekday, setReminderWeekday] = useState(0);
  const [showReminder, setShowReminder] = useState(false);
  const [showBlessings, setShowBlessings] = useState(false);
  const [shareVerse, setShareVerse] = useState(null);
  const [milestone, setMilestone] = useState(null);
  const [milestonesEarned, setMilestonesEarned] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("kali_milestones") || "[]");
    } catch (e) {
      return [];
    }
  });
  const [continueReading, setContinueReading] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("kali_reading") || "null");
    } catch (e) {
      return null;
    }
  });
  const [autoplayOn, setAutoplayOn] = useState(
    () => localStorage.getItem("kali_autoplay") === "1"
  );
  const [resetToken, setResetToken] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return window.location.pathname.startsWith("/reset")
      ? params.get("token")
      : null;
  });

  const abortRef = useRef(null);
  const accRef = useRef("");
  const droneRef = useRef(null);
  const ttsRef = useRef(null);
  const audioCtxRef = useRef(null);
  const analyserRef = useRef(null);
  const messagesRef = useRef([]);
  const autoplayedRef = useRef(-1);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  // deep-link: /?letter=MT-KALI-#### opens the library to that letter
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const lid = params.get("letter");
    if (lid) {
      setAutoOpenLetterId(lid);
      setShowLetters(true);
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  // initial load: check account, else anon thread
  useEffect(() => {
    (async () => {
      fetchDailyLetter().then(setDailyLetter);
      const u = await authMe();
      if (u) {
        setUser(u);
        setDailyReminderOn(!!u.daily_reminder);
        setReminderHour(u.reminder_hour ?? 8);
        setReminderFreq(u.reminder_freq || "daily");
        setReminderWeekday(u.reminder_weekday ?? 0);
        getSavedLetters().then((d) => setSavedIds(d.ids || []));
        const msgs = await loadAuthThread();
        setMessages(msgs);
        if (msgs.length) setActivated(true);
      } else {
        const msgs = await loadSession(token);
        if (msgs.length) {
          setMessages(msgs);
          setActivated(true);
        }
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // mobile viewport height (keyboard-safe)
  useEffect(() => {
    const setVh = () => {
      const h = window.visualViewport?.height || window.innerHeight;
      document.documentElement.style.setProperty("--app-h", `${h}px`);
    };
    setVh();
    window.visualViewport?.addEventListener("resize", setVh);
    window.addEventListener("resize", setVh);
    return () => {
      window.visualViewport?.removeEventListener("resize", setVh);
      window.removeEventListener("resize", setVh);
    };
  }, []);

  const toggleAudio = useCallback(() => {
    if (audioOn) {
      droneRef.current?.ctx?.close?.();
      droneRef.current = null;
      setAudioOn(false);
      return;
    }
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      const ctx = new Ctx();
      const gain = ctx.createGain();
      gain.gain.value = 0.0;
      gain.connect(ctx.destination);
      const freqs = [108, 162, 216];
      const oscs = freqs.map((f, i) => {
        const o = ctx.createOscillator();
        o.type = i === 0 ? "sine" : "triangle";
        o.frequency.value = f;
        const g = ctx.createGain();
        g.gain.value = i === 0 ? 0.06 : 0.02;
        o.connect(g);
        g.connect(gain);
        o.start();
        return o;
      });
      gain.gain.linearRampToValueAtTime(0.5, ctx.currentTime + 2);
      droneRef.current = { ctx, oscs };
      setAudioOn(true);
    } catch (e) {
      toast.error("Audio unavailable on this device.");
    }
  }, [audioOn]);

  const activate = () => {
    setActivated(true);
    if (!localStorage.getItem("kali_intro_seen")) setShowIntro(true);
  };

  const closeIntro = () => {
    localStorage.setItem("kali_intro_seen", "1");
    setShowIntro(false);
  };

  const handleSend = useCallback(
    async (text) => {
      setMessages((m) => [...m, { role: "user", content: text }]);
      setStreaming(true);
      setStreamText("");
      accRef.current = "";
      const controller = new AbortController();
      abortRef.current = controller;

      await streamChat(token, text, {
        signal: controller.signal,
        onDelta: (chunk) => {
          accRef.current += chunk;
          setStreamText(accRef.current);
        },
        onError: (msg) => toast.error(msg || "The connection wavered."),
      }).catch((e) => {
        if (e.name !== "AbortError") toast.error("The connection wavered.");
      });

      const final = accRef.current.trim();
      if (final) setMessages((m) => [...m, { role: "assistant", content: final }]);
      setStreamText("");
      setStreaming(false);
      abortRef.current = null;
    },
    [token]
  );

  const handleStop = () => {
    abortRef.current?.abort();
    const final = accRef.current.trim();
    if (final) setMessages((m) => [...m, { role: "assistant", content: final }]);
    setStreamText("");
    setStreaming(false);
  };

  const stopTts = () => {
    ttsRef.current?.pause();
    ttsRef.current = null;
    setSpeaking(null);
  };

  const handleSpeak = async (id, text) => {
    if (speaking && speaking.id === id && speaking.state === "playing") {
      stopTts();
      return;
    }
    stopTts();
    setSpeaking({ id, state: "loading" });
    try {
      const dataUrl = await ttsGenerate(text);
      const audio = new Audio(dataUrl);
      ttsRef.current = audio;
      // Route through an AnalyserNode so the waveform can ripple with her voice.
      try {
        if (!audioCtxRef.current) {
          const Ctx = window.AudioContext || window.webkitAudioContext;
          audioCtxRef.current = new Ctx();
        }
        const ctx = audioCtxRef.current;
        if (ctx.state === "suspended") await ctx.resume();
        const src = ctx.createMediaElementSource(audio);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 64;
        analyser.smoothingTimeConstant = 0.75;
        src.connect(analyser);
        analyser.connect(ctx.destination);
        analyserRef.current = analyser;
      } catch (e) {
        analyserRef.current = null;
      }
      audio.onended = () => {
        analyserRef.current = null;
        setSpeaking(null);
      };
      audio.onerror = () => {
        analyserRef.current = null;
        setSpeaking(null);
      };
      await audio.play();
      setSpeaking({ id, state: "playing" });
    } catch (e) {
      toast.error(e.message || "Her voice could not be summoned.");
      setSpeaking(null);
    }
  };

  // Autoplay Verse: speak each new completed verse aloud when enabled
  useEffect(() => {
    if (streaming || !autoplayOn) return;
    const last = messages[messages.length - 1];
    if (!last || last.role !== "assistant") return;
    const idx = messages.length - 1;
    if (autoplayedRef.current >= idx) return;
    autoplayedRef.current = idx;
    const p = parseReply(last.content);
    if (p.guidance) return;
    const t = `${transliterate(p.sanskrit)}. ${p.english}`;
    handleSpeak(idx, t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [streaming, messages, autoplayOn]);

  const toggleAutoplay = () => {
    setAutoplayOn((v) => {
      const nv = !v;
      localStorage.setItem("kali_autoplay", nv ? "1" : "0");
      if (nv) autoplayedRef.current = messagesRef.current.length - 1;
      else stopTts();
      return nv;
    });
    toast(autoplayOn ? "Autoplay silenced." : "Autoplay awakened.", {
      className: "font-mono-kali",
    });
  };

  const handleReset = () => {
    abortRef.current?.abort();
    stopTts();
    if (!user) {
      const t = resetToken();
      setToken(t);
    } else {
      clearAuthThread();
    }
    setMessages([]);
    setStreamText("");
    setStreaming(false);
    setActivated(true);
    toast("A new thread begins.", { className: "font-mono-kali" });
  };

  const handleClear = async () => {
    abortRef.current?.abort();
    stopTts();
    if (user) await clearAuthThread();
    else await clearSession(token);
    setMessages([]);
    setStreamText("");
    setStreaming(false);
    setActivated(false);
    toast("The thread has dissolved.", { className: "font-mono-kali" });
  };

  const handleExport = () => {
    const lines = messages.map((m) =>
      m.role === "user" ? `You: ${m.content}` : `Kali:\n${m.content}`
    );
    const blob = new Blob([lines.join("\n\n———\n\n")], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `kali-session-${new Date().toISOString().slice(0, 10)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    toast("Session exported.", { className: "font-mono-kali" });
  };

  const handleAuthed = async (u) => {
    setUser(u);
    setShowAuth(false);
    setDailyReminderOn(!!u.daily_reminder);
    setReminderHour(u.reminder_hour ?? 8);
    setReminderFreq(u.reminder_freq || "daily");
    setReminderWeekday(u.reminder_weekday ?? 0);
    getSavedLetters().then((d) => setSavedIds(d.ids || []));
    // migrate the anonymous thread into the account
    try {
      const res = await claimThread(token);
      setMessages(Array.isArray(res) ? res : res?.messages || []);
    } catch (e) {
      const msgs = await loadAuthThread();
      setMessages(Array.isArray(msgs) ? msgs : []);
    }
    setActivated(true);
    toast("Your altar is lit. This thread now follows you.", {
      className: "font-mono-kali",
    });
  };

  const handleToggleSave = async (id, isSaved) => {
    try {
      if (isSaved) {
        await unsaveLetter(id);
        setSavedIds((ids) => ids.filter((x) => x !== id));
        toast("Removed from your altar.", { className: "font-mono-kali" });
      } else {
        await saveLetter(id);
        setSavedIds((ids) => [id, ...ids.filter((x) => x !== id)]);
        toast("Letter kept on your altar.", { className: "font-mono-kali" });
      }
    } catch (e) {
      toast.error("Could not update your saved letters.");
    }
  };

  const handleLetterToVerse = (letter) => {
    setShowLetters(false);
    setActivated(true);
    const essence = letter.body
      .replace(/^Beloved[^\n]*\n\n/, "")
      .slice(0, 320)
      .trim();
    const msg = `Distil this letter of yours into a single short Sanskrit verse with its English meaning — "${letter.title}". Its essence: ${essence}`;
    setTimeout(() => handleSend(msg), 250);
  };

  const openDailyLetter = () => {
    if (!dailyLetter) return;
    setAutoOpenLetterId(dailyLetter.id);
    setShowLetters(true);
  };

  const openContinueReading = () => {
    if (!continueReading) return;
    setAutoOpenLetterId(continueReading.id);
    setShowLetters(true);
  };

  const saveReminder = async (enabled, hour, tz, freq, weekday) => {
    try {
      await setDailyReminder(enabled, hour, tz, freq, weekday);
      setDailyReminderOn(enabled);
      setReminderHour(hour);
      setReminderFreq(freq);
      setReminderWeekday(weekday);
      toast(
        enabled
          ? freq === "weekly"
            ? "A weekly letter digest will reach you."
            : "Today's letter will reach you each morning."
          : "Daily letter emails silenced.",
        { className: "font-mono-kali" }
      );
    } catch (e) {
      toast.error("Could not update your reminder.");
    }
  };

  const handleKeepVerse = async (parsed) => {
    if (!user) {
      toast("Sign in to keep a blessing on your altar.", { className: "font-mono-kali" });
      setShowAuth(true);
      return;
    }
    try {
      await saveBlessing(parsed.sanskrit || "", parsed.english || "");
      toast("Blessing kept on your altar.", { className: "font-mono-kali" });
    } catch (e) {
      toast.error("Could not keep this blessing.");
    }
  };

  const handleShareVerse = (parsed) => {
    setShareVerse({ sanskrit: parsed.sanskrit || "", english: parsed.english || "" });
  };

  const handleMilestone = (count) => {
    setMilestone(count);
    try {
      setMilestonesEarned(JSON.parse(localStorage.getItem("kali_milestones") || "[]"));
    } catch (e) {}
  };

  const openRareLetter = () => {
    const rareId = milestone >= 30 ? "MT-KALI-0400" : "MT-KALI-0108";
    setMilestone(null);
    setAutoOpenLetterId(rareId);
    setShowLetters(true);
  };

  const handleVerseFromSaved = (titles) => {
    setShowLetters(false);
    setActivated(true);
    const list = titles.slice(0, 12).join("; ");
    const msg = `Weave the essence of these letters of yours into a single short closing Sanskrit blessing with its English meaning: ${list}`;
    setTimeout(() => handleSend(msg), 250);
  };

  const handleSignOut = async () => {
    await authLogout();
    setUser(null);
    setSavedIds([]);
    const t = resetToken();
    setToken(t);
    setMessages([]);
    setActivated(false);
    toast("Signed out. Anonymous once more.", { className: "font-mono-kali" });
  };

  const handleDeleteAltar = async () => {
    await deleteAccount();
    setUser(null);
    setSavedIds([]);
    const t = resetToken();
    setToken(t);
    setMessages([]);
    setActivated(false);
    toast("Your altar has been extinguished.", { className: "font-mono-kali" });
  };

  const handleStarSelect = useCallback((s) => setSelectedStar(s), []);

  const finishReset = () => {
    setResetToken(null);
    window.history.replaceState({}, "", "/");
    setShowAuth(true);
  };

  return (
    <div
      className={`relative w-full overflow-hidden bg-black text-zinc-100 select-none kali-grain ${
        reducedMotion ? "reduce-motion" : ""
      }`}
      style={{ height: "var(--app-h, 100vh)" }}
    >
      <StarfieldCanvas
        reducedMotion={reducedMotion}
        showConstellation={constellationOn}
        onStarSelect={handleStarSelect}
      />

      {/* Top HUD */}
      <div className="absolute top-0 right-0 z-30 p-4 sm:p-6">
        <MinimalMenu
          streaming={streaming}
          onStop={handleStop}
          onReset={handleReset}
          onExport={handleExport}
          onClear={handleClear}
          audioOn={audioOn}
          onToggleAudio={toggleAudio}
          constellationOn={constellationOn}
          onToggleConstellation={() => setConstellationOn((v) => !v)}
          reducedMotion={reducedMotion}
          onToggleMotion={() => setReducedMotion((v) => !v)}
          user={user}
          onSignIn={() => setShowAuth(true)}
          onSignOut={handleSignOut}
          onDeleteAltar={handleDeleteAltar}
          onOpenLetters={() => setShowLetters(true)}
          autoplayOn={autoplayOn}
          onToggleAutoplay={toggleAutoplay}
          dailyReminderOn={dailyReminderOn}
          onToggleDailyReminder={() => setShowReminder(true)}
          onOpenReminder={() => setShowReminder(true)}
          onOpenBlessings={() => setShowBlessings(true)}
        />
      </div>

      <div className="absolute top-0 left-0 z-30 p-4 sm:p-6">
        <p className="font-cinzel text-sm text-amber-300/80 font-devanagari">काली</p>
      </div>

      {/* Streak milestone badge — a small permanent golden mark in the sky */}
      {milestonesEarned.length > 0 && (
        <div
          data-testid="milestone-badge"
          className="absolute z-30 top-[14%] left-1/2 -translate-x-1/2 flex items-center gap-3 pointer-events-none"
        >
          {[...milestonesEarned].sort((a, b) => a - b).map((m) => (
            <span
              key={m}
              title={`${m}-day devotion earned`}
              className="pointer-events-auto text-amber-300/90 text-lg leading-none drop-shadow-[0_0_10px_rgba(245,158,11,0.75)] milestone-twinkle cursor-default"
            >
              {m >= 30 ? "✦✦" : "✦"}
            </span>
          ))}
        </div>
      )}

      {/* Star lore panel */}
      <AnimatePresence>
        {selectedStar && (
          <motion.div
            data-testid="star-lore-panel"
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.4 }}
            className="absolute z-40 left-1/2 -translate-x-1/2 top-20 sm:top-24 w-[calc(100%-2rem)] max-w-sm rounded-xl bg-zinc-950/90 backdrop-blur-xl border border-amber-500/20 p-5 pointer-events-auto"
          >
            <button
              data-testid="star-lore-close"
              onClick={() => setSelectedStar(null)}
              className="absolute top-3 right-3 text-zinc-500 hover:text-amber-300"
              aria-label="Close"
            >
              <X size={16} />
            </button>
            <p className="text-[9px] uppercase tracking-[0.3em] text-amber-200/40 font-mono-kali mb-1">
              Orion
            </p>
            <p
              data-testid="star-lore-name"
              className="font-cinzel text-xl text-amber-300 mb-2 tracking-wide"
            >
              {selectedStar.name}
            </p>
            <p className="text-sm text-zinc-300 font-light leading-relaxed">
              {selectedStar.lore}
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      {!activated ? (
        <CentralDash onActivate={activate} reducedMotion={reducedMotion} />
      ) : (
        <div className="absolute inset-0 z-20 flex flex-col justify-end pointer-events-none">
          <div className="flex-1 flex items-center justify-center overflow-hidden px-4 pt-20 pointer-events-auto">
            {messages.length === 0 && !streaming ? (
              <div className="max-w-md text-center fade-up">
                <p className="text-zinc-400 font-light leading-relaxed">
                  <span className="font-devanagari text-3xl text-amber-400 block mb-4">
                    आगच्छ
                  </span>
                  Ask, and I will answer in Sanskrit — with a quieter word
                  beneath it. Speak of time, fear, or what you must release.
                </p>
                {dailyLetter && (
                  <button
                    data-testid="daily-letter-entry"
                    onClick={openDailyLetter}
                    className="mt-8 inline-flex flex-col items-center gap-1 group"
                  >
                    <span className="text-[10px] uppercase tracking-[0.3em] text-amber-500/50 font-mono-kali group-hover:text-amber-400/80 transition-colors">
                      ☾ Today's Letter
                    </span>
                    <span className="font-cinzel text-lg text-amber-300/80 group-hover:text-amber-300 border-b border-amber-500/20 group-hover:border-amber-500/50 pb-0.5 transition-colors">
                      {dailyLetter.title}
                    </span>
                  </button>
                )}
                {continueReading && continueReading.id && (
                  <button
                    data-testid="continue-reading-entry"
                    onClick={openContinueReading}
                    className="mt-6 block mx-auto text-[11px] font-mono-kali text-zinc-500 hover:text-amber-300 transition-colors"
                  >
                    ↩ Continue reading — <span className="italic">{continueReading.title}</span>
                  </button>
                )}
              </div>
            ) : (
              <DevotionalStream
                messages={messages}
                streaming={streaming}
                streamText={streamText}
                onSpeak={handleSpeak}
                speaking={speaking}
                speakingAnalyser={analyserRef.current}
                onKeep={handleKeepVerse}
                onShare={handleShareVerse}
              />
            )}
          </div>
          <div className="px-4 pb-6 sm:pb-8 pt-2">
            <InputPanel
              onSend={handleSend}
              onStop={handleStop}
              streaming={streaming}
            />
          </div>
        </div>
      )}

      <MahakaliIntroModal open={showIntro} onClose={closeIntro} />
      <AuthModal
        open={showAuth}
        onClose={() => setShowAuth(false)}
        onAuthed={handleAuthed}
      />
      <ResetPassphraseModal
        open={!!resetToken}
        token={resetToken}
        onDone={finishReset}
      />
      <LettersLibrary
        open={showLetters}
        onClose={() => setShowLetters(false)}
        user={user}
        savedIds={savedIds}
        onToggleSave={handleToggleSave}
        onSignInPrompt={() => setShowAuth(true)}
        onLetterToVerse={handleLetterToVerse}
        onVerseFromSaved={handleVerseFromSaved}
        onProgress={setContinueReading}
        onMilestone={handleMilestone}
        stopExternal={stopTts}
        autoOpenId={autoOpenLetterId}
        onConsumedAutoOpen={() => setAutoOpenLetterId(null)}
      />
      <ReminderModal
        open={showReminder}
        onClose={() => setShowReminder(false)}
        initialEnabled={dailyReminderOn}
        initialHour={reminderHour}
        initialFreq={reminderFreq}
        initialWeekday={reminderWeekday}
        onSave={saveReminder}
      />
      <BlessingsModal
        open={showBlessings}
        onClose={() => setShowBlessings(false)}
      />
      <ShareCardModal
        open={!!shareVerse}
        onClose={() => setShareVerse(null)}
        kind="blessing"
        payload={shareVerse}
      />
      <AnimatePresence>
        {milestone && (
          <motion.div
            data-testid="milestone-modal"
            className="fixed inset-0 z-[65] flex items-center justify-center p-6 bg-black/80 backdrop-blur-md pointer-events-auto"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              initial={{ opacity: 0, y: 20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
              className="max-w-sm w-full rounded-2xl bg-zinc-950/95 border border-amber-500/30 p-8 text-center"
            >
              <p className="text-5xl mb-3 text-amber-400">{milestone >= 30 ? "✦✦" : "✦"}</p>
              <p className="font-cinzel text-2xl text-amber-300 mb-2">
                {milestone}-day streak
              </p>
              <p className="text-sm text-zinc-300 font-light leading-relaxed mb-7">
                {milestone >= 30
                  ? "Thirty days of returning to the light. A rare letter opens for you."
                  : "Seven days of devotion. A rare letter opens for you."}
              </p>
              <div className="flex flex-col gap-3">
                <button
                  data-testid="milestone-open-btn"
                  onClick={openRareLetter}
                  className="px-8 py-2.5 rounded-full border border-amber-500/40 text-amber-200 text-xs uppercase tracking-[0.3em] font-mono-kali hover:bg-amber-500/10 transition-colors"
                >
                  Open the rare letter
                </button>
                <button
                  data-testid="milestone-close-btn"
                  onClick={() => setMilestone(null)}
                  className="text-[10px] uppercase tracking-[0.2em] font-mono-kali text-zinc-600 hover:text-amber-300 transition-colors"
                >
                  Later
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      <Toaster
        theme="dark"
        position="top-center"
        toastOptions={{
          style: {
            background: "rgba(10,10,12,0.92)",
            border: "1px solid rgba(245,158,11,0.2)",
            color: "#e4e4e7",
          },
        }}
      />
    </div>
  );
}

export default App;
