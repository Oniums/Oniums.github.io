---
title: DBG-004 Parent Loss、Leave 与 Rejoin
date: 2026-07-31 12:03:00
layout: page
aside: false
top_img: false
content_type: debug
debug_id: DBG-004
status: verified-lesson
evidence: deidentified-technical-note
privacy: public
description: 区分 ZigBee 休眠终端父节点丢失、远程 Leave、Rejoin 和恢复出厂。
---

<div class="lab-record-header"><span class="lab-record-id">DBG-004 · VERIFIED LESSON</span><h1>设备没收到 Leave，不等于设备已经离网</h1><p>Sleepy End Device 发现父节点不可达时，可能进入 parent link failure 和 rejoin；这与真正收到 Leave、清除网络参数和恢复出厂是不同路径。</p></div>

## 现象

网关侧显示设备已删除，但设备在下一次唤醒后仍保留旧网络信息，或者继续尝试重新加入网络。

## 必须分开的路径

```text
连续 Data Request 无 ACK
  -> Parent Link Failure
  -> Network Lost / Rejoin

收到 NWK Leave
  -> Leave indication
  -> 协议栈遗忘网络

本地 Factory Reset
  -> 清除网络和应用状态
```

## 决定性证据

- 是否真的捕获到 NWK Leave 或 Leave request；
- Data Request 的 ACK、Frame Pending 和返回状态；
- Parent Loss 后是否启动 Rejoin；
- 网络凭据和“已在网络中”状态是否被清除。

## 当前收获

“App 删除设备”“设备网络不可达”“设备恢复 factory-new”不能合并成一个状态。排障应先确定设备实际收到的空口消息和本地状态机分支。

## 关联内容

- [ZigBee 入网流程](/posts/zigbee-network-joining-flow/)
- [Debug Diary](/debug/)
