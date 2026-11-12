export type NoticeTone = "info" | "success" | "warning" | "error";
type Group = { members: Set<string>; dismissed: boolean };

// Presentation state only. No balances, auth tokens, persistence or application actions.
export class NotificationRegistry {
  private groups = new Map<string, Group>();
  private listeners = new Set<() => void>();
  readonly subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private emit() { this.listeners.forEach(listener => listener()); }
  register(id: string, key: string) {
    let group = this.groups.get(key);
    if (!group) { group = { members: new Set(), dismissed: false }; this.groups.set(key, group); }
    const registered = group;
    group.members.add(id); this.emit();
    return () => {
      if (this.groups.get(key) !== registered) return;
      registered.members.delete(id);
      if (!registered.members.size) this.groups.delete(key);
      this.emit();
    };
  }
  visible(id: string, key: string) {
    const group = this.groups.get(key);
    return !!group && !group.dismissed && group.members.values().next().value === id &&
      [...this.groups].filter(([, item]) => !item.dismissed).slice(0, 3).some(([name]) => name === key);
  }
  dismiss(key: string) { const group = this.groups.get(key); if (group) { group.dismissed = true; this.emit(); } }
  clear() { this.groups.clear(); this.emit(); }
}

export const notificationRegistry = new NotificationRegistry();
export type NoticeEvent = { id: number; message: string; tone: NoticeTone };
let events: NoticeEvent[] = [], sequence = 0;
const listeners = new Set<() => void>();
export const subscribeNotices = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
export const readNotices = () => events;
export function notify(message: string, tone: NoticeTone = "info") {
  if (!message.trim()) return;
  events = [...events.filter(event => event.message !== message || event.tone !== tone), { id: ++sequence, message, tone }].slice(-12);
  listeners.forEach(listener => listener());
}
export function dismissNotice(id: number) { events = events.filter(event => event.id !== id); listeners.forEach(listener => listener()); }
export function clearNotices() { events = []; notificationRegistry.clear(); listeners.forEach(listener => listener()); }
