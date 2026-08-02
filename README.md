# Oniums.github.io

Oniums 的个人博客，使用 Hexo 和 Butterfly 构建，通过 GitHub Pages 发布。

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
- `_config.yml`：Hexo 配置
- `_config.butterfly.yml`：当前 Butterfly 主题覆盖配置
- `_config.fluid.yml`：旧 Fluid 主题配置，仅保留为回退参考

## 发布边界

- 只发布可公开、经过整理的内容。
- 不发布公司内部信息、未公开产品细节、密钥、证书、设备标识或原始工作日志。
- 不发布姓名、照片、手机号、薪资、公司名称或具体产品型号。
- 私人知识库只作为选题来源，不与本站自动同步。
- 当前 GitHub Pages 从 `main` 根目录直接发布，提交前必须运行 `npm run prepare-pages`。
