import { useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { parseReply } from "../lib/api";

const Utterance = ({ sanskrit, english, guidance }) => {
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
    </div>
  );
};

export const DevotionalStream = ({ messages, streaming, streamText }) => {
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
        return (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
          >
            <Utterance {...parsed} />
          </motion.div>
        );
      })}

      {streaming && (
        <div>
          {(() => {
            const parsed = parseReply(streamText);
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
