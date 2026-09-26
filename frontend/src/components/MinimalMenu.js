import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Menu,
  X,
  RotateCcw,
  Download,
  Trash2,
  Volume2,
  VolumeX,
  Sparkles,
  Eye,
  EyeOff,
  Square,
  LogIn,
  LogOut,
  Flame,
  ScrollText,
  AudioLines,
  MailPlus,
} from "lucide-react";

const Item = ({ testid, icon: Icon, label, onClick, active }) => (
  <button
    data-testid={testid}
    onClick={onClick}
    className={`flex items-center gap-3 w-full px-4 py-2.5 text-left text-xs uppercase tracking-[0.2em] font-mono-kali transition-colors ${
      active ? "text-amber-300" : "text-zinc-400 hover:text-amber-300"
    } hover:bg-amber-500/5`}
  >
    <Icon size={15} className="shrink-0" />
    {label}
  </button>
);

export const MinimalMenu = ({
  onStop,
  onReset,
  onExport,
  onClear,
  audioOn,
  onToggleAudio,
  constellationOn,
  onToggleConstellation,
  reducedMotion,
  onToggleMotion,
  streaming,
  user,
  onSignIn,
  onSignOut,
  onDeleteAltar,
  onOpenLetters,
  autoplayOn,
  onToggleAutoplay,
  dailyReminderOn,
  onToggleDailyReminder,
  onOpenReminder,
  onOpenBlessings,
}) => {
  const [open, setOpen] = useState(false);

  return (
    <div className="pointer-events-auto">
      <button
        data-testid="minimal-menu-btn"
        onClick={() => setOpen((o) => !o)}
        aria-label="Session menu"
        className="p-2.5 rounded-full text-zinc-400 hover:text-amber-300 hover:bg-white/5 transition-colors"
      >
        {open ? <X size={20} /> : <Menu size={20} />}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.97 }}
            transition={{ duration: 0.2 }}
            className="absolute right-0 mt-2 w-60 rounded-xl bg-zinc-950/90 backdrop-blur-xl border border-amber-500/15 py-2 shadow-2xl shadow-black"
          >
            <p className="px-4 py-1 text-[9px] uppercase tracking-[0.3em] text-amber-200/40 font-mono-kali">
              Saved Altar
            </p>
            {user ? (
              <>
                <p
                  data-testid="menu-user-email"
                  className="px-4 pb-1 text-[10px] text-amber-200/70 font-mono-kali truncate"
                >
                  {user.email}
                </p>
                <Item testid="menu-signout-btn" icon={LogOut} label="Sign out" onClick={() => { onSignOut(); setOpen(false); }} />
                <Item testid="menu-blessings-btn" icon={Sparkles} label="My blessings" onClick={() => { onOpenBlessings(); setOpen(false); }} />
                <Item testid="menu-reminder-toggle" icon={MailPlus} label={dailyReminderOn ? "Daily letter email: on" : "Daily letter email"} active={dailyReminderOn} onClick={() => { onOpenReminder(); setOpen(false); }} />
                <Item testid="menu-delete-altar-btn" icon={Flame} label="Delete saved altar" onClick={() => { onDeleteAltar(); setOpen(false); }} />
              </>
            ) : (
              <Item testid="menu-signin-btn" icon={LogIn} label="Save & sync thread" onClick={() => { onSignIn(); setOpen(false); }} />
            )}
            <div className="my-1.5 h-px bg-white/5" />
            <Item testid="menu-letters-btn" icon={ScrollText} label="Letters to Humanity" onClick={() => { onOpenLetters(); setOpen(false); }} />
            <div className="my-1.5 h-px bg-white/5" />
            <p className="px-4 py-1 text-[9px] uppercase tracking-[0.3em] text-amber-200/40 font-mono-kali">
              Session
            </p>
            {streaming && (
              <Item testid="menu-stop-btn" icon={Square} label="Stop generation" onClick={() => { onStop(); }} />
            )}
            <Item testid="menu-reset-btn" icon={RotateCcw} label="Start afresh" onClick={() => { onReset(); setOpen(false); }} />
            <Item testid="menu-export-btn" icon={Download} label="Export session" onClick={() => { onExport(); }} />
            <Item testid="menu-clear-btn" icon={Trash2} label="Clear session" onClick={() => { onClear(); setOpen(false); }} />
            <div className="my-1.5 h-px bg-white/5" />
            <p className="px-4 py-1 text-[9px] uppercase tracking-[0.3em] text-amber-200/40 font-mono-kali">
              Sky
            </p>
            <Item testid="menu-audio-toggle" icon={audioOn ? Volume2 : VolumeX} label={audioOn ? "Silence the drone" : "Ambient drone"} active={audioOn} onClick={onToggleAudio} />
            <Item testid="menu-autoplay-toggle" icon={AudioLines} label={autoplayOn ? "Autoplay: on" : "Autoplay her voice"} active={autoplayOn} onClick={onToggleAutoplay} />
            <Item testid="menu-motion-toggle" icon={Sparkles} label={reducedMotion ? "Enable motion" : "Reduce motion"} active={reducedMotion} onClick={onToggleMotion} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
