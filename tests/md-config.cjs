/**
 * 共享的 markdown-it 配置 — 与 src/utils/markdown.ts 中的生产配置保持一致。
 * 两个测试运行器（run-tests.cjs / run-spec-tests.cjs）均从此文件导入。
 *
 * 修改生产 markdown 渲染配置时，请同步更新本文件。
 */

const MarkdownIt = require("markdown-it");
const katex = require("@traptitech/markdown-it-katex").default || require("@traptitech/markdown-it-katex");
const footnote = require("markdown-it-footnote");
const mark = require("markdown-it-mark");
const sub = require("markdown-it-sub");
const sup = require("markdown-it-sup");
const taskLists = require("markdown-it-task-lists");
const emojiPkg = require("markdown-it-emoji");
const YAML = require("yaml");

const emoji = emojiPkg.full || emojiPkg.default || emojiPkg;

/** 基础 markdown-it 实例（不含 heading/link 自定义规则，供 spec 测试使用） */
function createBaseMd() {
  return new MarkdownIt({
    html: true,
    breaks: false,
    linkify: true,
    typographer: false,
    xhtmlOut: true,
  });
}

/** 完整 markdown-it 实例（含所有插件 + heading/link 规则，与生产环境一致） */
function createFullMd() {
  const md = new MarkdownIt({
    html: true,
    breaks: false,
    linkify: true,
    typographer: false,
    xhtmlOut: true,
  })
    .use(katex, { throwOnError: false, errorColor: "#cc0000" })
    .use(taskLists, { enabled: true, label: true, labelAfter: true })
    .use(footnote)
    .use(mark)
    .use(sub)
    .use(sup)
    .use(emoji);

  // --- 与 src/utils/markdown.ts 保持一致的渲染规则 ---

  const originalHeadingOpen = md.renderer.rules.heading_open;
  md.renderer.rules.heading_open = function (tokens, idx, options, env, self) {
    const text = getHeadingTextFromTokens(md, tokens, idx, options, env);
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
  md.renderer.rules.link_open = function (tokens, idx, options, env, self) {
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

  return md;
}

// --- 工具函数 ---

function makeId(rawText) {
  return rawText
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
    .replace(/[^\w一-鿿]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function getHeadingTextFromTokens(md, tokens, idx, options, env) {
  const inlineToken = tokens[idx + 1];
  const children = inlineToken?.children ?? [];
  return md.renderer.renderInlineAsText(children, options, env).replace(/\s+/g, " ").trim();
}

function escapeHtml(value) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// --- Frontmatter 解析（与 src/utils/markdown.ts 保持一致）---

function splitFrontmatter(markdown) {
  const source = markdown.charCodeAt(0) === 0xfeff ? markdown.slice(1) : markdown;
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
  const yamlText = normalized.slice(4, 4 + endMatch.index);
  const contentStart = 4 + endMatch.index + endMatch[0].length;
  const content = normalized.slice(contentStart);
  try {
    const parsed = YAML.parse(yamlText);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { html: "", content: normalized };
    }
    const rows = Object.entries(parsed)
      .map(([key, value]) => renderFrontmatterRow(key, value))
      .join("");
    return rows
      ? { html: `<div class="frontmatter">${rows}</div>`, content }
      : { html: "", content };
  } catch {
    return { html: "", content: normalized };
  }
}

function renderFrontmatterRow(key, value) {
  const renderedValue = renderFrontmatterValue(value);
  if (!renderedValue) return "";
  return `<div class="fm-row"><span class="fm-key">${escapeHtml(key)}</span><span class="fm-val">${renderedValue}</span></div>`;
}

function renderFrontmatterValue(value) {
  if (value == null) return '<span class="fm-empty">null</span>';
  if (Array.isArray(value)) {
    if (value.length === 0) return '<span class="fm-empty">[]</span>';
    return `<ul class="fm-list">${value.map(item => `<li>${renderFrontmatterValue(item)}</li>`).join("")}</ul>`;
  }
  if (typeof value === "object") {
    const entries = Object.entries(value);
    if (entries.length === 0) return '<span class="fm-empty">{}</span>';
    return `<div class="fm-nested">${entries.map(([k, v]) => `<div class="fm-nested-row"><span class="fm-nested-key">${escapeHtml(k)}</span><span class="fm-nested-val">${renderFrontmatterValue(v)}</span></div>`).join("")}</div>`;
  }
  if (typeof value === "string") return escapeHtml(value).replace(/\n/g, "<br />");
  return escapeHtml(String(value));
}

module.exports = {
  createBaseMd,
  createFullMd,
  makeId,
  getHeadingTextFromTokens,
  escapeHtml,
  splitFrontmatter,
};
