export const UNTITLED_NAME = "未命名.md";
export const UNTITLED_NAME_REGEX = /^未命名(?: (\d+))?\.md$/;

export interface MinimalTabLike {
  id?: string | null;
  path?: string | null;
  name: string;
  content?: string;
  saved?: boolean;
  pinned?: boolean;
}

export function getFileName(path: string): string {
  return path.replace(/\\/g, "/").split("/").pop() || UNTITLED_NAME;
}

export function getNextUntitledName(existingTabs: Array<Pick<MinimalTabLike, "name">>): string {
  const usedNumbers = new Set<number>();

  for (const tab of existingTabs) {
    const match = tab.name.match(UNTITLED_NAME_REGEX);
    if (!match) continue;
    usedNumbers.add(match[1] ? Number.parseInt(match[1], 10) : 1);
  }

  let nextNumber = 1;
  while (usedNumbers.has(nextNumber)) {
    nextNumber += 1;
  }

  return nextNumber === 1 ? UNTITLED_NAME : `未命名 ${nextNumber}.md`;
}

export function isPlaceholderTab(tab: Pick<MinimalTabLike, "path" | "content" | "saved" | "pinned">): boolean {
  return !tab.path && !(tab.content ?? "").trim() && Boolean(tab.saved) && !tab.pinned;
}

export function shouldReplacePlaceholder(
  tabs: Array<Pick<MinimalTabLike, "path" | "content" | "saved" | "pinned">>
): boolean {
  return tabs.length === 1 && isPlaceholderTab(tabs[0]);
}

export function selectNextActive<T extends Pick<MinimalTabLike, "id">>(
  currentTabs: T[],
  closingIds: string[],
  currentActiveId: string | null
): string | null {
  const closingSet = new Set(closingIds);
  const nextTabs = currentTabs.filter((tab) => tab.id && !closingSet.has(tab.id));
  if (nextTabs.length === 0) return null;

  const activeClosed = currentActiveId !== null && closingSet.has(currentActiveId);
  const activeIndex = currentTabs.findIndex((tab) => tab.id === currentActiveId);
  const fallbackIndex = activeIndex >= 0 ? Math.min(activeIndex, nextTabs.length - 1) : 0;

  return activeClosed
    ? nextTabs[fallbackIndex]?.id ?? nextTabs[nextTabs.length - 1]?.id ?? null
    : nextTabs.find((tab) => tab.id === currentActiveId)?.id ?? nextTabs[0]?.id ?? null;
}

export function filterRecoveredUntitledDocs<
  RecoveredTab extends Pick<MinimalTabLike, "id">,
  ExistingTab extends Pick<MinimalTabLike, "id">
>(
  recoveredDocs: RecoveredTab[],
  existingTabs: ExistingTab[]
): RecoveredTab[] {
  if (recoveredDocs.length === 0) return [];

  const existingIds = new Set(existingTabs.map((tab) => tab.id).filter(Boolean));
  return recoveredDocs.filter((doc) => doc.id && !existingIds.has(doc.id));
}
