import { useState, useEffect } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";

export function useWindowFocus(): boolean {
  const [focused, setFocused] = useState(true);

  useEffect(() => {
    const appWindow = getCurrentWindow();
    const unlisten = appWindow.onFocusChanged(({ payload }) => {
      setFocused(payload);
    });
    return () => { unlisten.then((fn) => fn()); };
  }, []);

  return focused;
}
