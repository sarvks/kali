import { useEffect, useRef, useState, useCallback } from "react";
import "@/App.css";
import { Toaster, toast } from "sonner";
import { StarfieldCanvas } from "./components/StarfieldCanvas";
import { CentralDash } from "./components/CentralDash";
import { DevotionalStream } from "./components/DevotionalStream";
import { InputPanel } from "./components/InputPanel";
import { MinimalMenu } from "./components/MinimalMenu";
import { MahakaliIntroModal } from "./components/MahakaliIntroModal";
import {
  getToken,
  resetToken,
  loadSession,
  clearSession,
  streamChat,
} from "./lib/api";

const prefersReduced =
  typeof window !== "undefined" &&
  window.matchMedia &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function App() {
  const [token, setToken] = useState(() => getToken());
  const [messages, setMessages] = useState([]);
  const [activated, setActivated] = useState(false);
  const [showIntro, setShowIntro] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [streamText, setStreamText] = useState("");
  const [reducedMotion, setReducedMotion] = useState(prefersReduced);
  const [constellationOn, setConstellationOn] = useState(true);
  const [audioOn, setAudioOn] = useState(false);

  const abortRef = useRef(null);
  const accRef = useRef("");
  const audioRef = useRef(null);

  // load persisted thread
  useEffect(() => {
    loadSession(token).then((msgs) => {
      if (msgs.length) {
        setMessages(msgs);
        setActivated(true);
      }
    });
  }, [token]);

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

  // ambient 108Hz drone
  const toggleAudio = useCallback(() => {
    if (audioOn) {
      audioRef.current?.ctx?.close?.();
      audioRef.current = null;
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
      audioRef.current = { ctx, oscs };
      setAudioOn(true);
    } catch (e) {
      toast.error("Audio unavailable on this device.");
    }
  }, [audioOn]);

  const activate = () => {
    setActivated(true);
    if (!localStorage.getItem("kali_intro_seen")) {
      setShowIntro(true);
    }
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
        onError: (msg) => {
          toast.error(msg || "The connection wavered.");
        },
      }).catch((e) => {
        if (e.name !== "AbortError") toast.error("The connection wavered.");
      });

      const final = accRef.current.trim();
      if (final) {
        setMessages((m) => [...m, { role: "assistant", content: final }]);
      }
      setStreamText("");
      setStreaming(false);
      abortRef.current = null;
    },
    [token]
  );

  const handleStop = () => {
    abortRef.current?.abort();
    const final = accRef.current.trim();
    if (final) {
      setMessages((m) => [...m, { role: "assistant", content: final }]);
    }
    setStreamText("");
    setStreaming(false);
  };

  const handleReset = () => {
    abortRef.current?.abort();
    const t = resetToken();
    setMessages([]);
    setStreamText("");
    setStreaming(false);
    setActivated(true);
    setToken(t);
    toast("A new thread begins.", { className: "font-mono-kali" });
  };

  const handleClear = async () => {
    abortRef.current?.abort();
    await clearSession(token);
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
    const blob = new Blob([lines.join("\n\n———\n\n")], {
      type: "text/plain",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `kali-session-${new Date().toISOString().slice(0, 10)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    toast("Session exported.", { className: "font-mono-kali" });
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
        />
      </div>

      <div className="absolute top-0 left-0 z-30 p-4 sm:p-6">
        <p className="font-cinzel text-sm text-amber-300/80 font-devanagari">
          काली
        </p>
      </div>

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
                it. Speak of time, fear, or what you must release.
              </p>
            ) : (
              <DevotionalStream
                messages={messages}
                streaming={streaming}
                streamText={streamText}
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
