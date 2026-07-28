---
title: Zigbee 入网流程：从 Network Steering 到可用设备
date: 2026-07-28 21:20:00
categories:
  - 无线协议
tags:
  - Zigbee
  - BDB
  - Commissioning
  - 问题排查
---

“设备已经入网”经常被过早下结论。扫描到网络、拿到短地址、收到 Network Key、完成 Trust Center Link Key 交换和网关识别出应用能力，是不同阶段。

<!-- more -->

## 先区分三条路径

- 首次加入：Factory New 设备通过 Network Steering 寻找允许加入的网络；
- Rejoin：设备保留网络信息后重新连接，流程和安全条件不同；
- Touchlink：近距离发现和引导入网的另一套 commissioning 方法。

本文讨论经典的首次 Network Steering。实际实现应以目标 BDB、Zigbee Core 和安全策略版本为准。

## 阶段一：打开网络与扫描

网络侧进入 Permit Join 状态。待入网设备在配置的主信道集扫描 Beacon，必要时再扫描次信道集，并根据网络容量、信号和安全信息选择候选网络。

这一阶段的成功锚点是：

- 找到目标 PAN；
- 目标网络允许加入；
- 设备选择了预期信道与 Extended PAN ID。

只看到 Beacon 不能证明设备已经发起关联。

## 阶段二：关联并获得网络地址

设备向父节点候选发起关联，父节点返回状态和 16 位网络地址。此后设备具备拓扑位置，但还不代表已经拿到可用的安全材料。

```text
Scan
  -> Select network
  -> Association Request
  -> Association Response
  -> Short address assigned
```

MAC 层关联成功只证明链路和父子关系初步建立。

## 阶段三：安全准入与 Network Key

集中式安全网络中，Trust Center 决定设备是否被接纳，并通过受保护的密钥传输把 Network Key 交给新设备。设备必须：

1. 接收到正确的 Transport Key；
2. 使用匹配的预配置或 install-code 派生 Link Key 验证并解密；
3. 安装正确的 Network Key 及其序列号；
4. 启动受保护的 NWK 通信。

所以“Transport Key 已发出”不等于“设备已安装 Network Key”。决定性证据在接收端的 APS 安全处理和密钥安装结果。

## 阶段四：设备公告与 Trust Center Link Key

设备通常会发送 Device Announcement，让网络获知其地址映射。根据 BDB 版本和 Trust Center 策略，后续还可能执行 Trust Center Link Key 的更新或交换。

```text
Network Key installed
  -> secure network communication
  -> Device Announcement
  -> Trust Center Link Key procedure
  -> commissioning complete
```

如果日志显示网络层通信已经成功，但 BDB 最终报告 Trust Center Link Key 交换失败，就不应把问题归回“没有收到 Network Key”。

## 阶段五：应用发现

网络接入完成后，控制端通常还会：

- 查询 Node Descriptor；
- 查询 Active Endpoints；
- 读取 Simple Descriptor；
- 读取 Basic 属性；
- 配置 Reporting；
- 建立 Binding 或执行专用 Cluster 初始化。

设备在网络里可达，不等于已经被生态完整识别。应用发现失败应与基础入网失败分开记录。

## 推荐排障时间线

| 阶段 | 最小成功证据 | 常见误判 |
|---|---|---|
| 扫描 | 选择目标网络 | 把看到 Beacon 当作入网 |
| 关联 | 成功状态与短地址 | 把 MAC ACK 当作安全成功 |
| 密钥传输 | 接收端安装 Network Key | 只看发送端“delivered” |
| 安全通信 | 能发送并接收受保护 NWK 帧 | 不检查 frame counter 与 key sequence |
| TCLK | BDB 明确完成 | 把 Network Key 成功等同 TCLK 成功 |
| 应用发现 | Endpoint、Cluster、属性交互完成 | 把可 ping 或可寻址当作设备可用 |

## 抓包与日志怎么对齐

记录统一时间基准，并同时保留：

- 设备串口日志；
- Coordinator / Trust Center 日志；
- 802.15.4 抓包；
- 测试工具或网关事件；
- 固件版本和本次安全策略。

密钥、install code、地址和抓包解密材料只应在授权的本地环境使用，不应复制到公开问题单或文章。

规范入口可参考 [CSA Zigbee 规范下载页](https://csa-iot.org/developer-resource/specifications-download-request/)；认证自测还应使用目标版本的 BDB PICS 和正式测试规范。
