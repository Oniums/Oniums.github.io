---
title: Failure-001 相似名词不等于相同协议
date: 2026-07-31 13:00:00
layout: page
aside: false
top_img: false
content_type: failure
failure_id: FAILURE-001
status: verified-lesson
evidence: public-protocol-note
privacy: public
description: 记录 Matter 与 ZigBee 概念类比的边界。
---

<div class="lab-record-header"><span class="lab-record-id">FAILURE-001 · VERIFIED LESSON</span><h1>相似名词不等于相同协议</h1><p>跨协议学习时，名称相似很容易制造错误映射；真正应该对照的是层级、生命周期、安全目的和数据语义。</p></div>

## 错误倾向

看到 Node、Endpoint、Cluster、Commissioning 等共同词汇后，直接把 Matter 与 ZigBee 的流程和安全概念一一对应。

## 被什么证据推翻

分层对照显示：Matter 使用 IPv6、PASE、CASE 和 Fabric；ZigBee 使用 NWK、APS、BDB 和 Trust Center 模型。它们可以在业务语义上做映射，但不能互换消息、密钥或成功判断。

## 可迁移经验

先问“这个概念处在哪一层、解决什么问题、成功锚点是什么”，再建立跨协议对照表。

## 关联内容

- [Matter 与 ZigBee 关系映射](/posts/matter-zigbee-concept-mapping/)
- [Failure Museum](/failures/)
