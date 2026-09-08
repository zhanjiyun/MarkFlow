export interface EditorSearchMatch {
  from: number;
  to: number;
}

export interface EditorSearchSelectOptions {
  focus?: boolean;
}

export interface SearchableEditorHandle {
  canReplace: boolean;
  focus: () => void;
  findMatches: (query: string, caseSensitive: boolean) => EditorSearchMatch[];
  selectMatch: (match: EditorSearchMatch, options?: EditorSearchSelectOptions) => boolean;
  replaceMatch: (match: EditorSearchMatch, replacement: string) => EditorSearchMatch | null;
  replaceAll: (query: string, replacement: string, caseSensitive: boolean) => number;
}
