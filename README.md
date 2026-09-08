# MarkFlow

本地优先的 Markdown 编辑器，支持 **Windows 桌面** 与 **Android 移动端**，专注于写作体验。

MarkFlow 基于 Tauri v2 构建，一套代码双平台编译：提供所见即所得编辑、源码编辑、实时预览和分栏视图，支持多标签管理、AI 写作辅助、会话持久化，以及 Android 上的系统文件访问（SAF）。

版本：**1.0.0**

## 主要特性

### 桌面端（Windows）

- **所见即所得编辑**：基于 Milkdown / ProseMirror，支持类 Typora 的即时渲染体验
- **源码模式**：基于 CodeMirror 6，支持语法高亮和格式化快捷键
- **分栏视图**：左侧源码 + 右侧实时预览，支持同步滚动；仅预览模式支持字体缩放
- **多标签管理**：固定标签、拖拽排序、批量关闭、标签重命名
- **文件树**：打开文件夹后通过侧边栏浏览和管理 Markdown 文件；重命名 / 删除同步打开中的标签
- **目录大纲**：从文档标题自动生成，点击跳转，滚动高亮
- **图片**：粘贴 / 图片自动保存到文档同级的 `assets/` 目录，预览与编辑器内直接显示
- **AI 写作助手**：兼容 OpenAI 接口格式（默认 DeepSeek），润色、翻译、扩写、缩写、总结
- **会话持久化**：自动保存界面状态；启动即干净主页（不残留上次标签）
- **导出**：HTML、纯文本，以及通过浏览器打印生成 PDF
- **搜索替换**：源码、预览、所见即所得三种模式
- **其他**：快速切换（Ctrl+P）、明暗主题、专注 / 禅模式、拖拽打开、自动保存、字数统计、外部文件变更检测、单实例文件转发、文件关联启动

### Android

- **系统文件访问（SAF）**：通过系统文件选择器打开 / 新建 / 另存为 Markdown 文件
- **编辑 / 预览**切换，移动端现代界面（明暗主题跟随系统）
- **草稿保护**：未保存内容按文档自动落盘，异常退出后可恢复；返回键带未保存确认
- 支持 `.md`、`.markdown`、`.mdown`、`.mdx` 文件

## 技术栈

| 层 | 技术 |
| --- | --- |
| 应用框架 | Tauri v2 |
| 前端框架 | React 19 + TypeScript |
| WYSIWYG 编辑器 | Milkdown (ProseMirror) |
| 源码编辑器 | CodeMirror 6 |
| Markdown 渲染 | markdown-it |
| 数学公式 | KaTeX |
| AI 通信 | reqwest（Rust 侧 HTTP 客户端） |
| Android 文件访问 | Kotlin FileAccessPlugin（SAF） |
| 桌面打包 | NSIS（Windows 安装包） |

## 开发

### 前置条件

- Node.js 22+
- Rust 1.77+
- **Windows 桌面构建**：Visual Studio Build Tools（含 C++ 工作负载，MSVC）
- **Android 构建**：JDK 17+、Android SDK（platform 36、NDK 27.0）、Android Rust targets（见下方命令）

### 安装依赖

```bash
npm install
```

### 桌面开发与构建

```bash
npm run dev        # 前端开发服务器
npx tauri dev      # 启动桌面应用（开发模式）
npx tauri build    # 打包桌面安装包
```

桌面构建产物：`src-tauri/target/release/bundle/nsis/`（`.exe` 安装包）与 `src-tauri/target/release/MarkFlow.exe`（免安装版）。

### Android 开发与构建

```bash
rustup target add aarch64-linux-android armv7-linux-androideabi i686-linux-android x86_64-linux-android
export ANDROID_HOME=/path/to/android-sdk
export NDK_HOME=$ANDROID_HOME/ndk/27.0.12077973

npx tauri android dev      # 连接设备/模拟器运行
npx tauri android build --apk    # 构建 Android APK（release）
```

Android 构建产物：`src-tauri/gen/android/app/build/outputs/apk/release/`。

> Windows 上若无 Android Studio 开发者模式，`tauri android build` 的 jniLibs 符号链接步骤可能受系统限制；可将编译后的 `.so` 手动复制到 `gen/android/app/src/main/jniLibs/<abi>/` 后直接使用 Gradle 打包（详见 CI 工作流）。

### 测试

```bash
npm run lint                 # oxlint
npm run test:markdown        # 自定义用例
npm run test:untitled        # 草稿恢复逻辑
npm run test:filesystem      # 文件系统逻辑
```

