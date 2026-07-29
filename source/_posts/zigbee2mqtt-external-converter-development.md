---
title: Zigbee2MQTT 第三方设备兼容：External Converter 开发与验证
date: 2026-07-29 10:20:00
categories:
  - 生态适配
tags:
  - Zigbee
  - Zigbee2MQTT
  - JavaScript
  - MQTT
---

Zigbee2MQTT 使用 zigbee-herdsman-converters 把 Zigbee 消息转换成 MQTT 状态和命令。External Converter 可以在不修改正式安装包的情况下开发和验证新设备支持。

<!-- more -->

## 开始前先做三件事

1. 检查设备是否已在 Zigbee2MQTT 开发分支获得支持；
2. 把日志级别设为 Debug；
3. 完成设备 interview，并保存 Endpoint、Cluster 与 Basic 信息。

能加入网络只代表 Zigbee2MQTT 可以访问设备，不代表已有 converter 能理解它。

## 先生成外部定义

当前 Zigbee2MQTT 前端可以在设备的 Dev console 中生成 external definition。生成结果基于发现到的标准 Cluster，应先验证 Exposes 页面中的能力是否真实可用。

自动生成的定义是起点，不是最终结论：

- 设备可能没有上报全部能力；
- 厂商 Cluster 无法自动理解；
- reporting 可能尚未配置；
- 命令型遥控器可能没有普通状态属性；
- 相同 Model ID 可能对应多个厂商变体。

## Modern Extend 示例

标准温湿度与电池设备可以从最小定义开始：

```javascript
import {
    battery,
    humidity,
    temperature,
} from "zigbee-herdsman-converters/lib/modernExtend";

export default {
    zigbeeModel: ["GENERIC-ENV-01"],
    model: "GENERIC-ENV-01",
    vendor: "Example Vendor",
    description: "Temperature and humidity sensor",
    extend: [
        temperature(),
        humidity(),
        battery(),
    ],
};
```

Modern extends 会组合常见的 `fromZigbee`、`toZigbee`、`exposes` 和配置逻辑。能复用时优先复用，减少重复的解析和 reporting 代码。

## External Converter 放在哪里

文件通常放在与 Zigbee2MQTT `configuration.yaml` 同级的 `external_converters` 目录，例如：

```text
data/
├── configuration.yaml
└── external_converters/
    └── generic-env.mjs
```

也可以从前端的 Settings → Dev console → External converters 加载和更新。

当前版本对外部 JavaScript 有额外安全控制。它会在 Zigbee2MQTT 进程中执行任意代码，只应在隔离的开发环境中启用，并只加载经过审查的来源。

## 什么时候使用 fromZigbee

`fromZigbee` 负责把设备发来的消息转换成平台状态或 action：

```text
Attribute Report / Read Response / Cluster Command
  -> 匹配 cluster 与 message type
  -> 解析原始字段
  -> 校验范围和特殊值
  -> 返回 MQTT property
```

如果日志持续出现 `No converter available`，先确认：

- Cluster 名称；
- Message type；
- Endpoint；
- Attribute 或 Command ID；
- 是否已存在可复用 converter；
- 是否已经被某个 modern extend 覆盖。

不要用一个接受所有消息的 converter 隐藏未知数据。

## 什么时候使用 toZigbee

`toZigbee` 把 MQTT Set/Get 转换成 Attribute Read/Write 或 Cluster Command。必须定义：

- 支持的 property；
- 输入类型和范围；
- 枚举字符串与协议数值；
- 目标 Endpoint；
- Manufacturer Code；
- 写入后的状态确认策略；
- 错误返回。

下发函数返回成功不等于设备状态已经改变。应结合响应、Read Back 或后续 Report。

## Exposes 是公开契约

`exposes` 决定前端和 MQTT 使用者看到什么。每个 property 应明确：

- 名称与显示 Label；
- 读、写、状态访问；
- 数据类型；
- 单位；
- 最小值、最大值和步进；
- 枚举；
- Endpoint 后缀；
- 描述。

一旦用户用 property 编写自动化，随意改名会造成兼容破坏。显示文案可以优化，但 MQTT property 应保持稳定。

## Configure 与 reporting

设备没有主动上报时，可能需要在 `configure` 中：

- bind 到 Coordinator Endpoint；
- Configure Reporting；
- 读取倍率、除数或初始状态；
- 设置厂商初始化属性。

对 Sleepy End Device，配置必须落在唤醒窗口，并验证失败重试。不要假设一次 `configure` 成功就会永久保留；还要测试断电、rejoin 和恢复出厂。

## 匹配多个设备变体

`zigbeeModel` 简单但可能过宽。多个厂商共用同一 Model ID 时，应使用更精确的 fingerprint 条件，并把真正相同的行为复用到公共 extend。

兼容层次建议：

```text
标准 modern extend
  -> 品类公共 converter
  -> 厂商公共逻辑
  -> 设备或固件差异
```

不要把所有变体堆进一个充满 Model 判断的转换函数。

## 验证清单

1. Converter 成功加载；
2. 只匹配预期设备；
3. Exposes 完整且访问方向正确；
4. 所有上行属性和命令均可解析；
5. Set/Get 有真实设备结果；
6. reporting、单位和缩放正确；
7. 多 Endpoint property 不冲突；
8. Zigbee2MQTT 重启后仍可加载；
9. 设备断电和 rejoin 后恢复；
10. Debug 日志没有未解释的消息和异常。

External Converter 验证完成后，可按 zigbee-herdsman-converters 当前结构转成正式 TypeScript definition 并提交上游。发布版本已经包含支持后，应移除本地 converter，避免重复匹配。

官方资料：

- [支持新设备](https://www.zigbee2mqtt.io/advanced/support-new-devices/01_support_new_devices.html)
- [External Converters](https://www.zigbee2mqtt.io/advanced/more/external_converters.html)
- [Exposes](https://www.zigbee2mqtt.io/guide/usage/exposes.html)
- [外部脚本安全说明](https://www.zigbee2mqtt.io/advanced/zigbee/03_secure_network.html)
