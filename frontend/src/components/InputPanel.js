import { useEffect, useRef, useState } from "react";
import { Mic, Send, Square } from "lucide-react";

const SUGGESTIONS = ["Goddess of Time", "Fierce compassion", "What must I release?"];

export const InputPanel = ({ onSend, onStop, streaming, disabled }) => {
  const [value, setValue] = useState("");
  const [listening, setListening] = useState(false);
  const recRef = useRef(null);
  const taRef = useRef(null);

  const submit = () => {
    const v = value.trim();
    if (!v || streaming || disabled) return;
    onSend(v);
    setValue("");
    if (taRef.current) taRef.current.style.height = "auto";
  };

  const handleKey = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  const autoGrow = (e) => {
    setValue(e.target.value);
    const el = e.target;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 140) + "px";
  };

  const toggleVoice = () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;
    if (listening) {
      recRef.current?.stop();
      return;
    }
    const rec = new SR();
    rec.lang = "en-US";
    rec.interimResults = true;
    rec.onresult = (e) => {
      const txt = Array.from(e.results)
        .map((r) => r[0].transcript)
        .join("");
      setValue(txt);
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    recRef.current = rec;
    rec.start();
    setListening(true);
  };

  useEffect(() => () => recRef.current?.stop?.(), []);

  const voiceAvailable =
    typeof window !== "undefined" &&
    (window.SpeechRecognition || window.webkitSpeechRecognition);

  return (
    <div className="w-full max-w-2xl mx-auto pointer-events-auto">
      <div className="flex flex-wrap justify-center gap-2 mb-3">
        {SUGGESTIONS.map((s) => (
          <button
            key={s}
            data-testid={`suggestion-${s.split(" ")[0].toLowerCase()}`}
            onClick={() => setValue(s)}
            disabled={streaming}
            className="text-[10px] uppercase tracking-[0.2em] font-mono-kali text-zinc-500 hover:text-amber-300 border border-white/5 hover:border-amber-500/30 rounded-full px-3 py-1 transition-colors disabled:opacity-40"
          >
            {s}
          </button>
        ))}
      </div>

      <div className="flex items-end gap-2 rounded-2xl bg-zinc-950/70 backdrop-blur-xl border border-amber-500/15 px-3 py-2 focus-within:border-amber-500/40 transition-colors">
        {voiceAvailable && (
          <button
            data-testid="voice-input-btn"
            onClick={toggleVoice}
            aria-label="Speak your question"
            className={`shrink-0 p-2 rounded-full transition-colors ${
              listening
                ? "text-amber-300 bg-amber-500/10"
                : "text-zinc-500 hover:text-amber-300"
            }`}
          >
            <Mic size={18} />
          </button>
        )}
        <textarea
          ref={taRef}
          data-testid="chat-input"
          rows={1}
          value={value}
          onChange={autoGrow}
          onKeyDown={handleKey}
          placeholder="Speak to her…"
          disabled={disabled}
          className="flex-1 resize-none bg-transparent outline-none text-zinc-100 placeholder:text-zinc-600 text-base leading-relaxed py-1.5 max-h-[140px]"
        />
        {streaming ? (
          <button
            data-testid="input-stop-btn"
            onClick={onStop}
            aria-label="Stop generation"
            className="shrink-0 p-2 rounded-full text-amber-300 hover:bg-amber-500/10 transition-colors"
          >
            <Square size={18} />
          </button>
        ) : (
          <button
            data-testid="submit-btn"
            onClick={submit}
            disabled={!value.trim() || disabled}
            aria-label="Send"
            className="shrink-0 p-2 rounded-full text-amber-400 hover:bg-amber-500/10 disabled:text-zinc-700 disabled:hover:bg-transparent transition-colors"
          >
            <Send size={18} />
          </button>
        )}
      </div>
      <p className="text-center text-[10px] text-zinc-600 font-mono-kali mt-2 tracking-wider">
        AI interpretation · not scripture · refresh keeps your thread on this device
      </p>
    </div>
  );
};
