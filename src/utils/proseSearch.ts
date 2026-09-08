import type { Node as ProseNode } from "@milkdown/prose/model";
import type { EditorSearchMatch } from "../types/editorSearch";
import { findTextMatches } from "./textSearch";

interface TextSegment {
  textFrom: number;
  textTo: number;
  docFrom: number;
  docTo: number;
}

function collectTextSegments(doc: ProseNode): { text: string; segments: TextSegment[] } {
  const segments: TextSegment[] = [];
  let text = "";
  let previousDocTo: number | null = null;

  doc.descendants((node, pos) => {
    if (!node.isText || !node.text) return;

    if (previousDocTo !== null && pos > previousDocTo) {
      text += "\n";
    }

    const textFrom = text.length;
    text += node.text;
    const textTo = text.length;

    segments.push({
      textFrom,
      textTo,
      docFrom: pos,
      docTo: pos + node.text.length,
    });

    previousDocTo = pos + node.text.length;
  });

  return { text, segments };
}

function findSegment(segments: TextSegment[], offset: number): TextSegment | null {
  for (const segment of segments) {
    if (offset >= segment.textFrom && offset < segment.textTo) {
      return segment;
    }
  }

  return null;
}

export function findProseMatches(
  doc: ProseNode,
  query: string,
  caseSensitive: boolean
): EditorSearchMatch[] {
  const { text, segments } = collectTextSegments(doc);
  if (!query || segments.length === 0) return [];

  const textMatches = findTextMatches(text, query, caseSensitive);
  const matches: EditorSearchMatch[] = [];

  for (const textMatch of textMatches) {
    const startSegment = findSegment(segments, textMatch.from);
    const endSegment = findSegment(segments, textMatch.to - 1);
    if (!startSegment || !endSegment) continue;

    matches.push({
      from: startSegment.docFrom + (textMatch.from - startSegment.textFrom),
      to: endSegment.docFrom + (textMatch.to - endSegment.textFrom),
    });
  }

  return matches;
}
