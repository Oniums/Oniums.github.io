---
title: Failure-003 把协议层成功当成应用闭环
date: 2026-07-31 13:02:00
layout: page
aside: false
top_img: false
content_type: failure
failure_id: FAILURE-003
status: verified-lesson
evidence: deidentified-technical-note
privacy: public
description: 记录从 MAC ACK、网络附着或配置成功误判为应用层闭环成功的常见错误。
---

<div class="lab-record-header"><span class="lab-record-id">FAILURE-003 · VERIFIED LESSON</span><h1>底层成功，不等于用户功能成功</h1><p>协议排障中最常见的错误之一，是把某一层的成功证据直接扩展成整个系统已经闭环。</p></div>

## 常见错误推理

```text
有 MAC ACK       -> 认为 ZCL 已处理
Thread Attached  -> 认为 Matter 已完成
请求已发送       -> 认为对端应用已接受
配置已启用       -> 认为运行时状态已切换
```

## 正确做法

为每条链路分别设置成功锚点：

- 链路层：ACK、重传和帧交付；
- 网络层：路由、地址和协议状态；
- 安全层：密钥、会话和解密结果；
- 应用层：Cluster、属性、命令或事件响应；
- 用户层：平台显示、控制闭环和持久状态。

## 可迁移经验

结论应写成“已通过 A，在 B 前失败”，而不是笼统写“设备通信失败”。这样才能决定下一项最小实验。

## 关联内容

- [从日志到协议阶段](/posts/debugging-with-an-evidence-chain/)
- [Matter、Thread 与 ZigBee 分层](/posts/matter-thread-zigbee-layers/)
- [Failure Museum](/failures/)
