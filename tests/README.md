# 测试

本目录包含 MarkFlow 的 Markdown 渲染回归测试用例和 CommonMark 规范兼容性测试工具。

## 文件说明

| 文件 | 说明 |
| --- | --- |
| `commonmark-spec.md` | CommonMark 0.31.2 核心语法手动测试用例（在 MarkFlow 中打开逐项验证） |
| `gfm-extensions.md` | GitHub Flavored Markdown 扩展语法测试（表格、任务列表、删除线、脚注、Emoji 等） |
| `edge-cases.md` | 边界情况与嵌套测试（深层嵌套、中英混排、空内容、超长文档等） |
| `run-tests.cjs` | 本地 Markdown 回归测试运行器（基于 markdown-it） |
| `run-spec-tests.cjs` | CommonMark 0.31.2 规范测试运行器（基于 markdown-it + spec.json） |
| `spec.json` | CommonMark 0.31.2 官方测试数据集（需单独下载） |
| `spec-report.md` | 最近一次 spec 测试报告（由 `run-spec-tests.cjs` 自动生成） |

## 运行测试

```bash
# 运行本地回归测试（45 个自定义用例，覆盖基础语法、GFM 扩展、中文支持、Frontmatter）
npm run test:markdown

# 运行 CommonMark 0.31.2 规范测试（651 个官方用例）
npm run test:spec
```

## 获取 CommonMark 测试数据

首次运行 `npm run test:spec` 前需下载官方 spec.json：

```bash
curl -L -o tests/spec.json https://spec.commonmark.org/0.31.2/spec.json
```

## 测试覆盖范围

### 本地回归测试 (run-tests.cjs)

- 标题（ATX、Setext、闭合 #）
- 强调（粗体、斜体、粗斜体、高亮、上下标）
- 代码（行内代码、围栏代码块）
- 列表（有序、无序、嵌套、任务列表）
- 引用（基本引用、嵌套引用）
- 链接（行内链接、自动链接、参考链接、hash 链接）
- 图片、水平线、表格
- 删除线、脚注、Emoji 短码
- 数学公式（KaTeX）
- 中文标题与中文内容
- 原始 HTML、HTML 实体、转义
- Frontmatter（基本字段、数组、与水平线的区分）

### CommonMark 规范测试 (run-spec-tests.cjs)

基于 CommonMark 0.31.2 官方 spec.json，验证 markdown-it 渲染引擎与标准的兼容性。

当前兼容性：**647/651 通过（99.4%）**，失败项均集中在自动链接的边界情况。
