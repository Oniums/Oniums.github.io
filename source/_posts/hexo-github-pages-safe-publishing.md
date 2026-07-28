---
title: 从零搭建 Hexo + Fluid + GitHub Pages：把隐私检查放进发布链
date: 2026-07-28 14:00:00
categories:
  - 搭建教程
tags:
  - Hexo
  - GitHub Pages
  - Fluid
  - 隐私检查
---

个人技术站不只是把 Markdown 变成 HTML。更可靠的发布链应该同时管理源码、生成物、站内链接和公开边界，让敏感内容在推送之前就被阻止。

<!-- more -->

## 最小架构

Hexo 把 `source/` 中的 Markdown 和静态资源渲染到 `public/`：

```text
source Markdown
  -> Hexo generate
  -> public static files
  -> checks
  -> GitHub Pages
```

GitHub Pages 支持两类发布方式：

1. 从指定分支的根目录或 `docs/` 目录发布；
2. 使用 GitHub Actions 构建并部署 artifact。

对于非 Jekyll 的静态站点，GitHub 和 Hexo 官方文档都提供了 Actions 方案。它能让仓库只保存源内容，由 CI 生成 `public/`，通常更容易维护。分支根目录方案也可用，但必须明确管理生成物同步。

## 初始化 Hexo

准备 Node.js 和 Git 后：

```bash
npm install -g hexo-cli
hexo init my-site
cd my-site
npm install
```

安装 Fluid：

```bash
npm install --save hexo-theme-fluid
```

在 `_config.yml` 中启用：

```yaml
title: My Notes
url: https://username.github.io
root: /
theme: fluid
language: zh-CN
```

再创建 `_config.fluid.yml` 保存主题覆盖配置。把自定义配置放在站点仓库，而不是直接修改 `node_modules` 中的主题源码，这样升级和审查都更清晰。

## 建立内容结构

建议至少区分：

```text
source/
├── _posts/       # 按日期发布的文章
├── about/        # 关于页面
├── projects/     # 项目与实践
├── css/          # 自定义样式
└── img/          # 公开图片
```

文章使用 YAML front matter：

```yaml
---
title: 一篇文章
date: 2026-07-28 10:00:00
categories:
  - 工程实践
tags:
  - 调试
---
```

## 本地构建不是最终检查

最基础的命令是：

```bash
hexo clean
hexo generate
hexo server
```

但“生成成功”只说明模板没有立即报错。发布前还应该检查：

- 首页、404、文章和独立页面是否存在；
- HTML 中的站内 `href`、`src` 是否有目标；
- 默认主题示例是否残留；
- sitemap、feed 和搜索索引是否包含新内容；
- 删除页面是否仍残留在生成目录；
- CSS 是否可以正常解析。

把检查写进 `package.json`：

```json
{
  "scripts": {
    "clean": "hexo clean",
    "build": "hexo generate",
    "check": "npm run clean && npm run build && node tools/check-site.mjs"
  }
}
```

## 把隐私规则变成构建门

只靠发布前“记得检查”并不可靠。可以维护一组禁止标记：

```js
const forbiddenMarkers = [
  "真实姓名",
  "公司全称",
  "内部产品代号",
  "PRIVATE_KEY",
  "BEGIN CERTIFICATE"
];
```

扫描范围不仅包括 Markdown，还应包括最终 HTML、搜索索引、feed 和 sitemap。原因是：

- 已删除源文件可能仍残留在旧生成目录；
- 页面摘要可能进入 meta description；
- 搜索索引可能保存正文副本；
- 导航和站点地图可能继续暴露旧地址。

手机号可以使用格式规则检测：

```js
const phonePattern = /\b1[3-9]\d{9}\b/g;
```

格式扫描只是最后一道保险，不能代替内容审查。邮箱、芯片型号等字段是否公开，需要按个人边界单独决定。

## 两种部署方式

### 方案 A：GitHub Actions

把 `public/` 加入 `.gitignore`，CI 中执行安装、构建、检查和部署：

```text
checkout
  -> npm ci
  -> npm run check
  -> upload-pages-artifact(public)
  -> deploy-pages
```

在仓库 `Settings → Pages` 中选择 GitHub Actions。Node.js 主版本应与本地验证环境一致。

### 方案 B：分支目录发布

如果从 `main / (root)` 发布，根目录必须包含最终 `index.html`。此时需要受控同步脚本：

```text
clean
  -> generate public/
  -> checks pass
  -> remove known old generated targets
  -> copy current output to publish root
```

不要简单覆盖现有文件，否则已经删除的文章目录可能继续在线。

## 发布后的闭环

推送后继续检查：

1. Pages 构建对应的是当前提交；
2. 状态为成功；
3. 首页和核心页面返回 200；
4. 已删除页面返回 404；
5. 线上 HTML 不含禁止标记；
6. 本地与远端提交一致。

只有本地构建和线上结果都通过，发布才算完成。

## 公开边界建议

私人知识库可以作为选题和证据索引，但不应自动全量同步。公开文章应重新组织背景、删除身份和内部信息，并明确区分事实、推断与适用范围。

参考资料：

- [Hexo Setup](https://hexo.io/docs/setup.html)
- [Hexo GitHub Pages](https://hexo.io/docs/github-pages)
- [Fluid Theme Repository](https://github.com/fluid-dev/hexo-theme-fluid)
- [GitHub Pages 发布源配置](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)
