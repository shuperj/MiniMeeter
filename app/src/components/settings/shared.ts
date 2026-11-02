/** Class strings shared by every Settings tab so they read as one surface. */
/** On a full-window panel: dark native controls, and an accent that stays visible
 *  on the panel's background however dark the user's own accent is. */
export const panelSurfaceStyle = {
  colorScheme: "dark",
  "--accent": "var(--accent-ui)",
  "--accent-fg": "var(--accent-ui-fg)",
};
export const inputCls =
  "bg-white/10 border border-white/20 rounded-[3px] text-white/90 outline-none focus:border-[var(--accent)]";
export const smallText = "text-[clamp(0.6875rem,1.6vw,0.75rem)]";
export const medText = "text-[clamp(0.75rem,1.8vw,0.8125rem)]";
export const rowLabelCls = "w-[clamp(44px,12vw,64px)] shrink-0 text-white/65";
/** Label column of a Style-tab SettingRow: wider than rowLabelCls so
 *  "Accent color" / "Reactivity" fit, and allowed to wrap onto two lines. */
export const settingLabelCls = "w-[clamp(56px,15vw,88px)] shrink-0 text-white/65 leading-tight";
export const sliderCls = "flex-1 min-w-[clamp(40px,10vw,80px)] accent-[var(--accent)] cursor-pointer";
/** Fixed-width numeric readout beside a slider. */
export const sliderValueCls = "tabular-nums w-[4ch] text-right shrink-0";
export const swatchCls =
  "w-[clamp(20px,4vw,28px)] h-[clamp(16px,3vw,22px)] border border-white/20 rounded-[2px] cursor-pointer bg-transparent p-0 shrink-0";
export const sectionCls =
  "bg-white/5 rounded-[4px] p-[clamp(4px,1vw,8px)] flex flex-col gap-[clamp(2px,0.5dvh,4px)] shrink-0";
export const addButtonCls = `flex items-center justify-center gap-1 bg-white/10 hover:bg-white/15 border border-dashed border-white/20 rounded-[4px] ${medText} text-white/70 py-[clamp(4px,0.8dvh,8px)] cursor-pointer shrink-0`;
export const removeButtonCls =
  "text-red-400/70 hover:text-red-400 bg-transparent border-none cursor-pointer text-[clamp(0.6rem,1.8vw,0.8rem)] p-0 shrink-0";
export const arrowButtonCls =
  "bg-transparent border-none cursor-pointer text-white/40 hover:text-white/80 text-[clamp(0.5rem,1.2vw,0.65rem)] leading-none p-0 disabled:opacity-20 disabled:cursor-default";
