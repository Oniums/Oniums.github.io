---
title: 一次 Apple Home 配网为什么会出现两个 Matter Fabric？从完整日志还原真相
date: 2026-08-04 15:10:00
categories:
  - 无线协议
tags:
  - Matter
  - Thread
  - Apple Home
  - Fabric
  - Commissioning
---

把一台 Matter over Thread 设备添加到 Apple Home 后，设备重启时打印出了两个 Fabric。与此同时，产品的“配网成功”灯效也连续出现了两次。

这是否意味着一台 HomePod 固定占用两个 Fabric？还是日志重复打印、配网重试，或者设备误入了另一个生态？

<!-- more -->

一份覆盖首次配网、两次凭据写入和重启恢复的完整设备日志给出了更精确的答案：

> 在这次实测中，Apple 配网流程确实创建了两个独立的 Matter Fabric：一个属于 `Apple Inc.`，另一个属于 `Apple Keychain`。但这不能简化成“每台 HomePod 固定占两个 Fabric”，也不能直接推广成 Apple 对所有系统版本的永久承诺。

本文不公开原始设备地址、Node ID、Fabric ID、Thread Dataset 或任何网络密钥，只保留理解协议流程所需的日志锚点。

## 先把容易混淆的三个概念拆开

### Fabric 是 Matter 管理域

Matter Fabric 是一组共享信任根和运行身份体系的 Matter 节点。设备加入新的 Fabric 时，会获得属于该 Fabric 的 NOC、Node ID、访问控制项等数据。

一个设备可以同时属于多个 Fabric。例如，它可以分别接受 Apple Home、Google Home 或 Home Assistant 的直接 Matter 控制。这正是 Matter Multi-Admin 的基础。

### Thread 网络是 IPv6 Mesh

Thread Operational Dataset 决定设备加入哪张 Thread Mesh，包括网络名称、信道、PAN 信息和安全材料。它解决的是低功耗 IPv6 网络接入，不定义设备属于哪个 Matter 管理域。

因此：

```text
一张 Thread 网络
    可以承载
多个 Matter Fabric 的加密会话
```

第二个 Fabric 不等于第二张 Thread 网络。

### HomePod 可以同时承担多个角色

HomePod 或 Apple TV 可能同时承担家庭中枢、Matter Controller 和 Thread Border Router 等角色。这些角色装在同一台硬件里，并不意味着它们是同一个协议概念。

Thread Border Router 负责在 Thread 与家庭其他 IP 网络之间路由数据；Fabric 则描述 Matter 身份和信任关系。不能按 HomePod 数量计算 Fabric 数量。

## 完整日志展示了怎样的时间线？

将唯一标识全部脱敏后，整个流程可以压缩成六个阶段。

| 阶段 | 设备侧关键证据 | 能证明什么 |
|---|---|---|
| 1 | BLE 建连，完成 PBKDF 与 PASE | 手机与新设备建立临时安全配网会话 |
| 2 | 第一次 `AddTrustedRootCertificate`、`AddNOC` | 创建 Fabric 1 |
| 3 | Fabric 1 建立 CASE，收到第一次 `CommissioningComplete` 并提交存储 | 第一个 Fabric 完整配网成功 |
| 4 | Fabric 1 的管理员通过 CASE 再次发送 CSR、Trusted Root 和 `AddNOC` | 由已有管理员创建 Fabric 2 |
| 5 | Fabric 2 建立自己的 CASE，收到第二次 `CommissioningComplete` 并提交存储 | 第二个 Fabric 完整配网成功 |
| 6 | 设备重启后分别恢复 Fabric 1 和 Fabric 2 | 两者都是真实持久化数据，不是 pending 状态或重复打印 |

接下来逐段看最关键的区别。

## 第一个 Fabric：典型的首次 BLE/PASE 配网

恢复出厂的设备先通过 Bluetooth LE 与 Commissioner 建立连接，然后完成 PASE。随后日志出现第一组运行凭据写入：

```text
Received an AddTrustedRootCertificate command
Received an AddNOC command
Added new fabric at index: 0x1
successfully created fabric index 0x1 via AddNOC
```

