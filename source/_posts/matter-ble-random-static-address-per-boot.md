---
title: Matter BLE 配网的 MAC 地址为什么每次重启都会变？
date: 2026-08-17 14:35:00
categories:
  - 无线协议
tags:
  - Matter
  - Bluetooth LE
  - Commissioning
  - Privacy
  - Random Static Address
---

调试 Matter over Thread 设备时，可能会遇到一个很容易被误判的现象：设备恢复出厂后可以被手机扫描到，但重启一次，扫描工具显示的 BLE MAC 地址就变了。

这是不是地址没有保存？会不会导致手机找不到原来的设备？量产时是不是应该给每台设备烧录一个固定 BLE MAC？

对于 Matter 配网广播，答案恰好相反：**每次启动都使用新的随机 BLE 地址，通常才是符合规范的行为。**

<!-- more -->

不过，“随机地址”不等于“每次连接都换地址”，也不等于常见的 RPA 定时轮换地址。本文把规范要求、Bluetooth 地址类型、主流参考实现和产品测试方法放到同一条时间线上说明。

## 一句话结论

对于使用 Bluetooth LE 进行发现和配网的 Matter 待配网设备：

- BLE 广播必须使用 **LE Random Device Address**；
- 具体使用 Bluetooth 定义的 **Random Static Address**；
- 地址必须至少在每次设备启动时更换；
- 同一次启动期间，配网重试、断开重连或重新开始广播，不要求再次换地址；
- 永久固定的 Public Address，或者跨重启保持不变的“伪随机地址”，都不满足这项 Matter 配网要求。

因此，更准确的描述不是“每次配网随机一次”，而是：

```text
每次启动生成一个新的 Random Static Address
              ↓
本次启动期间保持稳定
              ↓
下一次启动重新生成
```

## Matter 规范到底要求了什么？