CommonMark 0.31.2 兼容性：**647/651 通过（99.4%）**。

## 发布（GitHub Release）

推送 `v*` 标签即自动构建 **Windows 安装包 + Android APK** 并发布到对应 Release：

```bash
git tag v1.0.0
git push origin v1.0.0
```

完成后在 GitHub 仓库的 **Releases** 页面可见：

- `MarkFlow_1.0.0_x64-setup.exe` — Windows 安装包
- `MarkFlow-Android-v1.0.0.apk` — Android 安装包（配置 `ANDROID_KEYSTORE_*` secrets 后自动签名，否则为 unsigned 版本）

也可在 Actions 页面用 **workflow_dispatch** 手动触发、指定已有标签重新构建。

## 本地数据存储

MarkFlow 是本地优先的应用，所有数据默认存储在本地，不会上传到任何服务器。

| 数据类型 | 存储位置 |
| -------- | -------- |
| 你的 Markdown 文件 | 你自行选择的路径 |
| 会话状态 | `%LocalAppData%\com.markflow.editor\session.json` |
| 未命名草稿恢复文件 | `%LocalAppData%\com.markflow.editor\untitled\` |
| AI 设置与最近文件 | WebView localStorage |

备份：复制 `%LocalAppData%\com.markflow.editor\` 整个文件夹即可。

> **安全提示**：AI API Key 以明文形式存储在 `localStorage` 中，请勿在不受信任的环境中使用。

## 项目结构

```text
markflow/
├── public/                 静态前端资源
├── src/                    React 前端源码
│   ├── components/         桌面端界面组件
│   ├── hooks/              自定义 Hook（文件系统、AI、会话、生命周期等）
│   ├── mobile/             Android 移动端界面
│   ├── platform/           Android 平台桥接（SAF 文件访问）
│   ├── types/              类型定义
│   ├── utils/              工具函数（导出、Markdown 渲染、图片等）
│   └── main.tsx            入口（按平台分发桌面 / 移动端）
├── src-tauri/              Tauri 后端（Rust）
│   ├── src/lib.rs          后端逻辑（命令、Android SAF 桥接、会话管理）
│   ├── gen/android/        Android 原生工程（Kotlin FileAccessPlugin 等）
│   ├── tauri.conf.json     Tauri 配置
│   └── icons/              应用图标
├── tests/                  Markdown 渲染测试与运行器
├── .github/workflows/      CI：lint、测试、桌面 + Android 自动发布
├── package.json            前端依赖与脚本
└── vite.config.ts          Vite 构建配置
```

## 常见问题

### 双击 .md 文件没有用 MarkFlow 打开？

1. 右键 .md 文件 →「打开方式」→「选择其他应用」
2. 找到 MarkFlow，勾选「始终使用此应用打开 .md 文件」
3. 找不到时选择「在这台电脑上查找其他应用」，定位到 MarkFlow 的 `MarkFlow.exe`

### 粘贴图片后编辑器里看不到？

请先保存文件（`Ctrl+S`），再粘贴图片——图片会保存到当前文档同级的 `assets/` 目录并立即显示。

### 如何卸载？

Windows 设置 → 应用 → 已安装的应用 → MarkFlow → 卸载；建议同时删除数据目录 `%LocalAppData%\com.markflow.editor\`。

### 如何免安装使用（便携版）？

参考 [便携版说明](docs/PORTABLE.md)。

## 快捷键速查

| 快捷键 | 功能 |
| --- | --- |
| `Ctrl + N` | 新建文件 |
| `Ctrl + O` | 打开文件 |
| `Ctrl + S` | 保存 |
| `Ctrl + /` | 切换源码 / 所见即所得模式 |
| `Ctrl + P` | 快速切换文件 |
| `Ctrl + F` | 查找 |
| `Ctrl + H` | 查找并替换 |
| `Ctrl + Shift + E` | 切换侧边栏 |
| `Ctrl + Shift + I` | AI 助手 |
| `F11` | 禅模式（专注模式） |
| `Ctrl + 滚轮` | 缩放预览字体 |

## 开源协议

本项目基于 MIT License 开源。详见 [LICENSE](./LICENSE) 文件。

## 致谢

- [Tauri](https://tauri.app/) — 跨平台应用框架
- [Milkdown](https://milkdown.dev/) — WYSIWYG Markdown 编辑器
- [CodeMirror](https://codemirror.net/) — 代码编辑器
- [markdown-it](https://github.com/markdown-it/markdown-it) — Markdown 解析器
- [KaTeX](https://katex.org/) — 数学公式渲染
- [Lucide](https://lucide.dev/) — 图标库