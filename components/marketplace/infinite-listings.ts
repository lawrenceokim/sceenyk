export function appendUniqueListings<T extends { id: string }>(previous: T[], next: T[]): T[] {
  const seen = new Set(previous.map(item => item.id));
  return [...previous, ...next.filter(item => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  })];
}

export function listingScrollRoot(target: Element): Element | null {
  let parent = target.parentElement;
  while (parent) {
    if (/auto|scroll/.test(getComputedStyle(parent).overflowY)) return parent;
    parent = parent.parentElement;
  }
  return null;
}
