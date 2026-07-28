---
title: Obsidian + GitHub：建立可跨设备同步的私人知识库
date: 2026-07-28 13:30:00
categories:
  - 搭建教程
tags:
  - Obsidian
  - Git
  - GitHub
  - 知识管理
---

Obsidian 适合编辑 Markdown，Git 适合保留历史，GitHub 私有仓库适合作为多设备之间的统一远端。稳定的知识库需要明确目录、同步顺序和敏感信息边界，而不是把所有文件直接扔进一个自动同步目录。

<!-- more -->

## 推荐架构

```text
Desktop Obsidian + Git
             │
             ▼
     GitHub private repository
             ▲
             │
Mobile Git client / sync tool
             ▲
             │
Server native Git
```

核心原则是只有一个 Git 远端作为同步中心，不同时叠加多个会直接修改同一目录的云盘同步方案。

## 创建私有仓库

使用 GitHub CLI：

```bash
gh repo create my-knowledge --private
git clone git@github.com:<username>/my-knowledge.git
cd my-knowledge
```

也可以先创建本地 vault，再初始化：

```bash
git init
git branch -M main
git remote add origin <private-repository-url>
```

首次推送前确认远端是否为空，避免把两个独立初始历史直接合并。

## 设计目录，而不是堆文件

一种可扩展结构：

```text
00-inbox/       临时捕获
10-personal/    个人记录
20-work/        工作日志与复盘
30-technical/   可复用技术知识
40-projects/    项目索引
50-library/     资料与阅读笔记
60-output/      整理完成的输出
90-archive/     非活跃内容
_assets/        普通附件
_templates/     模板
_meta/          写作与维护规则
```

目录编号让移动端和文件浏览器中的顺序稳定。`00-inbox` 用于快速记录，定期整理到长期目录。

## 初始化 Obsidian

在 Obsidian 中选择“Open folder as vault”，打开仓库根目录。建议先配置：

- 默认新笔记位置；
- 附件统一放入 `_assets/`；
- 模板目录；
- 日记目录；
- Markdown 链接风格；
- 是否保存编辑器工作区状态。

Obsidian 的 UI 布局文件很容易在不同屏幕间冲突，可以在 `.gitignore` 排除：

```gitignore
.obsidian/workspace*.json
.obsidian/cache/
.trash/
.DS_Store
Thumbs.db
```

插件配置是否提交应逐项决定。需要跨设备一致的插件列表可以保留，纯本机 UI 状态应忽略。

## 桌面端使用 Obsidian Git

Obsidian Git 社区插件支持 commit、pull、push、diff 和定时同步。较稳妥的顺序是：

```text
pull
  -> edit
  -> review diff
  -> commit
  -> push
```

可以启用启动时 pull 和定时 commit，但不建议让多个设备在很短周期内同时自动写同一批文件。自动化越强，越需要稳定的冲突处理习惯。

## 移动端不要照搬桌面方案

Obsidian Git 官方项目明确提示移动端实现存在仓库大小、内存、SSH、rebase 和 submodule 限制。移动端可以选择更适合本机系统的 Git 客户端或 GitSync 类工具。

无论使用哪种工具，都应遵守：

1. 开始编辑前同步；
2. 同一篇长文尽量不要多设备同时修改；
3. 冲突出现后先备份双方内容；
4. 不用“强制覆盖远端”解决普通冲突；
5. 大附件先评估移动端 clone 和 pull 成本。

## Git 历史不是秘密保险箱

私有仓库仍不应该保存：

- 密码和访问令牌；
- SSH 私钥；
- 设备证书与生产密钥；
- 未经授权的第三方机密资料；
- 可以重新生成的大型二进制文件。

文件从最新版本删除后，旧内容仍可能存在于 Git 历史。敏感数据一旦提交，应立即轮换凭据，并按需要清理历史。

## 大文件策略

Markdown 和小图片非常适合 Git；大型 PDF、视频和二进制会迅速增大历史。

建议：

- 普通 PDF 控制大小；
- 原始资料与摘要分开；
- 超大、低频文件放独立资料库；
- 启用 Git LFS 前先验证所有移动端工具；
- 不把软件缓存和生成物提交进知识库。

## 知识库与公开网站的边界

私人知识库可以包含临时假设、原始日志位置和项目上下文；公开站点只接收重新编写、脱敏和验证后的文章。

```text
快速记录
  -> 验证笔记
  -> 脱敏稿件
  -> 公开文章
```

不要建立“整个 vault 自动发布”的流水线。更安全的自动化是检查格式、链接和敏感标记，最终发布仍由明确选择触发。

参考资料：

- [Obsidian Git](https://github.com/Vinzent03/obsidian-git)
- [Obsidian Git Getting Started](https://github.com/Vinzent03/obsidian-git/blob/master/docs/Getting%20Started.md)
- [GitHub Repository Quickstart](https://docs.github.com/en/repositories/creating-and-managing-repositories/quickstart-for-repositories)

