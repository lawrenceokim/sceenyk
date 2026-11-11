let viewport: HTMLDivElement | null = null;
let users = 0, observer: MutationObserver | undefined, frame: number | undefined;
const listeners = new Set<() => void>();
export const subscribeViewport = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
export const readViewport = () => viewport;

function sync() {
  frame = undefined;
  if (!viewport) return;
  const selector = typeof CSS !== "undefined" && CSS.supports("selector(dialog:modal)")
    ? "dialog:modal, [role='dialog'][aria-modal='true'], [role='alertdialog'][aria-modal='true']"
    : "dialog[open], [role='dialog'][aria-modal='true'], [role='alertdialog'][aria-modal='true']";
  const dialogs = [...document.querySelectorAll<HTMLElement>(selector)]
    .filter(element => element.getClientRects().length && !element.closest("[data-notification-viewport]"));
  const target = dialogs.at(-1) ?? document.body;
  if (viewport.parentElement !== target) {
    if (typeof viewport.hidePopover === "function" && viewport.matches(":popover-open")) viewport.hidePopover();
    target.append(viewport);
  }
  // Dialog isolation may have marked this node while it was a body sibling.
  // It now belongs to the active dialog, so restore its own accessibility.
  viewport.removeAttribute("aria-hidden");
  viewport.removeAttribute("inert");
  // A manual popover uses the browser top layer without a backdrop, focus
  // transfer or a modal interaction lock. Older browsers keep the DOM portal.
  if (typeof viewport.showPopover === "function") {
    if (viewport.childElementCount && !viewport.matches(":popover-open")) { try { viewport.showPopover(); } catch {} }
    else if (!viewport.childElementCount && viewport.matches(":popover-open")) viewport.hidePopover();
  }
}
function schedule() { if (frame === undefined) frame = requestAnimationFrame(sync); }
export function mountNotificationViewport() {
  users++;
  if (!viewport) {
    viewport = document.createElement("div");
    viewport.dataset.notificationViewport = "";
    viewport.setAttribute("popover", "manual");
    viewport.setAttribute("role", "region"); viewport.setAttribute("aria-label", "Notifications");
    viewport.className = "fixed inset-auto top-4 right-4 z-[120] m-0 flex max-h-[calc(100dvh_-_2rem)] w-[calc(100%_-_2rem)] max-w-sm flex-col gap-3 overflow-y-auto border-0 bg-transparent p-0 text-foreground shadow-none pointer-events-none [color-scheme:inherit]";
    document.body.append(viewport);
    observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["open", "aria-modal", "aria-hidden", "inert", "style"] });
    document.addEventListener("toggle", schedule, true);
    sync(); listeners.forEach(listener => listener());
  }
  return () => {
    if (--users > 0) return;
    observer?.disconnect(); document.removeEventListener("toggle", schedule, true);
    if (frame !== undefined) cancelAnimationFrame(frame);
    frame = undefined; viewport?.remove(); viewport = null;
    listeners.forEach(listener => listener());
  };
}
