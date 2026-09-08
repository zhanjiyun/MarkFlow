# 便携版（免安装）使用说明

如果你不想安装 NSIS 安装包，也可以直接使用 MarkFlow 的可执行文件。

## 获取便携版

1. 从 [GitHub Releases](https://github.com/zhanjiyun/MarkFlow/releases) 下载 `markflow-setup.exe`
2. 用解压工具（如 7-Zip、Bandizip）打开 `markflow-setup.exe`，提取其中的文件
3. 或者：运行安装包安装后，从安装目录复制 `MarkFlow.exe` 和同目录下的所有文件

> **注意**：安装包解压出来的文件结构可能与直接构建产物不同。如果你有 Rust 环境，也可以直接运行 `npx tauri build` 得到 `src-tauri/target/release/MarkFlow.exe`。

## 便携版与安装版的区别

| 项目 | 安装版 | 便携版 |
|------|--------|--------|
| 文件关联 | 自动注册 | 需手动设置 |
| 右键菜单「在 MarkFlow 中打开」 | 有 | 无 |
| 应用数据位置 | `%LocalAppData%\com.markflow.editor\` | 相同（Tauri 自动管理） |
| 卸载 | 通过系统设置 | 直接删除文件夹 |

## 手动设置文件关联（便携版）

如果你使用便携版，需要手动将 `.md` 文件关联到 MarkFlow：

1. 右键任意 `.md` 文件 →「打开方式」→「选择其他应用」
2. 勾选「始终使用此应用打开 .md 文件」
3. 点击「在这台电脑上查找其他应用」
4. 找到你的 `MarkFlow.exe` 位置，选中它

## 注意事项

- 无论安装版还是便携版，**应用数据（会话、草稿、设置）都存储在同一个位置**：`%LocalAppData%\com.markflow.editor\`
- 如果想在多台电脑之间携带数据，除了复制 MarkFlow 文件夹，还需要复制上述数据目录
- 便携版不会在「添加/删除程序」中显示内容
