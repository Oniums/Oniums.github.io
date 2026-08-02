---
title: Source Reading
date: 2026-07-31 10:03:00
layout: page
aside: false
top_img: false
description: 沿着调用链阅读 OpenThread、Zephyr 和 Matter 相关源码模块。
---

<div class="lab-page-lead"><p class="lab-eyebrow">SOURCE READING</p><h1>沿着调用链，而不是文件列表阅读源码。</h1><p>每条路线都拆成小模块，记录入口、关键状态、调用关系和仍未验证的问题。</p></div>

<div class="source-route">
  <div class="source-route-title"><span>路线 01</span><h2>OpenThread Attach</h2><p>从实例初始化一路追到设备成为 Child。</p></div>
  <ol><li><strong>main / Instance</strong><span>实例与协议栈入口</span></li><li><strong>MLE</strong><span>设备角色和控制消息</span></li><li><strong>Attach</strong><span>候选父节点与入网过程</span></li><li><strong>Become Child</strong><span>角色转换与后续网络状态</span></li></ol>
  <p><a href="/source-reading/openthread-attach/">进入路线详情</a> · <a href="/posts/thread-foundations/">相关基础文章</a> · <a href="/posts/wireshark-thread-packet-capture/">相关抓包文章</a></p>
</div>

<div class="source-route">
  <div class="source-route-title"><span>路线 03</span><h2>ZigBee NWK → APS → ZCL</h2><p>从网络层和 APS 传输一路追到 Endpoint 与 Cluster 分发。</p></div>
  <ol><li><strong>NWK</strong><span>地址、路由和安全边界</span></li><li><strong>APS</strong><span>Endpoint、Profile 和 Cluster</span></li><li><strong>AF</strong><span>Simple Descriptor 与注册关系</span></li><li><strong>ZCL</strong><span>属性、命令和响应</span></li></ol>
  <p><a href="/source-reading/zigbee-nwk-aps-zcl/">进入路线详情</a> · <a href="/posts/zigbee-foundations/">相关基础文章</a></p>
</div>

<div class="source-route">
  <div class="source-route-title"><span>路线 02</span><h2>Zephyr Build Pipeline</h2><p>从 west、CMake、Kconfig 到构建目录中的最终配置。</p></div>
  <ol><li><strong>west</strong><span>工作区与构建入口</span></li><li><strong>CMake</strong><span>配置和依赖生成</span></li><li><strong>Kconfig</strong><span>功能配置与覆盖</span></li><li><strong>Build Directory</strong><span>缓存和生成物</span></li></ol>
  <p><a href="/posts/telink-zephyr-matter-build-pipeline/">相关基础文章</a> · <a href="/posts/zephyr-stale-build-cache/">相关排障文章</a></p>
</div>
