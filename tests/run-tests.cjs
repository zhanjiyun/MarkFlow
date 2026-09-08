const { createFullMd, splitFrontmatter } = require("./md-config.cjs");

const md = createFullMd();

function render(markdown) {
  try {
    const { html, content } = splitFrontmatter(markdown);
    return html + (md.render(content) || "");
  } catch (error) {
    return `ERROR: ${error instanceof Error ? error.message : String(error)}`;
  }
}

function has(str) {
  return { fn: (html) => html.includes(str), label: `contains "${str.slice(0, 30)}"` };
}

function not(str) {
  return { fn: (html) => !html.includes(str), label: `not contains "${str.slice(0, 30)}"` };
}

function count(str, min) {
  return {
    fn: (html) => (html.match(new RegExp(str, "g")) || []).length >= min,
    label: `${str} >= ${min}`,
  };
}

const tests = [];
let pass = 0;
let fail = 0;

function test(name, markdown, checks) {
  const html = render(markdown);
  const errors = [];

  for (const check of checks) {
    try {
      if (!check.fn(html)) {
        errors.push(check.label);
      }
    } catch {
      errors.push(`${check.label} (exception)`);
    }
  }

  tests.push({ name, html, errors });
  if (errors.length === 0) {
    pass += 1;
  } else {
    fail += 1;
  }
}

test("H1-H6", "# H1\n## H2\n### H3\n#### H4\n##### H5\n###### H6", [has("<h1"), has("<h6")]);
test("No heading without space", "#not heading", [not("<h1")]);
test("Heading with closing #", "# Title #", [has("<h1"), has('id="title"')]);
test("Setext heading", "Title\n=====", [has("<h1"), has('id="title"')]);

test("Bold", "**bold**", [has("<strong>bold</strong>")]);
test("Italic", "*italic*", [has("<em>italic</em>")]);
test("Bold and italic", "***both***", [has("<strong>"), has("<em>")]);
test("Underscore emphasis", "_text_", [has("<em>text</em>")]);
test("Highlight", "==highlight==", [has("<mark>highlight</mark>")]);
test("Subscript", "H~2~O", [has("H<sub>2</sub>O")]);
test("Superscript", "x^2^", [has("x<sup>2</sup>")]);

test("Inline code", "`code`", [has("<code>code</code>")]);
test("Inline code keeps regex intact", "`^[a-zA-Z0-9_-]+$`", [has("<code>^[a-zA-Z0-9_-]+$</code>")]);
test("Inline code with stars preserved", "`**code with stars**`", [has("<code>**code with stars**</code>")]);
test("Fenced code block with stars preserved", "```\n**not bold in code**\n```", [has("<pre>"), has("**not bold in code**"), not("<strong>")]);
test("Math stars stay inside inline math", "$2**3$", [has('class="katex"'), not("<strong>")]);
test("Math stars stay inside complex math", "$x_i^{2**k}$", [has('class="katex"'), not("<strong>")]);
test("Autolink with stars in URL", "https://example.com/**with**/stars", [has("https://example.com/**with**/stars"), not("<strong>")]);
test("Unclosed bold markers", "**unclosed", [not("<strong>")]);
test("Escaped asterisks", "\\*\\*not bold\\*\\*", [not("<strong>"), has("**not bold**")]);
test("Fenced code block", "```js\nconst x = 1\n```", [has("<pre><code"), has("language-js")]);
test("Fenced checklist stays literal", "```\n- [x] done\n- [ ] todo\n```", [has("<pre><code"), not('type="checkbox"')]);

test("Unordered list", "- a\n- b", [has("<ul>"), has("<li>a</li>")]);
test("Ordered list", "1. a\n2. b", [has("<ol>"), has("<li>a</li>")]);
test("Nested list", "- a\n  - b", [count("<ul>", 2)]);
test("Task list", "- [x] done\n- [ ] todo", [has('class="contains-task-list"'), count('type="checkbox"', 2)]);

test("Blockquote", "> quote", [has("<blockquote>")]);
test("Nested blockquote", "> a\n> > b", [count("<blockquote>", 2)]);

test("Inline link", "[GitHub](https://github.com)", [has('href="https://github.com"'), has('target="_blank"')]);
test("Hash link stays local", "[Jump](#section)", [has('href="#section"'), not('target="_blank"')]);
test("Autolink", "<https://example.com>", [has("https://example.com")]);
test("Reference link", "[ref][r]\n\n[r]: https://x.com", [has('href="https://x.com"')]);
test("Link in heading uses visible text for id", "## [Link](url) heading", [has('id="link-heading"')]);

test("Image", "![alt](img.png)", [has("<img"), has('src="img.png"')]);
test("Horizontal rule", "---", [has("<hr")]);
test("Table", "| a | b |\n| --- | --- |\n| 1 | 2 |", [has("<table>"), has("<thead>"), has("<tbody>")]);
test("Strikethrough", "~~deleted~~", [has("<s>deleted</s>")]);
test("Footnote", "Footnote[^1]\n\n[^1]: note", [has('class="footnote-ref"'), has('class="footnotes"')]);
test("Emoji", ":smile:", [not(":smile:"), has("😄")]);
test("Math", "$E=mc^2$", [has('class="katex"')]);

test("Chinese bold", "这是**粗体**文字", [has("<strong>粗体</strong>")]);
test("Chinese bold adjacent", "和**粗体**后文本", [has("<strong>粗体</strong>")]);
test("Chinese bold after punctuation needs a boundary", "和**SnapKV (NeurIPS24)**粗体后文本", [not("<strong>")]);
test("Chinese bold after punctuation with space", "和**SnapKV (NeurIPS24)** 粗体后文本", [has("<strong>SnapKV (NeurIPS24)</strong>")]);
test("Chinese heading", "# 中文标题", [has("<h1"), has("中文标题")]);

test("Raw HTML", "<b>bold</b>", [has("<b>bold</b>")]);
test("HTML entity", "&amp; &lt; &gt;", [has("&amp;"), has("&lt;"), has("&gt;")]);
test("Escape asterisk", "\\*not\\*", [not("<em>")]);
test("Hard break", "line  \nline2", [has("<br")]);
test("Empty string", "", [{ fn: () => true, label: "empty input ok" }]);
test("Frontmatter basic", "---\ntitle: Hello\nsummary: ok\n---\n\n# Doc", [has('class="frontmatter"'), has("Hello"), has("<h1")]);
test("HTML entity decoded", "&amp; &lt; &gt; &copy;", [has("&amp;"), has("&lt;"), has("&gt;"), has("©")]);
test("Frontmatter array", "---\ntags:\n  - a\n  - b\n---\n\nBody", [has('class="fm-list"'), has("<li>a</li>"), has("Body")]);
test("Frontmatter not mistaken for hr", "---\n\nHello\n\n---\n\nWorld", [not('class="frontmatter"'), has("<hr"), has("Hello"), has("World")]);

console.log("\n==============================");
console.log("MarkFlow Markdown Smoke Tests");
console.log(`Passed: ${pass}/${tests.length}`);
console.log(`Failed: ${fail}/${tests.length}`);
console.log("==============================\n");

if (fail > 0) {
  console.log("Failed cases:\n");
  for (const entry of tests.filter((item) => item.errors.length > 0)) {
    console.log(`[FAIL] ${entry.name}: ${entry.errors.join(" | ")}`);
    console.log(`       Output: ${entry.html.slice(0, 240)}\n`);
  }
  process.exit(1);
}

console.log("All smoke tests passed.\n");
