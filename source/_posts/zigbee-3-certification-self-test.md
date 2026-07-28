---
title: Zigbee 3.0 认证自测：从版本冻结到证据包
date: 2026-07-28 20:40:00
categories:
  - 认证实践
tags:
  - Zigbee
  - Zigbee 3.0
  - ZUTH
  - PICS
---

认证自测的目标不是证明“功能大致能用”，而是在送测前尽量复现正式测试的输入、声明、环境和判定方式，提前找出会阻断认证的问题。

<!-- more -->

## 第一步不是运行工具

先向 CSA 或授权实验室确认并冻结：

- 认证计划和 Zigbee 版本；
- Zigbee Core / PRO、BDB、ZCL、Device Type Library；
- Approved Errata；
- PICS / PIXIT 模板；
- Test Specification 与测试用例版本；
- ZUTH、脚本、dongle 和固件版本。

“Zigbee 3.0”是一个过于宽泛的标签。公开工具可能同时保留多个 BDB、ZCL 和 PRO 输入；不能自行把最新版文档和旧测试脚本拼在一起。

## 建立声明矩阵

从每个 Endpoint 展开：

```text
Profile ID / Device ID
  -> Server / Client Cluster
  -> Mandatory / Optional / Conditional
  -> Attribute 类型、范围、默认值和权限
  -> Reporting
  -> Commands Received / Generated
  -> PICS / PIXIT
  -> 对应测试用例
```

一旦实现了 Optional 能力，它通常也会进入声明和测试范围。为了减少测试，不应把已经对外可见的能力错误标成不支持。

## 四层自测

### 静态核对

- Simple Descriptor 与实际 Cluster 注册一致；
- ClusterRevision 和 ZCLVersion 对应冻结版本；
- 属性类型、默认值、访问权限和范围正确；
- 接收与发送命令方向正确；
- PICS 与固件能力一致；
- 认证配置确实进入最终镜像。

### 功能与状态机

- 标准读写、命令和 reporting；
- 默认响应与异常状态；
- 初始化、重启、掉电与恢复出厂；
- 入网、退网、rejoin、换父与丢网恢复；
- binding、group、scene 等已声明能力；
- OTA、低电量和持久化边界。

### 安全与 BDB

- Network Steering 和 Permit Join；
- install-code 策略；
- Network Key 安装、更新和切换；
- Trust Center Link Key 流程；
- frame counter 与重放拒绝；
- 集中式或分布式网络声明；
- Touchlink 等可选 commissioning 能力。

### 正式工具预跑

CSA 的 ZUTH 是 Zigbee 正式认证测试工具，也向成员提供预认证测试能力。导入已审查的 PICS，运行所有被选择用例，并保留原始结果。

## Sleepy End Device 专项

低功耗设备常在正式测试中暴露时序问题：

- Poll Control 行为；
- Fast Poll 窗口；
- 父节点缓存与间接传输；
- reporting 延迟；
- enrollment 或 commissioning 期间的接收窗口；
- 测试刺激与设备睡眠状态的同步。

不要通过永久关闭休眠来“通过认证”，除非认证固件与量产行为差异得到明确允许并被记录。

## 失败归类

| 类别 | 例子 | 下一步证据 |
|---|---|---|
| 声明错误 | PICS 与 Endpoint 不一致 | 描述符、PICS、构建配置 |
| 协议错误 | 命令方向或状态码错误 | 空口与 DUT 日志 |
| 时序错误 | 超时、休眠错过命令 | 统一时间线、poll 日志 |
| 环境错误 | dongle、脚本或版本不匹配 | 环境清单与工具日志 |
| 用例解释 | 前置条件理解不同 | 测试规范、实验室确认 |

修复后要回归相关用例集合，不能只重跑最初失败的一步。

## 自测证据包

每轮保存：

- 固件版本、源码提交和构建哈希；
- PICS / PIXIT；
- 环境和工具版本；
- 测试用例列表；
- 原始 ZUTH 报告；
- DUT、测试端与抓包日志；
- 失败分析、修复提交和回归结果；
- 尚未验证的限制。

证据层级必须分开：

```text
规范要求
  != PICS 声明
  != 静态实现
  != 设备运行通过
  != ZUTH 自测通过
  != 授权实验室通过
  != CSA 正式认证
```

可从 [CSA 认证工具页](https://csa-iot.org/certification/tools/)获取 PICS Tool 和 ZUTH 说明。当前版本和送测范围仍应由 [授权测试机构](https://csa-iot.org/certification/testing-providers/)确认。
