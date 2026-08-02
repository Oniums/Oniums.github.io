---
title: DBG-003 GPIO 快速跳变与 ISR 延后处理
date: 2026-07-31 12:02:00
layout: page
aside: false
top_img: false
content_type: debug
debug_id: DBG-003
status: method-record
evidence: public-firmware-note
privacy: public
description: 把 GPIO 中断响应、去抖和后续业务处理拆成不同阶段。
---

<div class="lab-record-header"><span class="lab-record-id">DBG-003 · METHOD RECORD</span><h1>GPIO 快速跳变与 ISR 延后处理</h1><p>快速 GPIO 事件的可靠处理重点不是把所有逻辑塞进 ISR，而是保留最小事件并在后续上下文完成判断。</p></div>

## 排查问题

- ISR 是否只做必要的硬件读取和事件记录？
- 去抖是在中断上下文、工作队列还是状态机中完成？
- 快速连续事件是否会覆盖、丢失或重复消费？
- 低功耗唤醒和 GPIO 电平状态是否改变了事件语义？

## 当前收获

要分别验证“中断到达”“事件入队”“去抖完成”和“业务状态变化”，不能只用最终上报结果推断中间阶段都成功。

## 关联内容

- [GPIO 快速跳变优化：让 ISR 只做必须做的事](/posts/gpio-isr-deferred-processing/)
- [Debug Diary](/debug/)
