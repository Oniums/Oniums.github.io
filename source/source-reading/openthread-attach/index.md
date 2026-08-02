---
title: OpenThread Attach 源码阅读路线
date: 2026-07-31 14:00:00
layout: page
aside: false
top_img: false
content_type: source-reading
series: openthread-attach
status: planned
evidence: public-protocol-map
privacy: public
description: 从 OpenThread 实例入口沿着 MLE 和 Attach 阅读到 Become Child。
---

<div class="lab-record-header"><span class="lab-record-id">SOURCE ROUTE · OPENTHREAD ATTACH</span><h1>从 Instance 到 Become Child</h1><p>这条路线先建立调用链和协议阶段，再逐步补充源码版本、关键函数和运行证据。</p></div>

## 阅读顺序

<div class="source-route source-route-detail"><ol><li><strong>main / Instance</strong><span>确认实例创建、任务驱动和协议栈入口。</span></li><li><strong>MLE</strong><span>识别设备角色、消息类型和状态转换。</span></li><li><strong>Attach</strong><span>追踪候选父节点、请求、响应和安全邻居建立。</span></li><li><strong>Become Child</strong><span>确认网络数据、地址和最终角色状态。</span></li></ol></div>

## 每一篇阅读记录

固定记录以下问题：

- 入口函数是谁？
- 状态由谁创建和推进？
- 哪个回调或消息代表阶段成功？
- 失败时保留哪些状态？
- 代码证据与抓包、串口日志如何对齐？
- 当前源码版本和适用范围是什么？

## 目前状态

路线已经建立，具体源码版本和函数级笔记尚未完成。因此本页状态是 `planned`，不能把路线图当作已经完成的源码审查。

关联入口：[Thread 基础概念](/posts/thread-foundations/) · [Thread 抓包流程](/posts/wireshark-thread-packet-capture/) · [Source Reading](/source-reading/)
