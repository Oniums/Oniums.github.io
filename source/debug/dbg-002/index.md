---
title: DBG-002 Zephyr 构建引用旧 SDK
date: 2026-07-31 12:01:00
layout: page
aside: false
top_img: false
content_type: debug
debug_id: DBG-002
status: verified-method
evidence: public-diagnostic-note
privacy: public
description: 区分 Zephyr 源码问题与构建目录缓存污染。
---

<div class="lab-record-header"><span class="lab-record-id">DBG-002 · VERIFIED METHOD</span><h1>Zephyr 构建仍引用旧 SDK</h1><p>当构建日志指向已经失效的 SDK 路径时，第一检查对象应该是明确的构建目录和 CMake 缓存。</p></div>

## 现象

切换 SDK、工作区或 worktree 后，构建仍引用旧路径，甚至在真正编译产品源码前就失败。

## 排查顺序

1. 找到第一条真实错误；
2. 判断失败发生在 pristine、CMake、Kconfig、编译、链接还是打包；
3. 检查 `CMakeCache.txt` 中的 SDK、Board 和 Toolchain 路径；
4. 确认现有产物不是旧构建留下的假成功；
5. 只删除明确的项目生成目录后重新配置。

## 根因模式

构建目录是一次 SDK、Board、Toolchain 和 Kconfig 组合的配置快照。只替换源码或环境变量，不会自动让旧 build tree 变成另一套配置。

## 关联内容

- [Zephyr 构建仍引用旧 SDK：缓存污染的定位与修复](/posts/zephyr-stale-build-cache/)
- [Failure Museum](/failures/)
