---
title: Knowledge
date: 2026-07-31 10:01:00
layout: page
aside: false
top_img: false
description: Matter、Thread、ZigBee 与 Zephyr 的可扩展知识地图。
---

<div class="lab-page-lead"><p class="lab-eyebrow">KNOWLEDGE MAP</p><h1>知识不是分类，而是关系。</h1><p>每个节点都应该有前置知识、关联文章、实验和验证状态。下面是第一版知识树入口。</p></div>

<div class="knowledge-tree">
  <section><div class="knowledge-root">无线通信与设备工程</div><div class="knowledge-branches">
    <article><h2>Matter</h2><ul><li>Node / Fabric / Endpoint</li><li>Commissioning</li><li>PASE / CASE</li><li>Data Model / Interaction Model</li></ul><a href="/posts/matter-foundations/">阅读 Matter 基础 →</a></article>
    <article><h2>Thread</h2><ul><li>IPv6 Mesh</li><li>MLE</li><li>Attach</li><li>SED / Border Router</li><li>Polling / ICD</li></ul><a href="/posts/thread-foundations/">阅读 Thread 基础 →</a></article>
    <article><h2>ZigBee</h2><ul><li>NWK</li><li>APS</li><li>Security</li><li>Touchlink</li><li>Sleepy End Device</li></ul><a href="/posts/zigbee-foundations/">阅读 ZigBee 基础 →</a></article>
    <article><h2>Zephyr</h2><ul><li>CMake / west</li><li>Kconfig</li><li>Device Driver</li><li>Power Management</li></ul><a href="/posts/telink-zephyr-matter-build-pipeline/">阅读构建链路 →</a></article>
  </div></section>
</div>

## 节点状态

```text
planned     尚未系统学习
learning    正在建立概念模型
understood  能够解释主要关系
verified    有代码、实验或抓包证据
maintained  已形成可复用长期笔记
```

知识树会继续扩展，但不会把节点简单等同于文章分类。
