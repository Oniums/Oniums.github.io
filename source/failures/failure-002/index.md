---
title: Failure-002 构建缓存问题不一定是源码问题
date: 2026-07-31 13:01:00
layout: page
aside: false
top_img: false
content_type: failure
failure_id: FAILURE-002
status: verified-lesson
evidence: public-diagnostic-note
privacy: public
description: 记录如何把旧构建目录误认为源码或 SDK 故障。
---

<div class="lab-record-header"><span class="lab-record-id">FAILURE-002 · VERIFIED LESSON</span><h1>构建缓存问题不一定是源码问题</h1><p>看到旧路径、旧产物或配置异常时，先区分“本次构建失败”和“旧生成物仍然存在”。</p></div>

## 错误倾向

把构建日志中的旧 SDK 路径直接归因于源码、工具链或 SDK 本身损坏，并立即修改产品代码。

## 决定性检查

查看构建阶段、退出码、产物修改时间和 `CMakeCache.txt`。如果错误发生在配置阶段，编译器可能还没有处理任何产品源码。

## 可迁移经验

构建目录应按 SDK、Board 和构建类型隔离；缓存身份变化时优先重新配置明确的生成目录，而不是盲目改代码。

## 关联内容

- [Zephyr 构建仍引用旧 SDK](/debug/dbg-002/)
- [Failure Museum](/failures/)
