export interface SourceViewState {
  anchor: number;
  head: number;
  scrollTop: number;
  scrollLeft: number;
}

export interface PreviewViewState {
  scrollTop: number;
}

export interface WysiwygViewState {
  from: number;
  to: number;
  scrollTop: number;
}

export interface TabViewState {
  source?: SourceViewState;
  preview?: PreviewViewState;
  wysiwyg?: WysiwygViewState;
}