创建 Fabric 还不是最终成功。设备继续加入 Thread，发布运行服务，并使用新 NOC 建立 CASE。直到下面这组日志闭环，Fabric 1 才真正提交：

```text
CASE Session established ... fabricIndex 1
Received CommissioningComplete
Fabric index 0x1 was committed to storage
Fail-safe cleanly disarmed
```

提交日志记录的 Vendor ID 是 `0x1349`。Matter 开源 SDK 的厂商映射表将它标记为 `Apple Inc.`。

## 第二个 Fabric：不是第二次 BLE 配网

第一次 `CommissioningComplete` 之后，日志没有再次出现 BLE 建连、PBKDF、PASE，也没有再次下发 Thread Dataset。

相反，Fabric 1 中已经通过 CASE 认证的管理员继续发起了第二组操作：

```text
Msg RX from 1:<redacted-controller-node> ... InvokeCommandRequest
GeneralCommissioning: Received ArmFailSafe
OpCreds: Received a CSRRequest command
OpCreds: Received an AddTrustedRootCertificate command
OpCreds: Received an AddNOC command
Added new fabric at index: 0x2
```

消息来源中的 `1:` 表示请求来自 Fabric Index 1。也就是说，第二个 Fabric 不是陌生生态偶然扫到设备后重新配网，而是第一个 Apple Fabric 的管理员通过现有 CASE 安全会话主动创建。

随后，新 Fabric 的 Controller 使用自己的 NOC 建立 CASE，并完成第二轮提交：

```text
CASE matched destination ID: fabricIndex 2
CASE Session established ... fabricIndex 2
Received CommissioningComplete
Fabric index 0x2 was committed to storage
Fail-safe cleanly disarmed
```

第二次提交记录的 Vendor ID 是 `0x1384`。Matter SDK 厂商表对它的名称不是 Home Assistant，也不是第二台 HomePod，而是 `Apple Keychain`。

## 重启恢复排除了“重复日志”的可能

如果只在配网过程中看到两个 `Added new fabric`，还要考虑 Fail-safe 回滚、pending Fabric 或失败重试。

这份日志继续记录了设备重启。Matter Server 初始化时，FabricTable 从持久化存储中分别恢复：

```text
Fabric index 0x1 was retrieved from storage ... VendorId 0x1349
Fabric index 0x2 was retrieved from storage ... VendorId 0x1384
```

因此可以排除三种误判：

- 不是同一 Fabric 的重复打印；
- 不是只创建但没有提交的 pending Fabric；
- 不是 FabricIndex 显示异常。

设备上确实保存了两套不同的 Matter Fabric 身份。

## 为什么会出现两次“配网成功”灯效？

如果产品固件把每个 `CommissioningComplete` 都转换成一次三秒成功提示，那么上述流程自然会产生两次灯效：

```text
Apple Inc. Fabric 完成
    -> CommissioningComplete
    -> 成功灯效

Apple Keychain Fabric 完成
    -> CommissioningComplete
    -> 再次成功灯效
```

这不是设备加入了两次 Thread 网络，而是产品状态机把两个独立 Fabric 的完成事件都当成了用户可见的“整机配网成功”。

对于产品设计，这里有一个值得单独讨论的问题：第二个 Fabric 的建立属于同一次用户操作，LED 是否应该逐 Fabric 提示，还是只在整个生态流程结束后提示一次？协议事件和用户语义并不天然相同。

## 为什么不能写成“HomePod 固定占两个 Fabric”？

设备日志能证明两个 Apple Fabric 的存在和创建顺序，但不能仅凭设备侧 UART 确认每个 Controller Node 对应哪一台物理 Apple 设备。它更不能证明 Fabric 数量与 HomePod 数量之间存在一一对应关系。

更准确的说法是：

> 在本次 Apple Home 配网实测中，Apple 的配网体系为设备创建了 Apple Inc. 和 Apple Keychain 两个 Fabric。

下面几种说法则超出了证据：

- “每台 HomePod 都固定占两个 Fabric”；
- “再增加一台 HomePod 就会再增加两个 Fabric”；
- “所有 iOS、HomePod 软件版本永远采用相同流程”；
- “Thread Border Router 数量就是 Fabric 数量”。

