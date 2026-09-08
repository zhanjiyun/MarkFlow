import type { EditorSearchMatch } from "../types/editorSearch";

function normalizeQuery(query: string, caseSensitive: boolean): string {
  return caseSensitive ? query : query.toLocaleLowerCase();
}

function normalizeText(text: string, caseSensitive: boolean): string {
  return caseSensitive ? text : text.toLocaleLowerCase();
}

export function findTextMatches(
  text: string,
  query: string,
  caseSensitive: boolean
): EditorSearchMatch[] {
  const needle = normalizeQuery(query, caseSensitive);
  if (!needle) return [];

  const haystack = normalizeText(text, caseSensitive);
  const matches: EditorSearchMatch[] = [];

  let from = 0;
  while (from <= haystack.length - needle.length) {
    const index = haystack.indexOf(needle, from);
    if (index === -1) break;

    matches.push({ from: index, to: index + needle.length });
    from = index + Math.max(needle.length, 1);
  }

  return matches;
}
