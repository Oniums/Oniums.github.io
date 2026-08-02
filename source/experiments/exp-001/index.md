---
title: EXP-001 环境光传感器采样策略
date: 2026-07-31 11:00:00
layout: page
aside: false
top_img: false
content_type: experiment
experiment_id: EXP-001
status: design-record
evidence: public-design-note
privacy: public
description: 比较单次采样、连续阈值监测和 MCU 定时采样在功耗与响应速度上的取舍。
---

<div class="lab-record-header"><span class="lab-record-id">EXP-001 · DESIGN RECORD</span><h1>环境光传感器：IRQ 一定更省电吗？</h1><p>本条目把一篇低功耗设计文章转换成实验记录格式。当前是设计记录和验证计划，不代表已经完成具体硬件实测。</p></div>

## 实验目的

判断以下三种方案在不同业务目标下的适用边界：

1. Single-shot / Forced Mode；
2. MCU 定时按需采样；
3. 连续测量加阈值 IRQ。

## 假设

对于只需周期性获得 lux 值的电池设备，传感器按需 Active 后回到 Standby，通常比长期连续 Active 更适合作为低功耗基线。需要快速响应明暗变化时，连续 IRQ 可能是合理的产品取舍，但不能直接称为低功耗方案。

## 示例参数

以下参数来自公开文章中的占空比估算，仅用于说明测量方法，不是某台设备的实测结果：

| 参数 | 示例值 |
|---|---:|
| Active 电流 | 266 µA |
| Standby 电流 | 5 µA |
| 采样周期 | 5 s |
| 单次 Active 时间 | 25 ms / 55 ms |

## 应记录的数据

- 传感器电源轨平均电流；
- MCU 输入端平均电流；
- 采样完成延迟；
- 事件触发响应时间；
- I2C 错误、超时和回 Standby 成功率；
- 光照稳定、阈值附近和快速变化三种场景。

## 当前结论

公开设计推导支持“先比较占空比和传感器工作模式”的方向，但还不能证明某个具体器件或整机的最终功耗。下一步应使用相同硬件比较固定周期、事件优先和连续 IRQ 三组 profile。

## 关联内容

- [环境光传感器：IRQ、单次采样与低功耗取舍](/posts/ambient-light-sensor-low-power-sampling/)
- [Oniums Lab 实验记录](/experiments/)
