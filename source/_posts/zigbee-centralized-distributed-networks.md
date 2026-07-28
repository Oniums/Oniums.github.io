---
title: Zigbee 集中式网络与分布式网络：差异主要在信任模型
date: 2026-07-28 21:00:00
categories:
  - 无线协议
tags:
  - Zigbee
  - Trust Center
  - 集中式网络
  - 分布式网络
---

“集中式”和“分布式”首先描述安全与网络管理模型，不是简单描述数据包是否经过 Coordinator。集中式 Zigbee 网络同样可以由 Router 之间直接多跳转发。

<!-- more -->

## 核心对比

| 维度 | 集中式安全网络 | 分布式安全网络 |
|---|---|---|
| 信任中心 | 有 Trust Center | 没有中央 Trust Center |
| 准入决策 | 由 Trust Center 控制 | 由分布式网络规则协同 |
| Link Key | 可建立设备唯一 TCLK | 不依赖中央 TCLK 模型 |
| 网络管理 | 关键安全策略集中 | 形成和管理更分散 |
| 常见场景 | 网关型生态、统一管理 | 特定照明或去中心化场景 |

这只是概念表。允许的设备类型、加入方式、密钥交换和兼容条件随 Zigbee/BDB 版本变化，认证时必须看冻结规范。

## 集中式网络

集中式网络通常由 Coordinator 建网并承担 Trust Center 角色。Trust Center 负责：

- 决定是否允许新设备加入；
- 管理初始信任与设备鉴权；
- 传输或更新 Network Key；
- 管理设备级 Trust Center Link Key；
- 移除不再可信的设备。

路由仍由 Mesh 完成。设备 A 到设备 B 的正常业务帧不必每次穿过 Trust Center。

## 分布式网络

分布式网络没有一个持续承担中央信任决策的 Trust Center。形成网络、扩展网络和安全管理依赖分布式规则及共享的安全基础。

它减少了对中央角色的依赖，但不代表：

- 没有 Network Key；
- 没有加密和重放保护；
- 任意设备都可无条件加入；
- 与集中式设备天然完全兼容。

分布式是另一套受规范约束的安全模型，不是“关闭安全”。

## Coordinator、Trust Center 与 Router 的关系

三个概念容易混淆：

- Coordinator：形成 PAN 的逻辑设备；
- Trust Center：集中式安全网络中的信任管理角色；
- Router：参与 Mesh 路由并可能允许子节点关联。

集中式网络中 Coordinator 通常兼任 Trust Center，但这不等于它是所有应用报文的中心转发器。

## 选择时看什么

1. 目标生态是否要求中央 Trust Center；
2. 是否需要 install code 和设备唯一 TCLK；
3. 目标设备及历史 Profile 是否支持该网络类型；
4. 是否需要 Touchlink；
5. 网络形成、备份、迁移与恢复策略；
6. 对失窃节点、共享 bootstrap 材料和密钥轮换的风险接受度；
7. 对应认证计划和 PICS 允许什么。

不要只因为“想避免单点故障”就选择分布式网络。集中式安全角色与 Mesh 数据路径是不同问题；Zigbee Router 的多路径转发仍可提供网络韧性。

## 抓包如何识别

单靠一帧普通 NWK 数据通常不足以判断网络模型。应结合：

- 网络形成日志；
- Trust Center 地址与策略；
- Beacon 或网络安全相关信息；
- 加入时的密钥传输路径；
- TCLK 交换行为；
- BDB 配置与 PICS。

## 版本与兼容边界

旧的 Zigbee Light Link、Home Automation 与 Zigbee 3.x/4.x 之间存在特定兼容规则，不能用“都是 Zigbee”代替逐项核对。CSA 的 [互操作白皮书](https://csa-iot.org/wp-content/uploads/2021/12/04-2017-Interoperability-ORIGINAL-White-Paper-Final-Musa-and-Shashank-1.pdf)可帮助理解历史关系；当前实现仍应以 [CSA 规范下载入口](https://csa-iot.org/developer-resource/specifications-download-request/)和认证实验室确认的版本为准。