Apple 的公开支持文档明确说明，Matter 配对信息会通过 iCloud Keychain 同步，并将 Keychain 与 Connected Services 分开管理。不过，公开文档没有直接写明“添加到 Apple Home 必然创建两个 Fabric”。

目前我们掌握的是两层证据：

1. Matter 开源 SDK 的厂商映射表明确存在 `Apple Inc.` 和 `Apple Keychain` 两个 Vendor ID；
2. 完整设备日志证明当前 Apple 软件组合实际使用了这两个 ID，并分别完成了 NOC、CASE、CommissioningComplete、存储提交和重启恢复。

这是很强的实现证据，但仍不应包装成 Apple 面向未来版本作出的公开协议承诺。

## 对 Matter 设备开发有什么影响？

### 1. 不要假设一次用户添加只产生一个 Fabric

产品状态机、统计和 UI 提示应把“单个 Fabric 完成”与“用户认为的整次添加完成”分开。仅靠 `CommissioningComplete` 次数驱动整机灯效，可能在不同生态下产生不同体验。

### 2. Fabric 容量要按真实条目计算

不要按手机、HomePod 或 Border Router 数量估算。应读取 Operational Credentials Cluster 的 Fabric/NOC 列表、`CommissionedFabrics` 和设备支持上限，并验证重启后的 FabricTable。

### 3. Thread 网络名不能识别 Matter 生态

即使 Thread 网络名称带有某个平台特征，也只说明设备使用了那份 Thread Dataset。判断 Matter Fabric 归属，应看 NOC、Fabric Vendor ID、CASE peer 和访问控制信息。

### 4. 删除、订阅和 OTA 都可能具有 Fabric 维度

两个 Apple 相关 Fabric 是两套身份域。某个 Fabric 的 CASE 或 Subscription 失效，不等于另一个 Fabric 被删除；OTA Provider、订阅和控制会话也必须结合 FabricIndex 分析。

## 一套可复用的双 Fabric 验证清单

以后再遇到“一次配网为什么出现两个 Fabric”，可以依次检查：

1. 配网开始前 `CommissionedFabrics` 是否为零；
2. 出现了几次 `AddNOC`；
3. 每次 `AddNOC` 创建了哪个 FabricIndex；
4. 请求来自 BLE/PASE、IP/PASE，还是已有 Fabric 的 CASE；
5. 每个 Fabric 是否分别建立 CASE；
6. 是否分别收到 `CommissioningComplete`；
7. 是否分别出现 `committed to storage` 和 Fail-safe disarm；
8. 重启后是否分别 `retrieved from storage`；
9. Vendor ID 在 Matter 厂商表中对应谁；
10. 整个过程中是否真的更换或重复下发 Thread Dataset。

只有把这些证据串起来，才能区分真正的双 Fabric、配网重试、Fail-safe 回滚和日志误读。

## 最终结论

这份完整日志证明：一次 Apple Home 用户配网操作可以在设备上留下两个持久化 Matter Fabric，即 `Apple Inc.` 与 `Apple Keychain`。

第二个 Fabric 由第一个 Apple Fabric 的管理员通过已有 CASE 会话创建；没有第二次 BLE/PASE，也没有加入第二张 Thread 网络。重启后两个 Fabric 分别恢复，排除了 pending 数据和重复打印。

因此，最准确的总结不是“HomePod 固定占两个 Fabric”，而是：

> 当前实测到的 Apple Home 配网实现会同时使用 Apple Home 控制域与 Apple Keychain 控制域；物理家庭中枢、Thread Border Router 和 Matter Fabric 必须分层理解。

## 参考资料

- [Apple：Pair and manage your Matter accessories](https://support.apple.com/en-ie/102135)
- [Apple Developer：Matter support in iOS](https://developer.apple.com/apple-home/matter/)
- [CSA：Matter Specifications 下载页](https://csa-iot.org/developer-resource/specifications-download-request/)
- [Matter connectedhomeip：Manufacturer Code 映射](https://github.com/project-chip/connectedhomeip/blob/master/src/app/zap-templates/zcl/data-model/manufacturers.xml)
- [Matter over Thread 入网为什么这么复杂？与 Zigbee 一步一步对照看懂](/posts/matter-over-thread-zigbee-commissioning-comparison/)
