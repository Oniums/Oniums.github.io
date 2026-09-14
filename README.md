# Oniums.github.io

Oniums 的个人博客，使用 Hexo 和 Butterfly 构建，通过 GitHub Pages 发布。

AI 协作与交付规则见 [AGENTS.md](AGENTS.md)，配套入口为 [CLAUDE.md](CLAUDE.md)。自 2026-09-10 起，写博客默认完成脱敏、页面检查、提交、推送和线上验证，不重复询问发布；明确要求仅草稿、仅大纲、先审阅或不推送时，遵守更窄范围。

## 本地使用

```bash
npm ci
npm run server
```

完整构建检查：

```bash
npm run check
```

准备 GitHub Pages 发布文件：

```bash
npm run prepare-pages
```

Hexo 首先把生成结果写入 `public/`，站点检查通过后，再由受控脚本同步到仓库根目录。`public/` 本身不提交到 Git。

## 内容结构

- `source/_posts/`：公开技术文章
- `source/about/`：个人介绍
- `source/experience/`：匿名化工作经历
- `source/projects/`：项目与实践方向
- `source/tools/`：公开工具箱与六个工具，静态页面；`assets/calculations.mjs` 为纯计算核心。用户输入仅在浏览器内处理，配网内容不持久化。二维码依赖为本地固定版本副本，来源与许可见 `source/tools/assets/vendor/README.md`。
- 第二批工具：`firmware-diff/` 对比本地 BIN（最多 64 MiB / 文件，模块 Worker 计算 SHA-256 和差异）；`log-timeline/` 整理时间戳、事件与 CSV，通过公开步骤 ID 跳转配网播放器；`thread-dataset/` 查看 TLV、隐藏凭据和网络标识。核心逻辑分别在 `assets/binary-core.mjs`、`timeline-core.mjs`、`dataset-core.mjs`，边界测试在 `tools/test-analysis-tools.mjs`。
- `tools/test-toolbox.mjs`：公开测试向量、数值边界和发布同步保护测试，运行 `npm run test:tools`，也包含在完整检查中。`/tools/` 的生成页面与仓库构建脚本共用目录，同步脚本只清理列明的页面和资源子目录，禁止整体删除 `tools/`。
- `source/playground/commissioning/`：配网过程播放器，独立静态页面；`scenarios.js` 定义教学场景，`player.js` 控制播放与状态回看，`player.css` 定义界面。`skip_render` 保留原始模块文件。
- 工具箱与配网播放器均可通过顶部一级导航、首页首屏快捷卡片或 Lab 总览进入。`scripts/home-shortcuts.js` 在构建时插入首页卡片，样式位于 `source/css/custom.css`；手机菜单沿用同一份主题导航配置。
- `_config.yml`：Hexo 配置
- `_config.butterfly.yml`：当前 Butterfly 主题覆盖配置
- `_config.fluid.yml`：旧 Fluid 主题配置，仅保留为回退参考

## 发布边界

- 只发布可公开、经过整理的内容。
- 不发布公司内部信息、未公开产品细节、密钥、证书、设备标识或原始工作日志。
- 不发布姓名、照片、手机号、薪资、公司名称或具体产品型号。
- 私人知识库只作为选题来源，不与本站自动同步。
- 当前 GitHub Pages 从 `main` 根目录直接发布，提交前必须运行 `npm run prepare-pages`。
