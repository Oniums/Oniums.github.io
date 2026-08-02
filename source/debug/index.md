---
title: Debug Diary
date: 2026-07-31 10:04:00
layout: page
aside: false
top_img: false
description: 记录嵌入式问题从现象、假设到验证和根因的完整过程。
---

<div class="lab-page-lead"><p class="lab-eyebrow">DEBUG DIARY</p><h1>不要只记录“修好了”。</h1><p>调试记录的价值在于保留思考路径：什么现象支持了什么假设，又是什么证据让它被推翻。</p></div>

<div class="lab-record-grid">
  <a class="lab-record-card" href="/debug/dbg-001/"><span class="lab-record-id">DBG-001 · 方法记录</span><h2>从日志到协议阶段</h2><p>建立现象、阶段、证据和结论之间的排障链路。</p><span class="lab-card-link">查看调试记录 →</span></a>
  <a class="lab-record-card" href="/debug/dbg-002/"><span class="lab-record-id">DBG-002 · 已验证方法</span><h2>Zephyr 构建仍引用旧 SDK</h2><p>从第一条真实错误定位到构建缓存和 CMake 配置快照。</p><span class="lab-card-link">查看调试记录 →</span></a>
  <a class="lab-record-card" href="/debug/dbg-003/"><span class="lab-record-id">DBG-003 · 方法记录</span><h2>GPIO 快速跳变与 ISR 延后处理</h2><p>区分中断响应、去抖和后续业务处理的职责边界。</p><span class="lab-card-link">查看调试记录 →</span></a>
  <a class="lab-record-card" href="/debug/dbg-004/"><span class="lab-record-id">DBG-004 · 已验证经验</span><h2>Parent Loss、Leave 与 Rejoin</h2><p>区分休眠终端父节点丢失、远程 Leave 和恢复出厂。</p><span class="lab-card-link">查看调试记录 →</span></a>
  <a class="lab-record-card" href="/debug/dbg-005/"><span class="lab-record-id">DBG-005 · 已验证方法</span><h2>有 MAC ACK 但没有 ZCL Response</h2><p>从链路层确认推进到 APS Endpoint 和 ZCL 分发。</p><span class="lab-card-link">查看调试记录 →</span></a>
</div>
