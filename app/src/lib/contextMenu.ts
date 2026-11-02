/** Gap kept between a context menu and the window edge. */
const EDGE_GAP = 4;

/** Where to put a menu opened at (x, y) so all of it stays inside the window. */
export function fitMenu(
  x: number,
  y: number,
  menu: { width: number; height: number },
  windowSize: { width: number; height: number },
): { left: number; top: number } {
  return {
    left: Math.max(EDGE_GAP, Math.min(x, windowSize.width - menu.width - EDGE_GAP)),
    top: Math.max(EDGE_GAP, Math.min(y, windowSize.height - menu.height - EDGE_GAP)),
  };
}

/** Text fields keep the native menu, which is how you paste into them. */
export function wantsNativeMenu(target: Element): boolean {
  return target.closest("textarea, input:not([type]), input[type='text'], input[type='number']") !== null;
}
