import { useEffect, useRef } from "react";

// Live golden waveform driven by an AnalyserNode while Kali speaks.
export const VoiceWaveform = ({ analyser }) => {
  const barsRef = useRef([]);
  const rafRef = useRef(null);
  const N = 15;

  useEffect(() => {
    if (!analyser) return;
    const data = new Uint8Array(analyser.frequencyBinCount);
    const tick = () => {
      analyser.getByteFrequencyData(data);
      for (let i = 0; i < N; i++) {
        const idx = Math.min(data.length - 1, Math.floor((i / N) * data.length));
        const v = data[idx] / 255;
        const el = barsRef.current[i];
        if (el) el.style.transform = `scaleY(${0.18 + v * 2.4})`;
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    tick();
    return () => rafRef.current && cancelAnimationFrame(rafRef.current);
  }, [analyser]);

  return (
    <div
      data-testid="voice-waveform"
      className="mt-4 flex h-8 items-center justify-center gap-[3px]"
      aria-hidden="true"
    >
      {Array.from({ length: N }).map((_, i) => (
        <span
          key={i}
          ref={(el) => (barsRef.current[i] = el)}
          className="w-[3px] h-5 rounded-full bg-gradient-to-b from-amber-200 via-amber-400 to-amber-500 origin-center"
          style={{
            transform: "scaleY(0.2)",
            transition: "transform 70ms linear",
            filter: "drop-shadow(0 0 4px rgba(245,158,11,0.55))",
          }}
        />
      ))}
    </div>
  );
};
