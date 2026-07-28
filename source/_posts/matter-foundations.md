---
title: Matter 基础概念：Node、Fabric、Endpoint 与安全会话
date: 2026-07-28 20:20:00
categories:
  - 无线协议
tags:
  - Matter
  - Fabric
  - Data Model
  - Commissioning
---

Matter 是基于 IPv6 的应用层连接标准。它定义的不只是 Cluster，还包括发现、commissioning、安全会话、数据模型、交互模型和设备生命周期。

<!-- more -->

## Matter 在协议栈中的位置

```text
设备应用
  -> Data Model：Node / Endpoint / Device Type / Cluster
  -> Interaction Model：Read / Write / Invoke / Subscribe
  -> 安全会话：PASE / CASE / Group
  -> IPv6 + UDP
  -> Thread、Wi-Fi 或 Ethernet
```

Bluetooth LE 通常作为设备初次 commissioning 的近距离通道，不是 Matter 日常业务通信的 IP 承载。

## Node 与 Endpoint

- Node：一个可寻址的 Matter 逻辑节点；
- Endpoint 0：根端点，承载基础设施和管理 Cluster；
- 其他 Endpoint：承载产品功能；
- Device Type：声明 Endpoint 符合哪类标准设备语义；
- Cluster：一组相关属性、命令和事件。

同一物理设备可以有多个 Endpoint，也可以在一个 Fabric 中对应一个 Node。

## Cluster、Attribute、Command 与 Event

| 元素 | 含义 |
|---|---|
| Attribute | 可读取、可订阅，部分可写的状态 |
| Command | 客户端发起的一次操作 |
| Event | 带优先级和事件编号的历史事件 |
| Feature | Cluster 的可选能力组合 |

Interaction Model 统一了：

- Read：读取属性或事件；
- Write：修改允许写入的属性；
- Invoke：调用命令；
- Subscribe：建立持续订阅并接收报告。

实现了 Cluster 不等于实现了全部可选 Feature。Device Type、Cluster 规范、FeatureMap、全局属性与实际处理逻辑必须一致。

## Fabric 是什么

Fabric 是一组共享信任域和管理关系的 Matter 节点。一个设备可以加入多个 Fabric，每个 Fabric 拥有独立的：

- Fabric Index；
- Node ID；
- Operational Certificate；
- Group Key 与访问控制状态；
- 订阅和管理关系。

删除一个订阅不等于删除 Fabric；某个 Fabric 断开，也不代表其他 Fabric 必然受影响。

## Commissioning 的阶段

一个简化流程：

```text
发现 commissionable device
  -> PASE 建立初始安全通道
  -> Device Attestation
  -> 配置法规与网络参数
  -> 设备进入目标 IP 网络
  -> CSR / AddNOC 建立 Fabric 身份
  -> CASE 可用
  -> Commissioning Complete
```

每一步都有独立成功条件：

- BLE 连接成功不等于 PASE 成功；
- Thread Attach 成功不等于 AddNOC 成功；
- AddNOC 成功不等于 Commissioning Complete；
- Commissioning 完成不等于后续 Subscribe 一定稳定。

## PASE 与 CASE

- PASE：基于 setup passcode 建立，主要用于初次 commissioning；
- CASE：基于 Fabric 的 operational credentials，服务于日常单播安全会话；
- Group：服务于一对多组通信。

setup passcode、证书私钥和 Thread Dataset 都是敏感材料，不应出现在公开日志或仓库。

## 发现与地址

Matter 使用 DNS-SD / mDNS 发现节点和服务，并依赖 IPv6 地址。排障时要区分：

- commissionable discovery；
- operational discovery；
- Thread 或 Wi-Fi 网络接入；
- IPv6 路由；
- CASE 会话；
- Interaction Model 操作。

“mDNS 找不到”可能是网络接口、组播、防火墙或地址作用域问题，不应直接归因于 Cluster。

## 从哪里继续学习

- [Matter 官方开源 SDK](https://github.com/project-chip/connectedhomeip)
- [Matter SDK 文档](https://project-chip.github.io/connectedhomeip-doc/)
- [CSA Matter 规范下载入口](https://csa-iot.org/developer-resource/specifications-download-request/)

SDK 示例用于学习，不自动代表某个具体 Device Type 的完整产品或认证实现。
