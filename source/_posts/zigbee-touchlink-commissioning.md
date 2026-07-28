---
title: Zigbee Touchlink 流程：近距离发现、识别与入网
date: 2026-07-28 20:50:00
categories:
  - 无线协议
tags:
  - Zigbee
  - Touchlink
  - Commissioning
  - ZCL
---

Touchlink 是 Zigbee 的一种近距离 commissioning 机制，最初广泛用于照明设备。它不是普通的 Network Steering，也不是“按键后信号强就自动入网”这么简单。

<!-- more -->

## 两个角色

- Initiator：发起 Touchlink 的控制设备；
- Target：被发现、识别、复位或加入网络的设备。

两者通过 Touchlink Commissioning Cluster 交互。是否支持某条命令、某种设备角色和网络类型，应由目标版本的 PICS 决定。

## 高层流程

```text
Initiator 扫描信道
  -> Scan Request
  <- Scan Response
  -> 根据距离、能力和状态选择 Target
  -> 可选 Identify / Device Information
  -> Network Start 或 Network Join
  -> 受保护地传输网络参数
  -> Target 切换信道并启动网络
  -> 后续应用发现与配置
```

Touchlink 还可能提供 Reset to Factory New 等管理动作，因此触发条件和物理在场约束非常重要。

## 扫描与“近距离”判断

Initiator 会在规定信道上发送扫描请求，Target 返回能力、网络状态等信息。实现通常根据接收信号强度或协议定义的 proximity 条件筛选目标。

RSSI 只是一项输入：

- 不同硬件的接收链路和校准不同；
- 环境反射会造成波动；
- 强信号不等于身份可信；
- 过宽阈值可能误选附近其他设备。

因此还应结合用户动作、设备状态、响应事务标识和超时窗口。

## Identify 不是入网

Identify 让用户确认正在操作哪台设备，例如闪灯或执行可见动作。它不表示网络参数已经写入，也不表示 Target 已完成加入。

推荐成功锚点：

1. Scan Response 匹配当前事务；
2. 选择了唯一目标；
3. Identify 行为可被用户确认；
4. Network Start/Join 响应成功；
5. Target 在目标信道启动；
6. 后续受保护 Zigbee 通信成功。

## 网络参数传输

Touchlink 使用专门的 commissioning 安全过程保护 Network Key 等网络参数。其 commissioning Key 只服务于这一阶段，不应与日常 NWK 使用的 Network Key 混淆。

公开日志中不应输出：

- commissioning Key；
- Network Key；
- 未脱敏的设备唯一地址；
- 可用于复现实网加入的数据。

## 与经典加入的区别

| 项目 | Touchlink | Network Steering |
|---|---|---|
| 发现方式 | 主动近距离扫描目标 | 扫描允许加入的网络 |
| 主要角色 | Initiator / Target | Trust Center、父节点、Joiner |
| 典型触发 | 用户近距离操作 | 设备进入入网模式 |
| 安全路径 | Touchlink commissioning 安全 | BDB 加入与 Link Key 策略 |
| 后续结果 | 建网、加入或管理动作 | 加入现有网络 |

Touchlink 成功后仍需要正常 Zigbee 网络和应用层交互；它不是独立的日常通信协议。

## 常见失败分类

- 扫描不到：信道集、时序、角色能力或距离门限；
- 响应被丢弃：事务标识、重复帧或状态不匹配；
- Identify 成功但 Join 失败：网络状态、目标角色或安全参数；
- 参数写入后未启动：信道切换、持久化或状态机；
- 入网后不可用：Endpoint 发现、Cluster、binding 或 reporting；
- Reset 行为异常：Factory New 判定和持久化清理不完整。

## 规范边界

旧 ZCL 中可以找到 Touchlink Commissioning Cluster，但认证实现不能只照抄旧章节。应同时冻结目标 Zigbee Core、BDB、ZCL、PICS、Errata 和测试用例，并确认当前认证计划是否接受所选 Touchlink 能力。

公开入口包括 [CSA Zigbee 规范下载页](https://csa-iot.org/developer-resource/specifications-download-request/)与 [Zigbee 认证工具页](https://csa-iot.org/certification/tools/)。
