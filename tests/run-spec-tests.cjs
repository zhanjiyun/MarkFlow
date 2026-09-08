const fs = require("fs");
const MarkdownIt = require("markdown-it");

const md = new MarkdownIt({
  html: true,
  breaks: false,
  linkify: true,
  typographer: false,
  xhtmlOut: true,
});

function makeId(rawText) {
  return rawText
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
    .replace(/[^\w\u4e00-\u9fff]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function getHeadingText(tokens, idx, options, env) {
  const children = tokens[idx + 1]?.children || [];
  return md.renderer.renderInlineAsText(children, options, env).replace(/\s+/g, " ").trim();
}

const defaultHeading = md.renderer.rules.heading_open;
md.renderer.rules.heading_open = function (tokens, idx, options, env, self) {
  const id = makeId(getHeadingText(tokens, idx, options, env));
  if (id) {
    tokens[idx].attrSet("id", id);
  }

  return defaultHeading
    ? defaultHeading(tokens, idx, options, env, self)
    : self.renderToken(tokens, idx, options);
};

const defaultLink = md.renderer.rules.link_open;
md.renderer.rules.link_open = function (tokens, idx, options, env, self) {
  const href = tokens[idx].attrGet("href") || "";
  if (href && !href.startsWith("#")) {
    tokens[idx].attrSet("target", "_blank");
    tokens[idx].attrSet("rel", "noopener noreferrer");
  }

  return defaultLink
    ? defaultLink(tokens, idx, options, env, self)
    : self.renderToken(tokens, idx, options);
};

function renderOur(markdown) {
  try {
    return md.render(markdown) || "";
  } catch {
    return "PARSE_ERROR";
  }
}

const specPath = __dirname + "/spec.json";
if (!fs.existsSync(specPath)) {
  console.log("Please download tests/spec.json first.");
  process.exit(1);
}

const spec = JSON.parse(fs.readFileSync(specPath, "utf-8"));
const examples = spec
  .map((entry) => ({
    section: entry.section || "?",
    example: entry.example,
    markdown: entry.markdown,
    expected: entry.html,
  }))
  .filter((entry) => entry.markdown && entry.expected);

console.log("\n======================================");
console.log(" MarkFlow CommonMark 0.31.2 Spec Test ");
console.log(" Engine: markdown-it                  ");
console.log(` Cases: ${String(examples.length).padStart(4)}                        `);
console.log("======================================\n");

function normalize(html) {
  return html
    .replace(/\s+id="[^"]*"/gi, "")
    .replace(/\s+target="_blank"/gi, "")
    .replace(/\s+rel="noopener noreferrer"/gi, "")
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .replace(/> </g, "><")
    .replace(/<blockquote>\s*/g, "<blockquote>")
    .replace(/\s*<\/blockquote>/g, "</blockquote>")
    .replace(/<pre>\s*/g, "<pre>")
    .replace(/\s*<\/pre>/g, "</pre>")
    .replace(/<ul>\s*/g, "<ul>")
    .replace(/\s*<\/ul>/g, "</ul>")
    .replace(/<ol>\s*/g, "<ol>")
    .replace(/\s*<\/ol>/g, "</ol>")
    .replace(/<li>\s*/g, "<li>")
    .replace(/\s*<\/li>/g, "</li>")
    .toLowerCase()
    .trim();
}

const sections = {};
let pass = 0;
let fail = 0;
const failures = [];

for (const entry of examples) {
  const actual = normalize(renderOur(entry.markdown));
  const expected = normalize(entry.expected);
  const section = entry.section;

  if (!sections[section]) {
    sections[section] = { pass: 0, fail: 0 };
  }

  if (actual === expected) {
    pass += 1;
    sections[section].pass += 1;
  } else {
    fail += 1;
    sections[section].fail += 1;
    failures.push({
      section: entry.section,
      example: entry.example,
      markdown: entry.markdown.slice(0, 80),
      expected: expected.slice(0, 120),
      got: actual.slice(0, 120),
    });
  }
}

const total = pass + fail;
const pct = ((pass / total) * 100).toFixed(1);

console.log(`Passed: ${pass} / ${total} (${pct}%)`);
console.log(`Failed: ${fail} / ${total}\n`);

console.log("-- By Section --\n");
const sectionNames = Object.keys(sections).sort((a, b) => {
  const [a1, a2] = a.split(".").map(Number);
  const [b1, b2] = b.split(".").map(Number);
  return a1 - b1 || (a2 || 0) - (b2 || 0);
});

for (const section of sectionNames) {
  const stats = sections[section];
  const ratio = stats.pass / (stats.pass + stats.fail);
  const filled = "█".repeat(Math.round(ratio * 20));
  const empty = "░".repeat(20 - filled.length);
  console.log(`${section.padEnd(28)} ${filled}${empty} ${stats.pass}/${stats.pass + stats.fail}`);
}

if (fail > 0) {
  console.log("\n-- Failures (first 20) --\n");
  for (const item of failures.slice(0, 20)) {
    console.log(`FAIL ${item.section} #${item.example}`);
    console.log(`  Input:    ${item.markdown}`);
    console.log(`  Expected: ${item.expected}`);
    console.log(`  Actual:   ${item.got}\n`);
  }
  if (failures.length > 20) {
    console.log(`... and ${failures.length - 20} more\n`);
  }
}

const report = [];
report.push("# CommonMark 0.31.2 Test Report\n\n");
report.push(`**Generated**: ${new Date().toISOString()}\n\n`);
report.push(`**Passed**: ${pass}/${total} (${pct}%)\n\n`);
report.push("## By Section\n\n");
report.push("| Section | Passed | Failed |\n|------|------|------|\n");
for (const section of sectionNames) {
  report.push(`| ${section} | ${sections[section].pass} | ${sections[section].fail} |\n`);
}
if (fail > 0) {
  report.push("\n## Failures\n\n");
  for (const item of failures) {
    report.push(`### ${item.section} #${item.example}\n`);
    report.push("```md\n");
    report.push(`${item.markdown}\n`);
    report.push("```\n");
    report.push(`Expected: \`${item.expected}\`\n\n`);
    report.push(`Actual: \`${item.got}\`\n\n`);
  }
}
fs.writeFileSync(__dirname + "/spec-report.md", report.join(""));
console.log("\nSaved report to tests/spec-report.md\n");

process.exit(fail > 0 ? 1 : 0);
