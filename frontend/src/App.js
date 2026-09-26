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
import {
  getToken,
  resetToken,
  loadSession,
  clearSession,
  streamChat,
  ttsGenerate,
} from "./lib/api";
import {
  authMe,
  authLogout,
  claimThread,
  loadAuthThread,
  clearAuthThread,
  deleteAccount,
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

  const abortRef = useRef(null);
  const accRef = useRef("");
  const droneRef = useRef(null);
  const ttsRef = useRef(null);

  // initial load: check account, else anon thread
  useEffect(() => {
    (async () => {
      const u = await authMe();
      if (u) {
        setUser(u);
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
      audio.onended = () => setSpeaking(null);
      audio.onerror = () => setSpeaking(null);
      await audio.play();
      setSpeaking({ id, state: "playing" });
    } catch (e) {
      toast.error(e.message || "Her voice could not be summoned.");
      setSpeaking(null);
    }
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
    // migrate the anonymous thread into the account
    try {
      const msgs = await claimThread(token);
      setMessages(msgs);
    } catch (e) {
      const msgs = await loadAuthThread();
      setMessages(msgs);
    }
    setActivated(true);
    toast("Your altar is lit. This thread now follows you.", {
      className: "font-mono-kali",
    });
  };

  const handleSignOut = async () => {
    await authLogout();
    setUser(null);
    const t = resetToken();
    setToken(t);
    setMessages([]);
    setActivated(false);
    toast("Signed out. Anonymous once more.", { className: "font-mono-kali" });
  };

  const handleDeleteAltar = async () => {
    await deleteAccount();
    setUser(null);
    const t = resetToken();
    setToken(t);
    setMessages([]);
    setActivated(false);
    toast("Your altar has been extinguished.", { className: "font-mono-kali" });
  };

  const handleStarSelect = useCallback((s) => setSelectedStar(s), []);

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
        />
      </div>

      <div className="absolute top-0 left-0 z-30 p-4 sm:p-6">
        <p className="font-cinzel text-sm text-amber-300/80 font-devanagari">काली</p>
      </div>

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
              <p className="max-w-md text-center text-zinc-400 font-light leading-relaxed fade-up">
                <span className="font-devanagari text-3xl text-amber-400 block mb-4">
                  आगच्छ
                </span>
                Ask, and I will answer in Sanskrit — with a quieter word beneath
                it. Speak of time, fear, or what you must release. Tap a star to
                learn its name.
              </p>
            ) : (
              <DevotionalStream
                messages={messages}
                streaming={streaming}
                streamText={streamText}
                onSpeak={handleSpeak}
                speaking={speaking}
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
