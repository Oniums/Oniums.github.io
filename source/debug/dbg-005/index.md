---
title: DBG-005 有 MAC ACK 但没有 ZCL Response
date: 2026-07-31 12:04:00
layout: page
aside: false
top_img: false
content_type: debug
debug_id: DBG-005
status: verified-method
evidence: deidentified-technical-note
privacy: public
description: 在 ZigBee 休眠终端测试中区分链路层成功与应用层 Endpoint 分发失败。
---

<div class="lab-record-header"><span class="lab-record-id">DBG-005 · VERIFIED METHOD</span><h1>MAC ACK 成功，为什么还是没有 ZCL Response？</h1><p>MAC ACK 只说明相邻节点确认了链路层帧，不代表 AF/ZCL 已经把请求分发给正确的 Cluster。</p></div>

## 排查顺序

1. 按 PAN、短地址、Profile 和 Cluster 过滤抓包；
2. 检查 APS Destination Endpoint；
3. 从固件核对 Simple Descriptor 和 Cluster 注册 Endpoint；
4. 区分 Data Request、MAC ACK、APS ACK 与 ZCL Response；
5. 修正 Endpoint 后重新验证可读、只读写入和错误响应。

## 证据边界

如果设备持续发送 Data Request 并对请求返回 MAC ACK，说明无线链路和取帧路径可能正常；如果目标 Endpoint 没有对应的 Cluster 注册，应用层仍可能没有 ZCL 响应。

## 当前收获

排查不能从“有 MAC ACK”直接跳到“设备已经处理请求”，也不能把 Sleepy End Device 的轮询问题和 Endpoint 分发问题混成一个原因。

## 关联内容

- [ZigBee 基础概念](/posts/zigbee-foundations/)
- [ZigBee 第三方平台适配](/posts/zigbee-third-party-platform-compatibility/)
- [Debug Diary](/debug/)
