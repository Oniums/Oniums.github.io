---
title: DBG-001 从日志到协议阶段
date: 2026-07-31 12:00:00
layout: page
aside: false
top_img: false
content_type: debug
debug_id: DBG-001
status: method-record
evidence: public-method-note
privacy: public
description: 用时间线、调用链和证据分级定位嵌入式问题。
---

<div class="lab-record-header"><span class="lab-record-id">DBG-001 · METHOD RECORD</span><h1>从日志到协议阶段</h1><p>调试记录的目标不是收集最多日志，而是找到最后一个明确成功阶段和第一个明确失败阶段。</p></div>

## 排查链

```text
现象
  -> 时间线
  -> 协议阶段
  -> 调用链
  -> 证据分级
  -> 最小验证
  -> 根因或剩余未知
```

## 证据分级

- 已证实：能由代码、日志、抓包或实验直接支持；
- 高概率推断：与多项证据一致，但还缺少决定性观察；
- 未知：当前信息不足，存在多个解释。

## 当前收获

“请求已发送”“函数返回成功”和“对端应用已接受”是不同阶段。异步回调、工作队列和协议确认必须单独设置观察点。

## 关联内容

- [从日志到协议阶段：建立嵌入式排障的证据链](/posts/debugging-with-an-evidence-chain/)
- [Debug Diary](/debug/)
