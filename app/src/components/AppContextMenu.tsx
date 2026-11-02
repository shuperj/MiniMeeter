import ContextMenu, { contextDividerCls, contextItemCls } from "./ContextMenu";

interface AppContextMenuProps {
  x: number;
  y: number;
  /** Current control style; the menu offers the other one. */
  knobMode: boolean;
  /** The mixer is hidden, leaving just the background and titlebar. */
  uiHidden: boolean;
  connected: boolean;
  onUnity: () => void;
  onToggleControls: () => void;
  onToggleUi: () => void;
  onOpenApps: () => void;
  onOpenSettings: () => void;
  onClose: () => void;
}

/** The right-click menu for the main window, replacing the WebView's own. */
export default function AppContextMenu({
  x,
  y,
  knobMode,
  uiHidden,
  connected,
  onUnity,
  onToggleControls,
  onToggleUi,
  onOpenApps,
  onOpenSettings,
  onClose,
}: AppContextMenuProps) {
  const run = (action: () => void) => () => {
    onClose();
    action();
  };

  return (
    <ContextMenu x={x} y={y} onClose={onClose}>
      <button role="menuitem" className={contextItemCls} disabled={!connected} onClick={run(onUnity)}>
        Unity (0dB all)
      </button>
      <button role="menuitem" className={contextItemCls} onClick={run(onToggleControls)}>
        {knobMode ? "Switch to faders" : "Switch to knobs"}
      </button>
      <button role="menuitem" className={contextItemCls} onClick={run(onToggleUi)}>
        {uiHidden ? "Show UI" : "Hide UI"}
      </button>
      <div className={contextDividerCls} />
      <button role="menuitem" className={contextItemCls} onClick={run(onOpenApps)}>
        App view
      </button>
      <button role="menuitem" className={contextItemCls} onClick={run(onOpenSettings)}>
        Settings
      </button>
    </ContextMenu>
  );
}
