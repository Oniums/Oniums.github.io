---
title: SmartThings Zigbee 第三方设备兼容：Edge Driver 的匹配、映射与测试
date: 2026-07-29 10:10:00
categories:
  - 生态适配
tags:
  - Zigbee
  - SmartThings
  - Edge Driver
  - Lua
---

SmartThings Edge Driver 在 Hub 本地运行，用 Lua 把 Zigbee 设备行为转换成 SmartThings Capability。兼容工作的核心不是写很多 Handler，而是让 fingerprint、profile、默认处理和设备差异保持一致。

<!-- more -->

## Driver 目录结构

一个 Zigbee Edge Driver 通常包含：

```text
zigbee-example/
├── config.yml
├── fingerprints.yml
├── profiles/
│   └── sensor.yml
└── src/
    ├── init.lua
    └── sub_drivers/
        └── device_variant/
            ├── can_handle.lua
            └── init.lua
```

- `config.yml`：包信息、权限和 Edge API 版本；
- `fingerprints.yml`：设备匹配与 Profile 选择；
- `profiles/`：Component 和 Capability；
- `src/`：Zigbee Handler、Capability Handler 与生命周期逻辑；
- `sub_drivers/`：只覆盖特定设备差异。

## Fingerprint

Manufacturer-specific fingerprint 适合已知设备：

```yaml
zigbeeManufacturer:
  - id: "example/generic-contact-v1"
    manufacturer: "Example Manufacturer"
    model: "GENERIC-CONTACT-01"
    deviceProfileName: "contact-battery"
    deviceLabel: "Generic contact sensor"
```

字段必须来自设备实际报告，而不是包装名称。

SmartThings 也支持按 Profile、Device ID 和 Server/Client Cluster 匹配的 generic fingerprint。它适合真正遵循标准且行为一致的设备；设备存在特殊处理时，精确 Manufacturer/Model 匹配更安全。

## Profile 是平台契约

Profile 决定 App 和自动化看到的 Capability：

```yaml
name: contact-battery
components:
  - id: main
    capabilities:
      - id: contactSensor
        version: 1
      - id: battery
        version: 1
      - id: tamperAlert
        version: 1
    categories:
      - name: ContactSensor
```

只有 Driver 能稳定产生和处理的 Capability 才应加入 Profile。删除或重命名已部署 Profile 会影响现有设备，应作为兼容性变更评估。

## 先使用默认 Zigbee Handler

SmartThings Zigbee library 已提供常见 ZCL 到 Capability 的默认映射：

```lua
local capabilities = require "st.capabilities"
local defaults = require "st.zigbee.defaults"

defaults.register_for_default_handlers(
  driver_template,
  {
    capabilities.contactSensor,
    capabilities.battery,
  }
)
```

标准功能优先使用默认处理。自定义 `zigbee_handlers` 会覆盖相同 Cluster/Attribute 的默认 Handler，因此只覆盖设备真正偏离标准的部分。

## 自定义 Zigbee Handler

Handler 按消息类型组织：

- `attr`：Attribute Report 或 Read Response；
- `cluster`：Cluster-specific Command；
- `global`：ZCL Global Command；
- `zdo`：ZDO 消息。

一个属性处理的结构：

```lua
local clusters = require "st.zigbee.zcl.clusters"
local OnOff = clusters.OnOff

local function on_off_handler(driver, device, value, zb_rx)
  -- 校验 value，再产生对应 Capability event
end

driver_template.zigbee_handlers = {
  attr = {
    [OnOff.ID] = {
      [OnOff.attributes.OnOff.ID] = on_off_handler,
    },
  },
}
```

真实实现还应处理数据类型、Endpoint、多 Component 映射和未知值。

## Capability Handler

App 发出的 Capability command 需要转换成 Zigbee Command 或 Attribute Write：

```text
Capability command
  -> 校验参数
  -> 选择 Component / Endpoint
  -> 构造 ZCL message
  -> device:send(...)
  -> 等待设备响应或后续 report
```

不要在发送后无条件伪造成功状态，除非平台交互明确要求 optimistic update，并且随后有校正机制。

## Reporting 与 doConfigure

ZigbeeDevice 可以登记 configured 或 monitored attributes。设备配置时，库可执行 bind 和 Configure Reporting；特殊设备也可以在 `doConfigure` 中发送自定义配置。

核对：

- Cluster、Attribute 和数据类型；
- Minimum / Maximum Interval；
- Reportable Change；
- Hub Endpoint；
- Sleepy End Device 的唤醒窗口；
- 配置失败后的重试；
- rejoin 后是否需要重新配置。

过度频繁的 reporting 会增加网络负载和电池消耗。

## Sub-driver 隔离设备差异

同一品类 Driver 可以支持多种设备。标准行为放在主 Driver，只有特定设备的差异放入 sub-driver，并通过 `can_handle` 精确匹配。

```text
主 Driver：通用 Capability 与默认 Handler
  -> sub-driver A：特殊属性转换
  -> sub-driver B：不同 Endpoint 映射
  -> sub-driver C：旧固件 workaround
```

避免在每个 Handler 中堆叠大量 Manufacturer/Model 判断。

## 生命周期

常见生命周期包括：

- `added`：设备首次创建；
- `init`：Driver 启动或设备初始化；
- `doConfigure`：配置 binding 和 reporting；
- `infoChanged`：Preferences 变化；
- `removed`：设备移除。

不要把所有网络操作都放在 `init`，否则每次 Driver 重启可能重复配置大量设备。

## 本地打包与设备验证

SmartThings CLI 可以只构建 zip、不上传：

```bash
smartthings edge:drivers:package \
  --build-only driver.zip \
  path/to/driver
```

这个步骤验证包结构，但不证明 Hub 运行正确。上传、Channel 分配和 Hub 安装会改变云端或设备状态，应在明确的测试环境中单独执行。

Hub 验证时使用 live log：

```bash
smartthings edge:drivers:logcat --hub-address=<HUB_IP>
```

Hub 地址、Channel ID、Driver ID 和认证 Token 不应提交到公开仓库。

## 测试矩阵

至少覆盖：

1. fingerprint 选中正确 Profile；
2. 相似设备不会误匹配；
3. Attribute Report 产生正确 Capability event；
4. Cluster Command 产生正确 action；
5. Capability command 发送正确 ZCL 消息；
6. reporting 配置与低功耗行为；
7. 多 Endpoint 到 Component 的映射；
8. Driver 重启、设备 rejoin 和恢复出厂；
9. Preferences 更新；
10. 未知值和发送失败。

涉及公开 SmartThingsEdgeDrivers 仓库与认证的变更，还应提供官方要求的集成测试。Package build、Hub 实测、公开仓库合入和 Works with SmartThings 认证是四个不同结果。

官方资料：

- [Driver 结构与 Fingerprint](https://developer.smartthings.com/docs/devices/hub-connected/driver-components-and-structure)
- [Zigbee Driver Structures](https://developer.smartthings.com/docs/edge-device-drivers/zigbee/driver.html)
- [Zigbee 默认 Handler](https://developer.smartthings.com/docs/edge-device-drivers/zigbee/defaults.html)
- [Edge Driver 测试](https://developer.smartthings.com/docs/devices/hub-connected/test-your-driver)
