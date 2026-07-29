---
title: Zigbee 第三方平台适配：ZHA、Z2M 与 SmartThings 的统一方法
date: 2026-07-29 10:40:00
categories:
  - 生态适配
tags:
  - Zigbee
  - ZHA
  - Zigbee2MQTT
  - SmartThings
---

同一台 Zigbee 设备在 ZHA、Zigbee2MQTT 和 SmartThings 中可能需要三套适配代码，但协议事实应该只有一份。高质量兼容工作的关键，是先建立产品中立的 Zigbee 行为矩阵，再把它映射到各平台的数据模型。

<!-- more -->

## 三个平台分别在做什么

| 平台 | 适配载体 | 主要语言 | 平台输出 |
|---|---|---|---|
| ZHA | Device Handler / Quirk | Python | Home Assistant Entity、Device Automation |
| Zigbee2MQTT | zigbee-herdsman converter | JavaScript / TypeScript | MQTT State、Command、Exposes |
| SmartThings | Edge Driver | Lua | SmartThings Capability 与 Component |

它们都要解决三件事：

1. 识别是哪一类设备；
2. 把 Zigbee 消息转换成平台状态；
3. 把平台操作转换成 Zigbee 命令或属性写入。

## 先判断是否真的需要第三方脚本

如果设备正确实现标准 Device Type、Cluster、Attribute、Command 和 Reporting，平台的通用处理通常已经能够覆盖主要功能。

适配脚本更适合处理：

- Basic Cluster 身份或描述符与实际行为不一致；
- 厂商自定义 Cluster、Attribute 或 Command；
- 标准位图需要拆成多个平台实体；
- 原始数值需要单位、比例或枚举转换；
- 特定固件版本存在兼容差异；
- 标准功能存在，但平台没有自动生成期望的实体或 Capability。

能在固件端修复的标准合规问题，不应长期依赖三个平台分别打补丁。

## 建立一份协议事实矩阵

每项能力至少记录：

| 字段 | 内容 |
|---|---|
| 身份 | Manufacturer、Model、固件版本 |
| 拓扑 | Endpoint、Profile ID、Device ID |
| Cluster | Server / Client 方向 |
| 数据源 | Attribute、Command 或 ZDO 消息 |
| 原始类型 | bitmap、enum、signed、unsigned、string |
| 转换 | 单位、倍率、范围、无效值 |
| 上行 | Report、Read Response、Cluster Command |
| 下行 | Write、Command、Configure Reporting |
| 生命周期 | 首次加入、重启、rejoin、恢复出厂 |
| 低功耗 | Poll、唤醒窗口和配置时机 |

平台代码只消费这份事实，不重新猜测协议含义。

## 平台映射表

| Zigbee 事实 | ZHA | Zigbee2MQTT | SmartThings |
|---|---|---|---|
| Manufacturer / Model | QuirkBuilder matcher | `zigbeeModel` / fingerprint | `fingerprints.yml` |
| Attribute Report | Cluster update / Entity | `fromZigbee` / modern extend | `zigbee_handlers.attr` |
| Cluster Command | automation trigger | `fromZigbee` action | `zigbee_handlers.cluster` |
| 平台控制 | Entity write/command | `toZigbee` | Capability handler |
| 对外能力 | Entity metadata | `exposes` | Profile Capability |
| Reporting | ReportingConfig | `configure` / modern extend | configured/monitored attribute |
| 设备变体 | firmware filter / matcher | fingerprint / meta | sub-driver `can_handle` |

名字相近不表示行为自动相同。例如同一个 IAS Zone 位图，在一个平台可能拆成多个 Binary Sensor，在另一个平台可能形成一组 MQTT 属性，在 SmartThings 中则对应多个 Capability。

## 推荐开发顺序

```text
抓取真实 interview 与空口行为
  -> 建立协议事实矩阵
  -> 先验证标准能力
  -> 实现最小身份匹配
  -> 实现上行状态
  -> 实现下行控制
  -> 配置 reporting / binding
  -> 验证重启、rejoin 与低功耗
  -> 三平台对照回归
```

不要一开始就复制相似设备脚本。先比较 Endpoint、Cluster 方向、属性类型和命令载荷，确认差异后再复用。

## 身份匹配要足够窄

过宽匹配会让行为不同的设备误用同一脚本：

- 只按常见 Model ID 匹配，可能碰到多个厂商共用；
- 只按 Cluster 集合匹配，可能覆盖大量标准设备；
- 忽略固件版本，可能把旧固件 workaround 应用于新固件；
- 忽略 Endpoint，可能把多路设备映射到错误 Component。

优先使用稳定的 Manufacturer + Model；必要时叠加 Endpoint、Cluster 或固件版本条件。更换身份字符串会破坏已经发布的三平台兼容代码，应视为协议接口变更。

## 上行与下行必须成对验证

一个“可见的开关”不代表完整兼容：

- 设备主动变化能否更新平台；
- 平台写入能否改变设备；
- Read Back 是否与平台状态一致；
- 失败是否返回真实错误；
- 重启后状态能否恢复；
- reporting 丢失后能否重新配置；
- Sleepy End Device 是否在唤醒窗口处理配置。

如果只验证 UI 点击成功，很容易漏掉设备侧主动变化和离线恢复。

## 三个平台的状态命名

建议先定义平台无关语义：

```text
contact: open / closed
tamper: detected / clear
battery: percentage
alarm: active / inactive
```

然后分别映射为：

- ZHA 的 Entity 和 Device Class；
- Z2M 的 `exposes` property；
- SmartThings 的 Capability attribute/event。

协议枚举值保持不变，显示文案可以平台化。不要为了让 UI 好看而改变空口数值。

## 低功耗设备专项

兼容脚本常在设备刚加入时集中执行 bind、read 和 configure reporting。对休眠设备，应检查：

- 配置发生时设备是否仍处于 Fast Poll；
- 平台是否会自动重试；
- rejoin 后 reporting 是否保留；
- 父节点更换后是否需要重新绑定；
- 多条配置是否超出单次唤醒窗口；
- 失败是否被静默忽略。

“第一次加入能用”不足以证明长期兼容。

## 验证证据分层

```text
脚本能加载
  != 匹配到目标设备
  != Entity / Exposes / Capability 正确
  != 上行状态正确
  != 下行控制正确
  != 重启和 rejoin 正确
  != 平台正式收录
  != Zigbee 认证或生态认证
```

每个平台都应保存版本、脚本提交、interview、调试日志、测试动作和预期结果。公开问题单要脱敏设备唯一地址、Network Key、install code 和私有仓库信息。

继续阅读：

- [ZHA Device Handlers](https://github.com/zigpy/zha-device-handlers)
- [Zigbee2MQTT 新设备支持](https://www.zigbee2mqtt.io/advanced/support-new-devices/01_support_new_devices.html)
- [SmartThings Edge 架构](https://developer.smartthings.com/docs/devices/hub-connected/edge-architecture)
