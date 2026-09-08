# 贡献指南

感谢你对 MarkFlow 感兴趣！欢迎提交 Issue 和 Pull Request。

## 环境要求

- Node.js 22+
- Rust 1.77+
- **Windows 桌面构建**：Visual Studio Build Tools（含 C++ 工作负载）
- **Android 构建**：JDK 17+、Android SDK（platform 36、NDK 27.0.12077973）、Android Rust targets

```bash
rustup target add aarch64-linux-android armv7-linux-androideabi i686-linux-android x86_64-linux-android
```

## 开发流程

1. Fork 本仓库并克隆到本地
2. 安装依赖：`npm install`
3. 启动开发：
   - 桌面：`npx tauri dev`
   - Android：`npx tauri android dev`
4. 修改代码

## 提交前自检

```bash
npm run lint
npm run test:markdown
npm run test:untitled
npm run test:filesystem
cargo fmt --check --manifest-path src-tauri/Cargo.toml
```

## 提交 Pull Request

- 保持改动聚焦：一个 PR 解决一个问题
- 说明改动的**动机和影响**（为什么改，而不是改了什么）
- 涉及界面改动时附上截图
- 确保 CI 通过

## 代码约定

- TypeScript / React 19，遵循现有风格（由 oxlint 校验）
- Rust 代码用 `cargo fmt` 格式化
- 不为假设的未来需求过度设计；修复 bug 时不做无关重构

## 报告问题

请通过 GitHub Issues 反馈，并附上：

- 复现步骤
- 平台与版本（Windows / Android，MarkFlow 版本号）
- 相关日志或截图
