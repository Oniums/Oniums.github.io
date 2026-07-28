---
title: Thread 基础概念：IPv6 Mesh、设备角色与 Border Router
date: 2026-07-28 20:10:00
categories:
  - 无线协议
tags:
  - Thread
  - IPv6
  - OpenThread
  - Border Router
---

Thread 是建立在 IEEE 802.15.4 之上的低功耗 IPv6 Mesh 网络协议。它提供网络连接能力，但不规定灯、传感器或门锁应该有哪些应用 Cluster。

<!-- more -->

## 协议栈位置

```text
Matter 或其他 IP 应用
  -> UDP / IPv6
  -> 6LoWPAN
  -> Thread Mesh Link Establishment 与路由
  -> IEEE 802.15.4 MAC / PHY
```

这也是 Matter over Thread 与 Zigbee 的关键区别：Thread 承载 IP，Zigbee 使用自己的 NWK、APS 和应用层体系。

## 常见设备角色

| 角色 | 作用 |
|---|---|
| Leader | 管理当前 Partition 的路由器集合与网络数据 |
| Router | 转发 IPv6 数据并允许子设备连接 |
| Router-Eligible End Device | 当前是 End Device，条件满足时可升级为 Router |
| Full End Device | 不承担路由，但保持完整接收能力 |
| Minimal End Device | 能力更精简，通过父节点通信 |
| Sleepy End Device | 周期性向父节点 Poll，适合低功耗 |
| Border Router | 在 Thread Mesh 与相邻 IP 网络之间路由 |

Leader 不是所有报文的中央转发器。角色可以变化，网络会根据拓扑自动维护 Router 集合。

## Border Router 不是应用网关

Thread Border Router 的核心职责是 IP 路由和网络数据传播。它让 Thread 节点能与 Wi-Fi/Ethernet 等相邻 IPv6 网络通信。

它通常不负责把一个应用协议翻译成另一个应用协议。Zigbee-to-Matter Bridge 执行的是应用数据模型映射，与 Thread Border Router 是不同角色。

一个 Thread 网络可以有多个 Border Router，从而减少单点依赖。

## Thread 网络凭据

Active Operational Dataset 描述 Thread 网络的关键参数，例如信道、PAN 标识、Mesh-Local Prefix 和网络安全材料。

它是敏感配置：

- 不提交到公开仓库；
- 不直接粘贴到问题单；
- 抓包时只在授权本地环境加载；
- 示例使用占位符，不复用真实网络数据。

## IPv6 地址为什么不止一个

Thread 节点通常具有多类 IPv6 地址：

- Link-Local：邻居链路上的本地通信；
- Mesh-Local EID：拓扑无关的 Mesh 内地址；
- Routing Locator：反映当前拓扑位置；
- Border Router 提供前缀形成的地址；
- 多播地址。

因此，看到一个 IPv6 地址变化不一定代表节点身份变化。排障要结合地址类型、作用域、接口和 Node 身份。

## Attach 的高层流程

```text
扫描与发现 Partition
  -> 选择父节点
  -> MLE 建立安全邻居关系
  -> 获得网络数据和地址
  -> 成为 Child 或 Router
  -> IPv6 可达
```

Thread Attach 成功只证明网络层建立。Matter 还需要 operational discovery、CASE 和应用交互。

## 低功耗与父节点

Sleepy End Device 关闭接收机来省电，通过父节点缓存和周期性 Poll 接收数据。关键参数包括：

- Poll 周期；
- 消息等待时间；
- 应用订阅的最大间隔；
- 重试和父节点切换；
- 设备醒来后的处理预算。

过度延长 Poll 周期会降低功耗，但也可能造成控制延迟、消息过期或 commissioning 超时。

## 抓包识别

Thread 抓包常见层级包括：

- IEEE 802.15.4；
- 6LoWPAN；
- MLE；
- IPv6 / UDP；
- CoAP；
- 加密后的 Matter 消息。

Thread Network Key 可以帮助分析 Thread 网络层，但不能因此解密 Matter CASE 业务负载。

继续阅读：

- [Thread 官方概览](https://threadgroup.org/what-Is-thread/overview)
- [Thread Network Fundamentals](https://www.threadgroup.org/Portals/0/documents/support/Thread%20Network%20Fundamentals_v3.pdf)
- [OpenThread 文档](https://openthread.io/guides)
