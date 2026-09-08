# Windows 代码签名接入指南

## 为什么需要代码签名

当前 MarkFlow 通过 NSIS 安装包分发。未签名的 `.exe` 在 Windows 上会被：
- **Microsoft Defender SmartScreen** 拦截，显示 "Windows 已保护你的电脑"
- 部分企业环境或杀毒软件可能直接阻止运行
- 用户信任度显著降低

代码签名后，这些警告会消失，安装和启动体验与商业软件一致。

## 方案选择

### 方案 A：标准 OV/EV 代码签名证书（推荐）

| 项 | 说明 |
|----|------|
| 类型 | OV（组织验证）或 EV（扩展验证） |
| 费用 | OV 年费约 $200-400；EV 约 $300-600 |
| 获取 | 从 DigiCert、Sectigo、GlobalSign 等 CA 购买 |
| 优势 | 立即建立 SmartScreen 信誉；EV 证书即时通过 |
| 劣势 | 需要组织身份验证，个人开发者较难获取 OV/EV |

### 方案 B：Azure Code Signing（推荐用于开源 / 个人）

| 项 | 说明 |
|----|------|
| 类型 | 通过 Microsoft 的 Azure Code Signing 服务签名 |
| 费用 | 按使用量计费，通常每月几美元 |
| 获取 | 在 Azure Portal 申请，需验证组织身份 |
| 优势 | 集成 GitHub Actions，无需管理物理证书 |
| 劣势 | 仍需要组织验证 |

### 方案 C：个人代码签名证书

| 项 | 说明 |
|----|------|
| 类型 | 个人 IV（个体验证）证书 |
| 费用 | 年费约 $50-100 |
| 获取 | 部分 CA 提供个人证书 |
| 劣势 | SmartScreen 信誉积累慢（需要大量下载量才能消除警告） |

## 接入 GitHub Actions

当前 `.github/workflows/release.yml` 会在推送 `v*` 标签时构建 NSIS 安装包。

### 如果使用 Azure Code Signing

```yaml
- name: Sign installer
  uses: azure/azure-code-signing-action@v1
  with:
    endpoint: ${{ secrets.AZURE_CODE_SIGNING_ENDPOINT }}
    codeSigningAccountName: ${{ secrets.AZURE_CODE_SIGNING_ACCOUNT }}
    certificateProfileName: ${{ secrets.AZURE_CODE_SIGNING_PROFILE }}
    files: src-tauri/target/release/bundle/nsis/*setup.exe
```

### 如果使用本地证书

将 `.pfx` 证书导入 GitHub Secrets（Base64），在 CI 中安装后签名：

```yaml
- name: Sign installer
  run: |
    certutil -f -p "${{ secrets.CERT_PASSWORD }}" -importpfx ${{ secrets.CERT_BASE64 }}
    signtool sign /fd SHA256 /f certificate.pfx /p "${{ secrets.CERT_PASSWORD }}" /tr http://timestamp.digicert.com /td SHA256 src-tauri/target/release/bundle/nsis/*setup.exe
```

## 你需要准备的东西

| 项 | 说明 | 是否必须由你手动完成 |
|----|------|---------------------|
| 选择并购买证书 | 从 CA 购买 OV/EV 或个人证书 | **是** |
| 组织 / 身份验证 | CA 要求提供身份或组织证明 | **是** |
| GitHub Secrets | 将证书密码 / Azure 凭据存入仓库 Secrets | **是** |
| 更新 release.yml | 在构建步骤后添加签名步骤 | 代码可完成 |
| 测试签名 | 构建安装包，验证 SmartScreen 不再警告 | **是** |

## 不签名的缓解措施

在获得证书之前，可以在 README 和安装说明中告知用户：
- 这是开源软件，代码完全公开
- SmartScreen 警告是因为尚未进行代码签名
- 点击 "更多信息" → "仍要运行" 即可继续安装

这不是长久之计，但可以让早期用户不因警告而放弃。

## 建议

1. 如果是个人项目且预算有限，先用**方案 C**（个人证书），积累下载量
2. 如果有组织身份，直接用**方案 A**（OV 证书）
3. 如果有 Azure 订阅，**方案 B** 的 CI 集成最顺畅
