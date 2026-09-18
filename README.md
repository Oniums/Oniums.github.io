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
- `source/tools/`：公开工具箱与七个工具，静态页面；`assets/calculations.mjs` 为纯计算核心。用户输入仅在浏览器内处理，配网内容不持久化。二维码依赖为本地固定版本副本，来源与许可见 `source/tools/assets/vendor/README.md`。
- 第二批工具：`firmware-diff/` 对比本地 BIN（最多 64 MiB / 文件，模块 Worker 计算 SHA-256 和差异）；`log-timeline/` 整理时间戳、事件与 CSV，通过公开步骤 ID 跳转配网播放器；`thread-dataset/` 查看 TLV、隐藏凭据和网络标识。核心逻辑分别在 `assets/binary-core.mjs`、`timeline-core.mjs`、`dataset-core.mjs`，边界测试在 `tools/test-analysis-tools.mjs`。
- `source/tools/serial/`：Web Serial 串口调试台，桌面兼容浏览器访问本机串口。`assets/serial-core.mjs` 负责严格发送编码、流式解码、跨块换行和有界日志缓存；`serial-port.mjs` 管理串口读写与关闭；`serial.mjs` 管理勾选显示、筛选高亮、信号线、定时发送、快捷命令和本地导出。串口数据与命令不上传、不写浏览器存储；`serial-save.mjs` 提供可选本地文件自动保存，按周期关闭流提交，支持 UTF-8 日志（可含时间戳和 TX）或原始 RX 字节，追加已有文件。写入失败停止记录并提供待保存副本；强制关闭不能保证未提交数据。自动保存独立于显示缓存，原始数据最多保留 8 MiB / 4,096 块、文本 5,000 行，淘汰量明确显示。`tools/test-serial.mjs` 覆盖编码、缓存及模拟串口生命周期；`tools/test-serial-browser.mjs` 可用外部 Playwright 运行浏览器交互验证，见文件头。自动化模拟不代表真实硬件验证。
- `tools/test-toolbox.mjs`：公开测试向量、数值边界和发布同步保护测试，运行 `npm run test:tools`，也包含在完整检查中。`/tools/` 的生成页面与仓库构建脚本共用目录，同步脚本只清理列明的页面和资源子目录，禁止整体删除 `tools/`。
- `source/playground/commissioning/`：配网过程播放器，独立静态页面；`scenarios.js` 定义教学场景，`player.js` 控制播放与状态回看，`player.css` 定义界面。`skip_render` 保留原始模块文件。
- 工具箱与配网播放器均可通过顶部一级导航、首页首屏快捷卡片或 Lab 总览进入。`scripts/home-shortcuts.js` 在构建时插入首页卡片，样式位于 `source/css/custom.css`；手机菜单沿用同一份主题导航配置。
- `source/playground/radar/`：雷达交互课堂基础篇，4 章 16 小节。`course.mjs` 管理逐节讲解、预测题和实验任务；`physics.mjs` 实现理想静止 FMCW、采样、量化与实际 FFT；`plots.mjs` 绘制曲线，`app.mjs` 管理场景拖动和章节导航。输入与进度仅在页面内存中保留，公开参考与模型边界列在课程页。首页首屏、一级导航、工具箱和 Lab 总览均有入口。
- `tools/test-radar.mjs`：模型数值、FFT 与直接 DFT 对照、混叠、窗函数、补零和课程完整性测试，运行 `npm run test:radar`，已纳入完整构建检查。
- `source/playground/presence/`：人存实验室，构造点云经过区间过滤、时间确认与无人延时，演示人物移动/静坐、风扇干扰、空帧/断流/旧帧、点云背景门限与芯片分工。`engine.mjs` 是确定性纯计算模型，`app.mjs` 管理场景和模拟时钟；不读取人物标签做分类，不连接设备、不上传或持久化数据。公开页只用通用规则，不带内部产品型号、参数或源码。
- `tools/test-presence.mjs`：区域边界、时间确认、存在样本去重、空帧与失联、恢复、背景门限及真值隔离测试，纳入 `npm run test:radar`。人存实验室从首页第四张快捷卡、实验室菜单与总览、雷达基础课和工具箱均可进入。
- `_config.yml`：Hexo 配置
- `_config.butterfly.yml`：当前 Butterfly 主题覆盖配置
- `_config.fluid.yml`：旧 Fluid 主题配置，仅保留为回退参考

## 发布边界

- 只发布可公开、经过整理的内容。
- 不发布公司内部信息、未公开产品细节、密钥、证书、设备标识或原始工作日志。
- 不发布姓名、照片、手机号、薪资、公司名称或具体产品型号。
- 私人知识库只作为选题来源，不与本站自动同步。
- 当前 GitHub Pages 从 `main` 根目录直接发布，提交前必须运行 `npm run prepare-pages`。
