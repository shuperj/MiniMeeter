import { motion, AnimatePresence } from "framer-motion";

interface MuteButtonProps {
  muted: boolean;
  onToggle: () => void;
}

export default function MuteButton({ muted, onToggle }: MuteButtonProps) {
  return (
    <motion.button
      className="flex items-center justify-center rounded-[3px] px-[clamp(4px,1vw,8px)] py-[clamp(1px,0.3dvh,3px)] text-[clamp(0.5rem,1.8vw,0.7rem)] font-semibold cursor-pointer border-none outline-none"
      style={{
        backgroundColor: muted ? "rgba(239,68,68,0.8)" : "rgba(255,255,255,0.1)",
        color: muted ? "#fff" : "rgba(255,255,255,0.7)",
      }}
      onClick={onToggle}
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
      animate={{
        backgroundColor: muted ? "rgba(239,68,68,0.8)" : "rgba(255,255,255,0.1)",
      }}
      transition={{ duration: 0.15 }}
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={muted ? "muted" : "unmuted"}
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.8 }}
          transition={{ duration: 0.1 }}
        >
          {muted ? "Muted" : "Mute"}
        </motion.span>
      </AnimatePresence>
    </motion.button>
  );
}
