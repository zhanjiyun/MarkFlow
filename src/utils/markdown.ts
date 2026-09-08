import DOMPurify from "dompurify";
import MarkdownIt from "markdown-it";
import type Token from "markdown-it/lib/token.mjs";
import mk from "@traptitech/markdown-it-katex";
import footnote from "markdown-it-footnote";
import mark from "markdown-it-mark";
import sub from "markdown-it-sub";
import sup from "markdown-it-sup";
import taskLists from "markdown-it-task-lists";
import { full as emoji } from "markdown-it-emoji";
import YAML from "yaml";

export interface TocItem {
  id: string;
  text: string;
  level: number;
}

interface FrontmatterResult {
  html: string;
  content: string;
}

type MarkdownOptions = typeof md.options;

const md = new MarkdownIt({
  html: true,
  breaks: false,
  linkify: true,
  typographer: false,
  xhtmlOut: true,
})
  .use(mk, { throwOnError: false, errorColor: "#cc0000" })
  .use(taskLists, { enabled: true, label: true, labelAfter: true })
  .use(footnote)
  .use(mark)
  .use(sub)
  .use(sup)
  .use(emoji);

const originalHeadingOpen = md.renderer.rules.heading_open;
md.renderer.rules.heading_open = (tokens, idx, options, env, self): string => {
  const text = getHeadingTextFromTokens(tokens, idx, options, env);
  const id = makeId(text);
  if (id) {
    tokens[idx].attrSet("id", id);
  }

  if (originalHeadingOpen) {
    return originalHeadingOpen(tokens, idx, options, env, self);
  }

  return self.renderToken(tokens, idx, options);
};

const originalLinkOpen = md.renderer.rules.link_open;
md.renderer.rules.link_open = (tokens, idx, options, env, self): string => {
  const href = tokens[idx].attrGet("href") ?? "";
  if (href && !href.startsWith("#")) {
    tokens[idx].attrSet("target", "_blank");
    tokens[idx].attrSet("rel", "noopener noreferrer");
  }

  if (originalLinkOpen) {
    return originalLinkOpen(tokens, idx, options, env, self);
  }

  return self.renderToken(tokens, idx, options);
};

function makeId(rawText: string): string {
  return rawText
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
    .replace(/[^\w\u4e00-\u9fff]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function getHeadingTextFromTokens(
  tokens: Token[],
  idx: number,
  options: MarkdownOptions,
  env: unknown
): string {
  const inlineToken = tokens[idx + 1];
  const children = inlineToken?.children ?? [];
  return md.renderer.renderInlineAsText(children, options, env).replace(/\s+/g, " ").trim();
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function stripBom(input: string): string {
  return input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;
}

function splitFrontmatter(markdown: string): FrontmatterResult {
  const source = stripBom(markdown);
  if (!source.startsWith("---")) {
    return { html: "", content: markdown };
  }

  const normalized = source.replace(/\r\n/g, "\n");
  if (!normalized.startsWith("---\n")) {
    return { html: "", content: markdown };
  }

  const endMatch = normalized.slice(4).match(/\n---(?:\n|$)/);
  if (!endMatch || endMatch.index == null) {
    return { html: "", content: markdown };
  }

  const yamlStart = 4;
  const yamlEnd = yamlStart + endMatch.index;
  const yamlText = normalized.slice(yamlStart, yamlEnd);
  const contentStart = yamlEnd + endMatch[0].length;
  const content = normalized.slice(contentStart);

  try {
    const parsed = YAML.parse(yamlText);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { html: "", content: normalized };
    }

    const rows = Object.entries(parsed)
      .map(([key, value]) => renderFrontmatterRow(key, value))
      .join("");

    if (!rows) {
      return { html: "", content };
    }

    return {
      html: `<div class="frontmatter">${rows}</div>`,
      content,
    };
  } catch {
    return { html: "", content: normalized };
  }
}

function renderFrontmatterRow(key: string, value: unknown): string {
  const renderedValue = renderFrontmatterValue(value);
  if (!renderedValue) {
    return "";
  }

  return `<div class="fm-row"><span class="fm-key">${escapeHtml(key)}</span><span class="fm-val">${renderedValue}</span></div>`;
}

function renderFrontmatterValue(value: unknown): string {
  if (value == null) {
    return '<span class="fm-empty">null</span>';
  }

  if (Array.isArray(value)) {
    if (value.length === 0) {
      return '<span class="fm-empty">[]</span>';
    }

    const items = value
      .map((item) => `<li>${renderFrontmatterValue(item)}</li>`)
      .join("");
    return `<ul class="fm-list">${items}</ul>`;
  }

  if (typeof value === "object") {
    const entries = Object.entries(value);
    if (entries.length === 0) {
      return '<span class="fm-empty">{}</span>';
    }

    const rows = entries
      .map(
        ([nestedKey, nestedValue]) =>
          `<div class="fm-nested-row"><span class="fm-nested-key">${escapeHtml(nestedKey)}</span><span class="fm-nested-val">${renderFrontmatterValue(nestedValue)}</span></div>`
      )
      .join("");
    return `<div class="fm-nested">${rows}</div>`;
  }

  if (typeof value === "string") {
    return escapeHtml(value).replace(/\n/g, "<br />");
  }

  return escapeHtml(String(value));
}

function extractHeadingLevel(token: Token): number {
  const match = token.tag.match(/^h([1-6])$/);
  return match ? Number(match[1]) : 0;
}

export function renderMarkdown(markdown: string): string {
  if (!markdown) return "";

  try {
    const { html: frontmatterHtml, content } = splitFrontmatter(markdown);
    const raw = md.render(content);
    return DOMPurify.sanitize(frontmatterHtml + raw, {
      ADD_ATTR: ["target", "id", "rel", "class", "type", "checked", "disabled", "for", "aria-hidden"],
      ADD_TAGS: ["math", "input", "section"],
    });
  } catch (error) {
    return `<p>Markdown render error: ${escapeHtml(String(error))}</p>`;
  }
}

export function extractToc(markdown: string): TocItem[] {
  if (!markdown) return [];

  try {
    const { content } = splitFrontmatter(markdown);
    const tokens = md.parse(content, {});
    const items: TocItem[] = [];

    for (let i = 0; i < tokens.length; i += 1) {
      const token = tokens[i];
      if (token.type !== "heading_open") continue;

      const level = extractHeadingLevel(token);
      if (level < 1 || level > 6) continue;

      const text = getHeadingTextFromTokens(tokens, i, md.options, {});
      const id = makeId(text);
      if (!text || !id) continue;

      items.push({ id, text, level });
    }

    return items;
  } catch {
    return [];
  }
}

export function getWordCount(markdown: string): number {
  if (!markdown) return 0;

  const chineseChars = (markdown.match(/[\u4e00-\u9fff]/g) || []).length;
  const englishText = markdown.replace(/[\u4e00-\u9fff]/g, " ");
  const englishWords = englishText.split(/\s+/).filter((word) => word.length > 0).length;
  return chineseChars + englishWords;
}

export function getCharCount(markdown: string): number {
  if (!markdown) return 0;
  return markdown.replace(/\s/g, "").length;
}
