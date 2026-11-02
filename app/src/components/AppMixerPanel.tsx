import { useEffect, useRef, useState, type CSSProperties } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { ChannelConfig } from "../config";
import type { EditionInfo } from "../types/edition";
import { useAppSessions } from "../hooks/useAppSessions";
import { useHiddenApps } from "../hooks/useHiddenApps";
import { hideKey, buildScopes } from "../lib/hiddenApps";
import { splitRows } from "../lib/appRows";
import { medText, panelSurfaceStyle, smallText } from "./settings/shared";
import AppSessionRow from "./AppSessionRow";

interface AppMixerPanelProps {
  open: boolean;
  onClose: () => void;
  channels: ChannelConfig[];
  edition: EditionInfo;
  connected: boolean;
}

/**
 * Slide-over listing the apps playing into Voicemeeter's inputs, grouped by the
 * strip each virtual input feeds. Idle and hidden apps wait behind "Show more"
 * (see lib/appRows). Sits under the titlebar (z-44 < z-45) so the titlebar button
 * that opened it can close it too.
 */
export default function AppMixerPanel({ open, onClose, channels, edition, connected }: AppMixerPanelProps) {
  const { endpoints, levels, error, loaded, setVolume, setMute, startDragging, stopDragging } =
    useAppSessions(open && connected);
  const { isHidden, hide, unhide, migrate, loaded: hiddenLoaded } = useHiddenApps();
  const [showMore, setShowMore] = useState(false);
  // Apps heard since the panel opened, so a pause doesn't pull a row out from
  // under the cursor.
  const seenPlaying = useRef(new Set<string>());

  useEffect(() => {
    if (!open) {
      seenPlaying.current.clear();
      setShowMore(false);
      return;
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, onClose]);

  // Hide scopes come from every endpoint, not just the routed ones, so a
  // hardware input's number doesn't shift when the edition changes.
  const scopes = buildScopes(endpoints);
  const scopeOf = (ep: { endpoint: string }) => scopes.get(ep.endpoint) ?? ep.endpoint;

  // One-shot upgrade of entries saved when hiding was global.
  const scopeList = [...scopes.values()].join(",");
  useEffect(() => {
    if (!hiddenLoaded || !scopeList) return;
    migrate(scopeList.split(","));
  }, [hiddenLoaded, scopeList, migrate]);

  // Endpoints the running edition actually routes somewhere.
  const routed = endpoints.filter((e) => e.strip !== null);
  for (const s of routed.flatMap((e) => e.sessions)) {
    if (s.state === "active") seenPlaying.current.add(s.key);
  }

  const groups = routed.map((ep) => {
    const scope = scopeOf(ep);
    const { main, more } = splitRows(ep.sessions, (s) => isHidden(hideKey(scope, s)), seenPlaying.current);
    return { ep, scope, main, more };
  });
  const mainCount = groups.reduce((n, g) => n + g.main.length, 0);
  const moreCount = groups.reduce((n, g) => n + g.more.length, 0);

  const groupLabel = (strip: number, fallback: string) =>
    channels.find((c) => c.strip === strip)?.label ?? edition.strips[strip]?.label ?? fallback;

  const noteCls = `${smallText} text-white/60 m-0`;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="absolute inset-x-0 bottom-0 top-[clamp(24px,8dvh,36px)] z-[44] flex flex-col overflow-hidden"
          style={panelSurfaceStyle as CSSProperties}
          initial={{ y: "100%" }}
          animate={{ y: 0 }}
          exit={{ y: "100%" }}
          transition={{ type: "spring", stiffness: 320, damping: 32 }}
        >
          <div className="absolute inset-0 bg-[#17171a]" onClick={onClose} />

          <div className="relative flex flex-col flex-1 w-full max-w-[640px] mx-auto min-h-0 p-[clamp(8px,2vw,16px)] gap-[clamp(6px,1.5dvh,10px)]">
            <div className="flex items-center justify-between shrink-0">
              <span className="text-[clamp(0.8rem,2.5vw,0.95rem)] font-bold text-white/90">Apps</span>
              <button
                className="text-white/60 hover:text-white/90 text-[clamp(0.7rem,2vw,1rem)] bg-transparent border-none cursor-pointer p-1"
                onClick={onClose}
                title="Close (Esc)"
              >
                ✕
              </button>
            </div>

            <div className="flex-1 overflow-y-auto min-h-0 flex flex-col gap-[clamp(6px,1.5dvh,10px)]">
              {!connected && <p className={noteCls}>Connect to Voicemeeter first.</p>}
              {connected && error && (
                <p className={`${smallText} text-amber-300 m-0`}>Couldn't read Windows audio sessions: {error}</p>
              )}
              {connected && !error && loaded && routed.length === 0 && (
                <p className={noteCls}>
                  No Voicemeeter input devices found. Are the Voicemeeter virtual audio drivers installed?
                </p>
              )}
              {connected && !error && loaded && routed.length > 0 && mainCount === 0 && (
                <p className={noteCls}>
                  {moreCount > 0 ? "Nothing is playing right now." : "No apps are using Voicemeeter's inputs right now."}
                </p>
              )}

              {groups.map(({ ep, scope, main, more }) => {
                const rows = showMore ? [...main, ...more] : main;
                if (rows.length === 0) return null;
                return (
                  <section key={ep.endpoint} className="bg-white/5 rounded-[4px] overflow-hidden shrink-0">
                    <header
                      className={`${medText} font-semibold text-white/95 px-[clamp(6px,1.2vw,10px)] pt-[clamp(5px,1vw,8px)] pb-[2px] truncate`}
                    >
                      {groupLabel(ep.strip!, ep.endpoint)}
                    </header>
                    {rows.map((s) => {
                      const key = hideKey(scope, s);
                      const hidden = isHidden(key);
                      return (
                        <AppSessionRow
                          key={s.key}
                          session={s}
                          peak={levels.get(s.key) ?? s.peak}
                          hidden={hidden}
                          onVolume={(v) => setVolume(s.key, v)}
                          onMute={(m) => setMute(s.key, m)}
                          onToggleHidden={() => (hidden ? unhide(key) : hide(key))}
                          onDragStart={() => startDragging(s.key)}
                          onDragEnd={() => stopDragging(s.key)}
                        />
                      );
                    })}
                  </section>
                );
              })}

              {moreCount > 0 && (
                <button
                  className={`${smallText} self-center shrink-0 bg-white/10 hover:bg-white/15 border-none rounded-[3px] px-[clamp(8px,1.5vw,12px)] py-[3px] cursor-pointer text-white/80`}
                  onClick={() => setShowMore((v) => !v)}
                  aria-pressed={showMore}
                  title="Apps that aren't playing, and any you've hidden"
                >
                  {showMore ? "Show less" : `Show ${moreCount} more`}
                </button>
              )}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