[Matter 1.6 Core Specification](https://csa-iot.org/wp-content/uploads/2026/06/23-27349-011_Matter-1.6-Core-Specification.pdf) 第 5.4.2.5.5 节“Advertising Address”（PDF 第 319 页）给出了两个 `SHALL` 级要求：

1. 待配网设备的 BLE 广播使用 LE Random Device Address；
2. 地址至少在每次启动时更换。

这里的 `SHALL` 表示强制要求，不是优化建议。该条款还明确引用 Bluetooth Core Specification 中的 Static Device Address 定义，所以不能只看到“Random Device Address”，就把它理解成任意一种随机地址。

这项要求属于 Matter 使用 BLE 进行 Commissionable Node Discovery 和配网的场景。Matter over Thread 产品经常采用这条路径，但它并非 Thread 独有：只要 Matter 设备使用 BLE 作为配网通道，就要关注这项要求。

## 为什么“Random Static”既随机又静态？

这个名字第一次看很矛盾，其实两个词描述的是不同维度：

- **Random**：地址不是永久分配的 Public Address，而是随机生成的 Random Device Address；
- **Static**：地址初始化后，在当前启动或电源周期中保持稳定，不进行定时轮换。

按照 [Bluetooth Core Specification 的 Device Address 定义](https://www.bluetooth.com/wp-content/uploads/Files/Specification/HTML/Core_v6.3/out/en/low-energy-controller/link-layer-specification.html)，Random Device Address 还可以细分为三类：

| 地址类型 | 地址高两位 `[47:46]` | 生命周期特点 | Matter 配网广播是否指定使用 |
|---|---:|---|---|
| Random Static Address | `11` | 初始化时随机生成，当前电源周期保持不变 | 是 |
| Resolvable Private Address，RPA | `01` | 由 IRK 和随机数生成，可周期轮换并被授权设备解析 | 否 |
| Non-resolvable Private Address，NRPA | `00` | 无法通过 IRK 解析，通常用于更短期的隐私场景 | 否 |

Public Device Address 则是另一大类，通常来自固定的设备身份分配，不属于 Random Device Address。

因此，看到扫描工具显示 `Random` 还不够。要判断 Matter 要求是否真正满足，至少还要确认：

1. 地址类型确实是 Random Static；
2. 地址位 `[47:46]` 为 `11`；
3. 当前启动期间地址稳定；
4. 下一次启动后地址发生变化。

## “每次启动更换”不等于“每次连接更换”

把地址变更粒度搞错，可能造成两种相反的问题。

如果地址永远固定，附近观察者就更容易跨时间关联同一台待配网设备，违背 Matter 这里的隐私目标。

如果地址在同一次启动中频繁变化，手机刚扫描到地址 A，准备连接时设备却已经变成地址 B，也会增加发现、连接和故障恢复的复杂度。Random Static Address 的“Static”正是为了避免这种不稳定。

常见场景可以这样判断：

| 场景 | 地址是否应变化 |
|---|---|
| 手机第一次扫描到设备 | 使用本次启动生成的地址 |
| 配网连接失败，手机重新扫描和连接 | 通常不变 |
| 设备停止后重新开始 Matter 广播，但没有重新启动 | 通常不变 |
| 设备重新启动，再次进入待配网状态 | 必须换成新的随机地址 |
| 恢复出厂并重新启动 | 必须换成新的随机地址 |
| 从 Flash 读取上次保存的 Random Static Address | 跨启动不变，不符合该项要求 |
| 由芯片 UID 确定性计算地址 | 即使格式是 Random Static，跨启动不变仍不符合要求 |

## 为什么 Matter 不把 BLE MAC 当作永久设备身份？

BLE 在这里主要解决的是“附近发现并建立临时配网通道”。它不是 Matter 设备投入运行后的长期身份基础。

典型的 Matter over Thread 首次配网可以简化为：

```text
二维码或手动码
  ↓
通过 Discriminator 缩小待配网设备范围
  ↓
BLE 广播、连接和 BTP 传输
  ↓
PASE 建立临时安全会话
  ↓
设备证明、NOC/Fabric 配置、Thread Dataset
  ↓
设备接入 Thread
  ↓
通过 IPv6 建立 CASE
  ↓
CommissioningComplete
```

进入正常运行阶段后，Controller 通过 Matter Fabric、Node ID、证书和 CASE 识别并访问设备，通信承载变成 Thread 上的 IPv6。BLE 配网地址不需要承担永久设备索引的职责。

这也解释了为什么 Commissioner 或手机 App 不应把 BLE MAC 当作 Matter 设备的长期主键。设备重启后，App 应重新扫描待配网广播，并使用 Onboarding Payload、Discriminator 和 Matter Service Data 完成目标匹配。

还要分清下面几种地址和身份：

| 名称 | 所属层次 | 是否受本文这条要求约束 |
|---|---|---|
| 待配网设备的 BLE Advertising Address | Bluetooth LE | 是 |
| 手机或 Commissioner 自己的 BLE 地址 | Bluetooth LE | 不是这条设备侧要求的对象 |
| Thread Extended Address / EUI-64 | IEEE 802.15.4 / Thread | 否 |
| Matter Node ID、Fabric ID、NOC | Matter | 否 |
| 厂商私有 Device ID | 产品应用协议 | 否，但不能替代 Matter 身份 |

## 主流实现通常怎样做？

没有公开、可信的全市场统计可以证明“多少品牌随机、多少品牌固定”。比市场印象更可靠的证据，是 Matter 开源参考实现和芯片平台适配层。

在 Project CHIP 当前源码中，可以看到多种平台都围绕“启动时生成 Random Static Address”实现：

- [Zephyr 平台 BLEManagerImpl](https://github.com/project-chip/connectedhomeip/blob/0f267927e02ce234ec75a7a4970104a73bcc06dc/src/platform/Zephyr/BLEManagerImpl.cpp) 创建 Random Static Identity；
- [ESP32 NimBLE BLEManagerImpl](https://github.com/project-chip/connectedhomeip/blob/0f267927e02ce234ec75a7a4970104a73bcc06dc/src/platform/ESP32/nimble/BLEManagerImpl.cpp) 生成并设置新的 Static Random Address；
- [Silicon Labs EFR32 BLEManagerImpl](https://github.com/project-chip/connectedhomeip/blob/0f267927e02ce234ec75a7a4970104a73bcc06dc/src/platform/silabs/efr32/BLEManagerImpl.cpp) 特别处理了“同一次启动内重新初始化 BLE 不能误换地址”；
- [Bouffalo Lab BLEManagerImpl](https://github.com/project-chip/connectedhomeip/blob/0f267927e02ce234ec75a7a4970104a73bcc06dc/src/platform/bouffalolab/common/BLEManagerImpl.cpp) 直接按 once per boot 生成 Random Static Address。

这不能代替对每一款量产固件的检查，但足以说明：**主流 Matter SDK 的设计方向是每次启动随机，而不是永久固定。** 很多厂商直接继承芯片平台或 Matter SDK 的默认行为，因此最终产品通常也会表现为重启后 BLE 地址变化。

如果某台产品一直显示固定地址，可能存在多种原因：

- 使用了旧版 SDK 或厂商自己的 BLE 平台层；
- 把 Public Address 直接用于 Matter 广播；
- 把 Random Static Address 持久化到了 Flash；
- 扫描工具显示的是系统解析后的身份，而不是当前空口地址；
- 当前看到的是厂商私有 BLE 服务，不是 Matter Commissionable Advertising。

不能仅凭“地址固定”立即断言整台产品不合格，但它足以触发一次针对实际 Matter 广播的合规检查。

## 厂商私有 BLE OTA 为什么可能需要稳定地址？

有些设备除了 Matter 配网，还提供厂商私有 BLE OTA、产测或维护服务。手机 App 可能希望设备重启后仍能被识别，于是产品会设计一个稳定的 BLE Identity。

这和 Matter 配网地址的目标不同：

- Matter 配网强调临时发现与隐私，要求每次启动更换地址；
- 厂商私有服务可能强调重连和设备索引，希望身份稳定。

工程上不能因为私有 OTA 需要稳定地址，就直接让 Matter 配网广播永久使用同一个 MAC。也不能为了满足 Matter 地址轮换，就让依赖固定 MAC 的私有 App 在升级后失去设备。

可选设计要结合控制器能力和隐私模型评估，例如：

- 为 Matter 配网和私有服务使用不同的 BLE Identity 或 Advertising Set；
- 让私有 App 每次重新扫描、重新发现 GATT，而不是缓存旧地址和 Handle；
- 在受保护的应用协议中确认设备身份，不把可被长期跟踪的永久标识直接放进明文广播；
- 明确规定两种模式何时启用，避免同一个广播同时承担冲突的身份目标。

这里没有一种适合所有芯片和手机系统的固定答案，但有一个边界很明确：**厂商私有 BLE 需求不能取消 Matter Commissionable Advertising 的规范义务。**

## 怎样在设备上验证？

最小验证不需要先做完整 Matter 配网。使用能够显示 BLE 地址类型和原始广播数据的扫描工具，记录多次启动即可。

建议至少执行下面这组测试：

| 测试 | 操作 | 预期结果 |
|---|---|---|
| 地址类型 | 检查 Matter `0xFFF6` Service Data 对应广播的地址类型 | Random Static |
| 位格式 | 检查地址位 `[47:46]` | `11` |
| 启动内稳定性 | 同一次启动中停止/恢复广播、断开并重新扫描 | 地址不变 |
| 跨启动随机性 | 连续重启设备至少 5 次 | 每次地址都不同 |
| 配网匹配 | 每次重启后重新扫码和扫描 | Commissioner 仍能选中正确设备 |
| 完整闭环 | 完成 PASE、Thread Attach、CASE 和 CommissioningComplete | 地址变化不影响完整配网 |

测试记录应同时保存：

- 启动序号；
- 广播地址和地址类型；
- Matter Service Data；
- Discriminator；
- 是否成功建立 BLE 连接和 BTP；
- 最终是否到达 CommissioningComplete。

只看到 MAC 变化，不能证明配网成功；只看到 BLE Connected，也不能证明 PASE、Thread 或 CASE 成功。地址合规和端到端配网是两条相关但独立的证据链。

## 实现检查清单

如果正在开发 Matter 设备，可以用下面的清单快速审查平台层：

- [ ] 使用密码学安全随机源生成 48-bit 地址的随机部分；
- [ ] 设置 Random Static Address 规定的高两位；
- [ ] 排除规范禁止的全 0 或全 1 随机部分；
- [ ] 在 BLE 广播启动前完成地址初始化；
- [ ] 同一次启动中不因配网重试或 BLE 子系统重复初始化而换地址；
- [ ] 不从 Flash 恢复上一次启动的 Matter 配网地址；
- [ ] 不使用芯片 UID、序列号或量产固定地址确定性生成跨启动地址；
- [ ] App 不把 BLE MAC 或旧 GATT Handle 当作永久设备身份；
- [ ] 把 Matter 配网 BLE、厂商私有 BLE 和 Thread 地址分别测试；
- [ ] 用真实设备记录跨启动地址，而不是只检查配置项或源码。

## 最后再记住三个边界

1. **随机地址是强制要求，不只是隐私建议。**
2. **随机粒度是每次启动，不是每次连接。**
3. **BLE 配网地址不是 Thread 地址，也不是 Matter 的长期设备身份。**

如果调试时发现“设备重启后 BLE MAC 变了”，先不要把它当成数据丢失或 Flash 故障。对于 Matter 配网设备，这往往正是规范要求平台层主动实现的行为。

## 参考资料

- Connectivity Standards Alliance, [Matter 1.6 Core Specification](https://csa-iot.org/wp-content/uploads/2026/06/23-27349-011_Matter-1.6-Core-Specification.pdf), §5.4.2.5.5, Advertising Address.
- Bluetooth SIG, [Bluetooth Core Specification 6.3, Vol 6, Part B, §1.3.2](https://www.bluetooth.com/wp-content/uploads/Files/Specification/HTML/Core_v6.3/out/en/low-energy-controller/link-layer-specification.html), Random Device Address.
- Project CHIP, [connectedhomeip](https://github.com/project-chip/connectedhomeip/tree/0f267927e02ce234ec75a7a4970104a73bcc06dc), BLE platform implementations.
