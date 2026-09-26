import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { X, Share2, Download, Loader2 } from "lucide-react";
import {
  CARD_STYLES,
  makeLetterCard,
  makeBlessingCard,
  makeAltarCard,
  shareImage,
} from "../lib/card";

export const ShareCardModal = ({ open, onClose, kind, payload }) => {
  const [style, setStyle] = useState("midnight");
  const [url, setUrl] = useState(null);
  const [blob, setBlob] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !payload) return;
    let revoked = null;
    setLoading(true);
    const gen = async () => {
      let b = null;
      if (kind === "letter") b = await makeLetterCard(payload, style);
      else if (kind === "wall") b = await makeAltarCard(payload, style);
      else b = await makeBlessingCard(payload, style);
      setBlob(b);
      if (b) {
        const u = URL.createObjectURL(b);
        revoked = u;
        setUrl(u);
      }
      setLoading(false);
    };
    gen();
    return () => {
      if (revoked) URL.revokeObjectURL(revoked);
    };
  }, [open, style, kind, payload]);

  const doShare = async () => {
    const link =
      kind === "letter"
        ? `${window.location.origin}/?letter=${payload.id}`
        : window.location.origin;
    const title = kind === "letter" ? payload.title : "A blessing from Kali";
    const res = await shareImage(blob, {
      title,
      text: title,
      url: link,
      filename: `kali-${kind}.png`,
    });
    if (res === "copied") toast("Link copied · card saved.", { className: "font-mono-kali" });
    else if (res === "downloaded") toast("Card image saved.", { className: "font-mono-kali" });
  };

  const download = () => {
    if (!blob) return;
    const u = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = u;
    a.download = `kali-${kind}.png`;
    a.click();
    URL.revokeObjectURL(u);
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[70] flex items-center justify-center p-6 bg-black/85 backdrop-blur-md pointer-events-auto"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          data-testid="share-card-modal"
        >
          <motion.div
            initial={{ opacity: 0, y: 18, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 18, scale: 0.97 }}
            transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
            className="relative max-w-sm w-full rounded-2xl bg-zinc-950/95 border border-amber-500/20 p-6"
          >
            <button
              data-testid="share-card-close"
              onClick={onClose}
              className="absolute top-4 right-4 text-zinc-500 hover:text-amber-300 z-10"
              aria-label="Close"
            >
              <X size={18} />
            </button>
            <p className="text-[10px] uppercase tracking-[0.3em] text-amber-200/50 font-mono-kali mb-4 text-center">
              Preview
            </p>
            <div className="relative mx-auto w-[240px] aspect-[1080/1350] rounded-lg overflow-hidden border border-white/10 bg-black mb-5">
              {loading && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <Loader2 className="animate-spin text-amber-500/60" />
                </div>
              )}
              {url && (
                <img
                  data-testid="share-card-preview"
                  src={url}
                  alt="Card preview"
                  className="w-full h-full object-cover"
                />
              )}
            </div>
            <div className="flex justify-center gap-1 p-1 rounded-full bg-white/5 mb-5">
              {CARD_STYLES.map((st) => (
                <button
                  key={st.id}
                  data-testid={`share-style-${st.id}`}
                  onClick={() => setStyle(st.id)}
                  className={`flex-1 py-1.5 rounded-full text-[9px] uppercase tracking-[0.15em] font-mono-kali transition-colors ${
                    style === st.id
                      ? "bg-amber-500/20 text-amber-200"
                      : "text-zinc-500 hover:text-amber-300"
                  }`}
                >
                  {st.label}
                </button>
              ))}
            </div>
            <div className="flex gap-3">
              <button
                data-testid="share-card-share"
                onClick={doShare}
                className="flex-1 inline-flex items-center justify-center gap-2 py-2.5 rounded-full border border-amber-500/40 text-amber-200 text-[10px] uppercase tracking-[0.25em] font-mono-kali hover:bg-amber-500/10 transition-colors"
              >
                <Share2 size={14} /> Share
              </button>
              <button
                data-testid="share-card-download"
                onClick={download}
                className="inline-flex items-center justify-center gap-2 py-2.5 px-4 rounded-full border border-white/10 text-zinc-300 text-[10px] uppercase tracking-[0.25em] font-mono-kali hover:border-amber-500/40 hover:text-amber-300 transition-colors"
              >
                <Download size={14} />
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
