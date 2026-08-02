---
title: ZigBee NWK 到 ZCL 源码阅读路线
date: 2026-07-31 14:01:00
layout: page
aside: false
top_img: false
content_type: source-reading
series: zigbee-nwk-aps-zcl
status: planned
evidence: deidentified-technical-note
privacy: public
description: 从 ZigBee 网络层、APS 层一路阅读到 Endpoint 和 ZCL 分发。
---

<div class="lab-record-header"><span class="lab-record-id">SOURCE ROUTE · ZIGBEE NWK → ZCL</span><h1>一条 ZCL 请求是怎样到达 Cluster 的？</h1><p>这条路线用于解释“空口收到了请求，但应用没有响应”时，中间到底经过了哪些层。</p></div>

## 阅读顺序

<div class="source-route source-route-detail"><ol><li><strong>NWK</strong><span>地址、路由和网络安全边界。</span></li><li><strong>APS</strong><span>Endpoint、Profile、Cluster 和传输确认。</span></li><li><strong>AF / Simple Descriptor</strong><span>设备是否在目标 Endpoint 注册对应 Cluster。</span></li><li><strong>ZCL</strong><span>命令、属性访问、方向和响应生成。</span></li></ol></div>

## 每一篇阅读记录

- 当前消息处在哪一层？
- 谁确认了它？MAC ACK、APS ACK 还是 ZCL Response？
- Destination Endpoint 是否被正确解析？
- Simple Descriptor 和 Cluster 注册从哪里建立？
- 失败时下一层是否仍然会看到事件？

## 当前状态

路线已完成问题拆分，具体 SDK 版本和函数级源码笔记尚未公开。后续会先用通用协议代码和公开文档完成第一遍，再决定是否添加实现差异。

关联入口：[ZigBee 基础概念](/posts/zigbee-foundations/) · [ZigBee 入网流程](/posts/zigbee-network-joining-flow/) · [Source Reading](/source-reading/)
