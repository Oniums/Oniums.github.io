---
title: Zigbee 各类 Key 的作用范围：不要把 Network Key 和 Link Key 混为一谈
date: 2026-07-28 21:10:00
categories:
  - 无线协议
tags:
  - Zigbee
  - Security
  - Network Key
  - Link Key
---

Zigbee 排障中最常见的安全误区，是把所有 128-bit Key 都理解成同一种东西。Key 的长度相同，不代表作用层、通信对象、生命周期和泄露影响相同。

<!-- more -->

## 一张作用域表

| Key | 典型持有者 | 保护范围 | 主要用途 |
|---|---|---|---|
| Network Key | 网络内节点 | 整个 Zigbee 网络的 NWK 层 | 日常网络层帧保护 |
| Trust Center Link Key | 单个设备与 Trust Center | 两个节点之间的 APS 层 | 安全管理、密钥传输与认证 |
| Install-code 派生 Key | 新设备与 Trust Center | 初次准入阶段 | 为设备提供唯一的初始信任 |
| Application Link Key | 两个应用节点 | 端到端 APS 层 | 保护特定设备间应用通信 |
| Touchlink commissioning Key | 支持 Touchlink 的设备 | Touchlink 入网阶段 | 保护网络参数传输 |
| Green Power Key | Green Power 角色 | Green Power 子系统 | 保护对应的精简设备通信 |

表格描述的是概念边界。具体必选能力和密钥派生方法必须回到目标 Zigbee Core、BDB、ZCL、Green Power 与安全策略版本确认。

## Network Key

Network Key 是网络范围的共享密钥，主要用于 NWK 层的机密性、完整性和重放保护。它让节点能够参与正常 Zigbee 网络通信。

要点：

- 同一时刻会有活动 Key Sequence；
- 网络可以执行 Network Key Update 和 Switch；
- 拿到 Network Key 不等于拥有与 Trust Center 的唯一信任关系；
- Network Key 泄露的影响通常覆盖整个网络。

抓包能用 Network Key 解密 NWK 帧，也不代表内部 APS 负载一定能继续解密。

## Trust Center Link Key

Trust Center Link Key 是设备与 Trust Center 之间的 APS Link Key，用于安全管理和特定 APS 加密流程。

它可能经历：

```text
初始 bootstrap key
  -> 安全加入
  -> Trust Center Link Key 更新或交换
  -> 唯一设备级 TCLK
```

具体路径由 BDB 版本、设备能力和 Trust Center 策略决定。调试时要分开记录“初始 Key 可用”和“最终 TCLK 交换完成”。

## Install code 的位置

Install code 本身不是日常 NWK 通信使用的 Network Key。它经过规范定义的处理后，形成设备唯一的初始 Link Key，用于安全加入。

它改善了共享 bootstrap key 的风险，但同时要求：

- 生产、标签或扫码数据正确绑定到设备；
- Trust Center 预先获得匹配信息；
- 长度、校验和、字节序与派生过程一致；
- 测试数据不能进入量产。

任何 install code、派生 Key 或二维码内容都不应出现在公开日志中。

## Application Link Key

Application Link Key 用于两个应用节点之间的端到端 APS 安全。它不能替代 Network Key，因为 Zigbee 路由仍依赖受保护的 NWK 层；它也不应被笼统称为 TCLK，因为通信对端可能不是 Trust Center。

分析加密帧时可按顺序判断：

```text
MAC frame
  -> NWK security：Network Key
  -> APS security：对应 Link Key
  -> ZCL payload
```

## 全局 bootstrap key 为什么要谨慎

某些兼容路径使用规范定义的全局共享初始 Link Key。因为它不是每台设备唯一的秘密，安全强度依赖后续策略，例如尽快升级到唯一 TCLK、限制 Permit Join 时间和执行设备鉴权。

公开文章无需、也不应抄写这个 Key 的实际值。知道“它是共享 bootstrap 材料”已经足够用于设计和排障。

## Touchlink 与 Green Power 不要混入普通路径

Touchlink commissioning Key 服务于 Touchlink 的网络参数交换；Green Power 还有自己的共享、组或单设备安全材料。它们不应被当成普通 Zigbee 设备的 Network Key 或 TCLK。

## 排障时至少记录什么

不要记录 Key 内容，而是记录元数据：

- 安全层：NWK 还是 APS；
- Key 类型和逻辑槽位；
- Key Sequence；
- 对端角色；
- frame counter 是否前进；
- 解密、MIC 验证和重放检查结果；
- Key 安装、更新、切换或删除事件。

“发送成功”只能证明本端协议栈接收了请求或下层完成传输；只有对端安全层验证通过，才能证明使用了匹配的 Key。

可从 [Zigbee 官方规范入口](https://csa-iot.org/developer-resource/specifications-download-request/)获取当前公开规范。认证或量产策略必须再与芯片平台安全指南及实验室冻结版本核对。
