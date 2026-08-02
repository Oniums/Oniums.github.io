---
title: EXP-004 Poll Interval 与设备可达性
date: 2026-07-31 11:02:00
layout: page
aside: false
top_img: false
content_type: experiment
experiment_id: EXP-004
status: design-record
evidence: deidentified-technical-note
privacy: public
description: 区分低功耗设备的静态 Poll 配置、运行时快慢状态和最终可达性证据。
---

<div class="lab-record-header"><span class="lab-record-id">EXP-004 · DESIGN RECORD</span><h1>Poll Interval 变化是否真的改善可达性？</h1><p>低功耗设备可能在空闲时慢轮询、发生网络活动时快轮询。实验需要同时观察配置、运行时状态、电流和消息闭环。</p></div>

## 实验目的

验证以下问题是否能够被独立证明：

- 设备是否确实进入了低功耗终端模式；
- 空闲状态与活动状态是否使用不同 Poll Interval；
- 快速轮询是否缩短了消息到达延迟；
- 配置存在是否等于运行时状态机已经接管；
- 设备可达性是否最终闭环到应用响应。

## 测量矩阵

| 阶段 | 必要观察 |
|---|---|
| 构建 | 最终配置和相关符号 |
| 数据模型 | 设备是否暴露对应能力 |
| 运行时 | Idle / Active 状态切换 |
| Thread | Poll Interval 实际变化 |
| 功耗 | 睡眠电流和唤醒波形 |
| 应用 | 请求、确认、响应和超时 |

## 当前结论

静态配置只能证明“系统具备某项能力”，不能证明运行时已经动态切换。功耗尖峰也不能单独证明是哪一层设置了 Poll Interval。决定性实验应把设备日志、空口时间线和电流波形对齐。

## 关联内容

- [Thread 基础概念](/posts/thread-foundations/)
- [Wireshark + Thread 抓包](/posts/wireshark-thread-packet-capture/)
- [Oniums Lab 实验记录](/experiments/)
