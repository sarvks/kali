import { useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { Volume2, Loader2, Square } from "lucide-react";
import { parseReply, transliterate } from "../lib/api";
import { VoiceWaveform } from "./VoiceWaveform";

const SpeakButton = ({ onSpeak, state }) => {
  if (!onSpeak) return null;
  return (
    <button
      data-testid="speak-btn"
      onClick={onSpeak}
      aria-label="Hear this spoken"
      className="mt-4 inline-flex items-center gap-2 text-[10px] uppercase tracking-[0.25em] font-mono-kali text-zinc-500 hover:text-amber-300 transition-colors"
    >
      {state === "loading" ? (
        <Loader2 size={13} className="animate-spin" />
      ) : state === "playing" ? (
        <Square size={13} />
      ) : (
        <Volume2 size={13} />
      )}
      {state === "loading" ? "summoning" : state === "playing" ? "silence" : "speak"}
    </button>
  );
};

const Utterance = ({ sanskrit, english, guidance, onSpeak, speakState, onKeep, onShare, analyser }) => {
  const iast = sanskrit ? transliterate(sanskrit) : "";
  if (guidance) {
    return (
      <div className="max-w-2xl mx-auto text-left border-l-2 border-amber-500/40 pl-5 py-1">
        <p className="text-[10px] uppercase tracking-[0.3em] text-amber-300/70 font-mono-kali mb-2">
          A grounded word
        </p>
        <p
          data-testid="english-translation"
          className="text-base sm:text-lg text-zinc-200 font-sans font-light leading-relaxed whitespace-pre-wrap"
        >
          {english}
        </p>
        <SpeakButton onSpeak={onSpeak} state={speakState} />
        {speakState === "playing" && analyser && <VoiceWaveform analyser={analyser} />}
      </div>
    );
  }
  return (
    <div className="max-w-2xl mx-auto text-center">
      {sanskrit && (
        <p
          data-testid="sanskrit-text"
          lang="sa"
          className="font-devanagari text-2xl sm:text-3xl lg:text-4xl text-amber-400 leading-relaxed tracking-wide whitespace-pre-wrap drop-shadow-[0_0_14px_rgba(245,158,11,0.28)]"
        >
          {sanskrit}
        </p>
      )}
      {iast && (
        <p
          data-testid="transliteration-text"
          className="mt-3 text-xs sm:text-sm text-amber-200/45 font-mono-kali italic tracking-wide whitespace-pre-wrap"
        >
          {iast}
        </p>
      )}
      {sanskrit && english && (
        <div className="mx-auto my-5 h-px w-40 bg-gradient-to-r from-transparent via-amber-500/40 to-transparent" />
      )}
      {english && (
        <p
          data-testid="english-translation"
          className="text-base sm:text-lg text-zinc-300 font-sans font-light leading-relaxed tracking-wide whitespace-pre-wrap"
        >
          {english}
        </p>
      )}
      <div className="mt-4 flex items-center justify-center gap-5 flex-wrap">
        <SpeakButton onSpeak={onSpeak} state={speakState} />
        {onShare && (
          <button
            data-testid="verse-share-btn"
            onClick={onShare}
            className="inline-flex items-center gap-2 text-[10px] uppercase tracking-[0.25em] font-mono-kali text-zinc-500 hover:text-amber-300 transition-colors"
          >
            share as card
          </button>
        )}
        {onKeep && (
          <button
            data-testid="verse-keep-btn"
            onClick={onKeep}
            className="inline-flex items-center gap-2 text-[10px] uppercase tracking-[0.25em] font-mono-kali text-zinc-500 hover:text-amber-300 transition-colors"
          >
            keep
          </button>
        )}
      </div>
      {speakState === "playing" && analyser && <VoiceWaveform analyser={analyser} />}
    </div>
  );
};

export const DevotionalStream = ({
  messages,
  streaming,
  streamText,
  onSpeak,
  speaking,
  onKeep,
  onShare,
  speakingAnalyser,
}) => {
  const endRef = useRef(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, streamText]);

  return (
    <div
      data-testid="devotional-stream"
      className="kali-scroll w-full max-h-[52vh] overflow-y-auto px-2 space-y-12 py-4"
    >
      {messages.map((m, i) => {
        if (m.role === "user") {
          return (
            <p
              key={i}
              className="text-center text-sm text-zinc-500 font-mono-kali tracking-wide italic"
            >
              — {m.content} —
            </p>
          );
        }
        const parsed = parseReply(m.content);
        const speakText = parsed.guidance
          ? parsed.english
          : `${transliterate(parsed.sanskrit)}. ${parsed.english}`;
        return (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
          >
            <Utterance
              {...parsed}
              onSpeak={onSpeak ? () => onSpeak(i, speakText) : null}
              speakState={speaking?.id === i ? speaking.state : "idle"}
              analyser={speaking?.id === i && speaking.state === "playing" ? speakingAnalyser : null}
              onKeep={!parsed.guidance && onKeep ? () => onKeep(parsed) : null}
              onShare={!parsed.guidance && onShare ? () => onShare(parsed) : null}
            />
          </motion.div>
        );
      })}

      {streaming && (
        <div>
          {(() => {
            const parsed = parseReply(streamText);
            const iast = parsed.sanskrit ? transliterate(parsed.sanskrit) : "";
            return (
              <div className="max-w-2xl mx-auto text-center">
                {parsed.guidance ? (
                  <Utterance {...parsed} />
                ) : (
                  <>
                    {parsed.sanskrit && (
                      <p
                        lang="sa"
                        className="font-devanagari text-2xl sm:text-3xl lg:text-4xl text-amber-400 leading-relaxed tracking-wide whitespace-pre-wrap drop-shadow-[0_0_14px_rgba(245,158,11,0.28)]"
                      >
                        {parsed.sanskrit}
                      </p>
                    )}
                    {iast && (
                      <p className="mt-3 text-xs sm:text-sm text-amber-200/45 font-mono-kali italic tracking-wide whitespace-pre-wrap">
                        {iast}
                      </p>
                    )}
                    {parsed.sanskrit && parsed.english && (
                      <div className="mx-auto my-5 h-px w-40 bg-gradient-to-r from-transparent via-amber-500/40 to-transparent" />
                    )}
                    <p className="text-base sm:text-lg text-zinc-300 font-sans font-light leading-relaxed tracking-wide whitespace-pre-wrap">
                      {parsed.english}
                      {!streamText && (
                        <span className="text-zinc-600 italic">listening…</span>
                      )}
                      <span className="stream-caret" />
                    </p>
                  </>
                )}
              </div>
            );
          })()}
        </div>
      )}
      <div ref={endRef} />
    </div>
  );
};
