# Editor GitHub Actions 发版

`.github/workflows/editor-release.yml` 构建 stable/beta 的 macOS arm64、Windows x64 和
Linux x64 发行物。测试暂只在 macOS 运行；Windows/Linux 保留构建与发布前的大小、SHA-256
校验，不宣称已通过平台运行测试。Windows 当前发行物未配置代码签名。

## Apple 凭据

沿用 `backrunner/mixless` 的 GitHub Secrets 命名与 Apple ID 公证方式。在
`QuaDevTeam/QuaEngine` 的 Actions Secrets 中配置以下六项，或让组织 Secrets 对此仓库可用：

| Secret | 内容 |
| --- | --- |
| `APPLE_CERTIFICATE` | 单个 Developer ID Application 身份及私钥的 P12，base64 编码 |
| `APPLE_CERTIFICATE_PASSWORD` | P12 导出密码 |
| `APPLE_SIGNING_IDENTITY` | 完整 `Developer ID Application: … (TEAMID)` 身份名 |
| `APPLE_TEAM_ID` | 同一证书所属的 10 位 Apple 团队 ID |
| `APPLE_ID` | Apple 账号 |
| `APPLE_PASSWORD` | Apple **应用专用密码** |

证书两项兼容 `CSC_LINK` / `CSC_KEY_PASSWORD`，其中 `CSC_LINK` 在此工作流必须是 base64
P12，而非 URL。也支持 `APPLE_API_KEY_BASE64`、`APPLE_API_KEY_ID`、`APPLE_API_ISSUER` 三项
App Store Connect 团队 API key，替代 Apple ID 两项。部分配置会报错，避免误选认证方式。

GitHub 不允许读回 Secret 值；参考仓库的 Secrets 不会自动共享。不要把密码、P12、P8
提交到源码或放在命令参数中。Apple ID 密码由关闭日志的安全提示输入；API key 写入权限
为 0600 的临时文件。验证后的公证凭据存入 CI 临时钥匙串，后续构建只使用 profile 名称。
任务结束后删除临时文件及钥匙串。

## 构建和发布顺序

1. CI 预检配置，导入证书，确认 Developer ID 身份，向 Apple 验证公证凭据。
2. Electron Packager 对应用、helpers 和原生模块签名，启用 hardened runtime 与 V8 JIT
   entitlement；不启用调试授权或关闭 library validation。
3. 提交 Apple 公证并 staple。检查团队、应用身份、hardened runtime、代码签名、stapler
   与 Gatekeeper。生成 tar.gz 后重新解压，再次执行全部验证。
4. 在 macOS CI 运行网络代理、更新、独立安装包和完整替换重启测试。更新测试只修改并
   重新签名临时的旧版 fixture；下载和安装的目标归档保持原始签名、公证与字节内容。
5. 三个平台的构建成功后，发布任务验证哈希；macOS 必须附带已签名、公证、staple 和
   Gatekeeper 校验记录。先发布固定版本 Release，再更新频道清单。

触发方式是 `editor-v<version>`、`editor-beta-v<version>` tag，或工作流手动输入频道和
版本。手动运行也会在所有门禁通过后发布 Release。Editor 版本独立于引擎 npm 版本。

签名发行版在更新前验证代码签名、内置可信团队、频道 bundle ID 和 Gatekeeper。可信团队
来自当前签名应用内部，不能由远程更新清单更改。验证失败保持当前安装，不启动替换脚本。

本地无凭据构建只用于开发；它无法通过发布任务的 macOS 签名门禁。实际签名、公证和
发行物构建由 GitHub Actions 执行。Secrets 名称存在、预检通过或单元测试通过，都不等于
真实 Apple 公证或 Release 已成功。
