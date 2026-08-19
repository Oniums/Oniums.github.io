---
title: Matter 已配网设备为什么不再用 BLE？一次讲清 DNS-SD、BCM 与 ECM
date: 2026-08-19 10:00:00
categories:
  - 无线协议
tags:
  - Matter
  - Thread
  - Commissioning
  - Multi-Admin
  - DNS-SD
  - Bluetooth LE
---

一台 Matter over Thread 设备已经加入生态 A。现在让它重新进入配网状态，再用生态 B 的 App 扫描机身二维码，设备没有重新发出 Bluetooth LE 配网广播，为什么仍然可能成功加入第二个 Fabric？

这个问题最容易产生两个误解：

1. 扫描二维码就等于接下来一定使用 BLE；
2. BLE 对应 Basic Commissioning，DNS-SD 对应 Enhanced Commissioning。

两种理解都不准确。**BLE 与 DNS-SD 解决“怎样发现和连接设备”，BCM 与 ECM 解决“配网窗口使用哪一种 Passcode”。它们是两个不同维度。**

<!-- more -->

本文从一台已接入 Thread 网络的传感器出发，说明首次配网、BCM 二次配网和 ECM 二次配网的差别，以及 Thread Border Router、手机、Hub 和二维码各自在流程中承担什么角色。

本文只讨论“把已配网设备加入新的 Matter Fabric”。Matter Network Recovery、厂商私有 BLE OTA、产测和维护服务不在本文范围内，它们可能有独立的 BLE 行为。

## 一句话结论

对于已经加入至少一个 Matter Fabric、并已连接 Thread 或其他 IP 网络的设备：

- 后续 Fabric 的配网发现应通过现有 IP 网络上的 DNS-SD；
- 已配网设备不应重新通过 BLE 发布普通 commissioning announcement；
- BCM 使用设备原始 Onboarding Payload，例如机身二维码或原手动码；
- ECM 使用现有管理员临时生成的新 Passcode；
- BCM 和 ECM 都可以通过 IP 建立 PASE，二维码本身不决定底层通道；
- 新增 Matter Fabric 不等于切换 Thread 网络。

可以把三个常见场景先压缩成下面这张表：

| 场景 | 发现与连接通道 | 配对凭据 | 结果 |
|---|---|---|---|
| Factory-new 首次配网 | 常见 Thread 设备使用 BLE；也取决于设备支持能力 | 机身原二维码或手动码 | 加入首个 Fabric，必要时获得 Thread Dataset |
| 已配网设备打开 Basic 窗口 | 现有 IP 网络上的 DNS-SD | 机身原二维码或手动码 | 新增一个 Fabric，通常保持原 operational network |
| 现有管理员打开 Enhanced 窗口 | 现有 IP 网络上的 DNS-SD | 新生成的临时码 | 新增一个 Fabric，通常保持原 operational network |

这只是三个常见工程场景，不是 Matter 对所有 commissioning flow 的完整分类。Matter Core Specification 还分别定义了 Standard、User-Intent、Custom 等产品交互流程，以及 discovery、commissioning channel、管理员辅助开窗等不同维度。

## 先把两个维度彻底分开

### 维度一：怎样发现并连接设备

Matter Commissionable Node Discovery 可以使用多种技术：

- Bluetooth LE；
- 已有 IP 网络上的 DNS-SD；
- 支持时还可能使用 Wi-Fi Public Action Frame、NFC 等机制。

这些机制回答的是：

```text
待配网设备在哪里？
怎样从多个候选设备中找到目标？
建立 PASE 前，Commissioner 应连接哪个地址和端口？
```

### 维度二：配网窗口使用哪一种凭据

BCM 与 ECM 回答的是另一个问题：

```text
新 Commissioner 应使用原始固定 Passcode，
还是使用现有管理员刚生成的临时 Passcode？
```

| 方法 | 全称 | Passcode 来源 | DNS-SD 中的 Commissioning Mode |
|---|---|---|---:|
| BCM | Basic Commissioning Method | Commissionee 原始 Onboarding Material | `CM=1` |
| ECM | Enhanced Commissioning Method | 当前管理员生成的随机临时 Passcode | `CM=2` |

因此下面两组等式都不成立：

```text
BLE = BCM
DNS-SD = ECM
```

正确关系应该是：

```text
BLE / DNS-SD：发现和建立 commissioning channel 的方式
BCM / ECM：配网窗口和 Passcode 的方法
```

## 场景一：Factory-new 设备为什么常见 BLE

一台刚恢复出厂的 Matter over Thread 设备还没有 Thread Dataset，也没有可用的 operational IP 路径。对于这类产品，BLE 是很自然的临时 commissioning channel：

```text
手机扫描二维码
  ↓
解析 Discriminator 和 Setup Passcode
  ↓
发现并连接 BLE Commissionable Advertising
  ↓
CHIPoBLE / BTP
  ↓
PASE
  ↓
设备证明、CSR、AddNOC
  ↓
写入 Thread Dataset 并连接 Thread
  ↓
通过 operational IP 建立 CASE
  ↓
CommissioningComplete
```

这里 BLE 的职责是提供临时发现和传输通道。投入运行后，设备的长期身份来自 Fabric、Node ID、NOC 和 CASE，不来自 BLE MAC 地址。

需要注意，Matter 并没有规定所有首次配网都必须走 BLE。如果设备已经通过其他方式连接到 IP 网络，首次 Matter commissioning 也可以从 DNS-SD/IP 开始。

## 场景二：已配网设备打开 Basic 窗口

设备已经拥有 Fabric，并且已经位于 operational Thread/IP 网络上。此时如果产品通过按键、菜单或其他本地动作打开 Basic Commissioning Window，典型流程变成：

```text
用户在设备上触发 Basic 开窗动作
  ↓
设备在现有 IP 网络注册 _matterc._udp
  ↓
DNS-SD TXT 记录表明 CM=1
  ↓
新生态扫描机身原二维码
  ↓
按 Discriminator 匹配 DNS-SD 结果
  ↓
通过 IPv6/UDP 建立 PASE
  ↓
Attestation、CSR、AddNOC
  ↓
新增第二个 Fabric
  ↓
CASE、CommissioningComplete
```

这里的“按几秒、按哪个键、灯怎样提示”不是 Matter 统一规定，而是产品交互设计。Matter 规范约束的是：已配网设备如果再次发布 commissioning request，应在 operational network 上使用 DNS-SD，而不是重新发布普通 BLE commissioning announcement。

从凭据角度看，`CM=1` 表示新 Commissioner 使用 Commissionee 提供的 Passcode，例如设备标签、包装或屏幕上的原始 Onboarding Material。扫描原二维码并不意味着后续必须走 BLE。

### 规范中的 BCM 与物理按键要区分

Matter Core Specification 的 Administrator Assisted BCM 给出的规范流程，是当前管理员通过 CASE 发送 `OpenBasicCommissioningWindow`。一些产品和生态还提供物理动作直接打开 Basic 窗口，让用户复用原始二维码。

BCM 对 Node 和 Administrator/Commissioner 是可选方法，因此不能假设每款设备和每个生态都支持原二维码二次配网。

因此，描述具体产品时应分别给出证据：

- “长按 N 秒”来自产品设计、说明书或 DCL pairing instruction；
- “打开 Basic Commissioning Window”来自设备实现；
- “已配网后使用 DNS-SD/IP”来自 Matter 规范；
- “使用原始二维码”来自 BCM/`CM=1` 的凭据语义。

不能把四项合并后，误写成 Matter 规范强制所有设备“长按固定秒数”。

## 场景三：现有管理员打开 Enhanced 窗口

ECM 是更标准化的 Multi-Admin 分享路径：

```text
用户在生态 A 中选择“共享 Matter 设备”
  ↓
生态 A 的 Administrator 通过 CASE 访问设备
  ↓
发送 OpenCommissioningWindow
  ↓
生成随机临时 Passcode 和对应 PAKE Verifier
  ↓
设备发布 _matterc._udp，CM=2
  ↓
生态 A 向用户展示临时二维码或 11 位配对码
  ↓
生态 B 使用临时码通过 IP 建立 PASE
  ↓
AddNOC，加入生态 B 的 Fabric
```

ECM 的几个关键点是：

- Node 和 Commissioner/Administrator 必须实现 ECM；
- 使用新的随机 Passcode，不复用设备机身固定 Passcode；
- 临时 Passcode 有明确的窗口生命周期；
- 当前管理员先通过已有 CASE 会话授权开窗；
- 新管理员仍然使用 DNS-SD/IP 发现设备并完成后续 commissioning。

## DNS-SD 具体发布什么

已配网设备打开 commissioning window 后，发布的是 Matter Commissionable Node Discovery 服务：

```text
_matterc._udp
```

DNS-SD 常见记录包括：

| DNS 记录 | 提供的信息 | 用途 |
|---|---|---|
| PTR | `_matterc._udp` 下有哪些服务实例 | 枚举可配网设备 |
| SRV | 目标主机名和 Matter 端口 | 告诉 Commissioner 连接哪里 |
| AAAA | 设备 IPv6 地址 | 建立实际 IP 通信 |
| TXT | Discriminator、Commissioning Mode、VID/PID 等 | 匹配二维码并判断开窗类型 |
| Subtype PTR | 按 Discriminator、Vendor ID、Device Type 等筛选 | 减少无关候选设备 |

一组抽象后的记录可能类似：

```text
PTR  _matterc._udp.local
     → <temporary-instance>._matterc._udp.local

SRV  <temporary-instance>._matterc._udp.local
     → <device-host>:<matter-port>

AAAA <device-host>
     → <device-ipv6-address>

TXT  D=<discriminator>
     CM=1
     VP=<vendor-id>+<product-id>
     DT=<device-type>
```

这些都是发现信息。DNS-SD 不应携带：

- Matter Setup Passcode；
- Thread Network Key 或完整 Operational Dataset；
- Fabric Root Key、NOC 私钥或 CASE 会话密钥；
- 传感器实时状态或其他业务数据。

二维码提供 Passcode 和用于匹配的 Discriminator，DNS-SD 提供地址、端口和公开发现元数据。两者组合后，Commissioner 才能找到正确设备并建立 PASE。

## Thread 设备为什么需要 Border Router 代理

Wi-Fi 和 Ethernet 设备可以直接在局域网使用 mDNS。Thread 是低功耗 Mesh，如果把大量局域网 multicast 原样灌入 Thread，会增加空口和电池负担。

Matter over Thread 因此采用更合适的路径：

```text
Thread 设备
  │ 使用 SRP 注册服务
  ▼
Thread Service Registry
  │ 通常由 Thread Border Router 提供
  ▼
Advertising Proxy
  │ 在相邻 Wi-Fi / Ethernet LAN 发布 DNS-SD
  ▼
手机或新生态的 Commissioner
```

这里要分清三个角色：

| 角色 | 职责 |
|---|---|
| Matter 设备 | 拥有并注册 `_matterc._udp` 服务 |
| Thread Border Router | 路由 IPv6，并代理 Thread 侧 DNS-SD 服务 |
| 新 Commissioner | 查询服务、匹配二维码并发起 PASE |

Border Router 的代理机制通常一直存在。设备打开窗口后，新出现的是 `_matterc._udp` 服务记录；不是原生态收到按键事件后，临时决定“把设备分享出去”。

Border Router 也不会因此把原 Fabric 的 NOC、密钥或权限交给新生态。它只解决 IP 路由和服务发现，新 Fabric 的信任关系仍由 PASE、设备证明、Operational Credentials 和 `AddNOC` 建立。

## 扫码后的手机会不会先等 BLE 超时

二维码只是一份 Onboarding Payload。扫码后，Commissioner 获得 Passcode、Discriminator、VID/PID 等信息，用于寻找正确设备和建立 PASE。

Matter 规范要求 Commissioner 支持 DNS-SD commissioning discovery，不应因为二维码中的初始 discovery capability 就忽略 DNS-SD。具体生态可能：

- 同时观察 BLE 和 DNS-SD；
- 根据上下文选择发现方式；
- 把流程交给手机系统服务或家庭 Hub；
- 使用不同的扫描超时、缓存和重试策略。

这些调度细节属于生态实现。对于一个已经关闭 BLE、最终又成功加入第二个 Fabric 的设备，能够确定的是实际 device-facing commissioning channel 使用了 IP；不能仅凭成功结果反推出手机一定经历过“BLE 超时后再回退 DNS-SD”。

## 为什么新增 Fabric 通常不需要更换 Thread 网络

Thread operational network 与 Matter Fabric 是不同层次：

```text
Thread Dataset
→ 解决设备如何接入低功耗 IPv6 Mesh

Matter Fabric / NOC
→ 解决设备属于哪个管理和信任域
```

设备已经连接到可达的 Thread 网络时，第二个 Commissioner 可以经由现有 Border Router 访问设备，并给它安装新的 Fabric credentials。结果可能是：

```text
一张 Thread 网络
  ├── Fabric A
  ├── Fabric B
  └── Fabric C
```

这不表示多个生态共享同一套 Matter 密钥。每个 Fabric 都有独立的 NOC、Node ID、ACL 和 CASE 会话；Thread Border Router 只是转发 IPv6 数据，不能因为承担路由角色就解密不同 Fabric 的 Matter 应用消息。

## 怎样验证链路到底走了什么

### 设备侧

设备日志可以重点观察：

```text
Commissioning window opened
DNS-SD / _matterc._udp registration
PASE PBKDFParam / Pake1 / Pake2 / Pake3
ArmFailSafe
AttestationRequest
CSRRequest
AddTrustedRootCertificate
AddNOC
CASE Sigma
CommissioningComplete
Fabric committed
```

如果已配网设备没有任何 BLE connection 事件，却完成了 PASE 和后续 commissioning，可以证明 device-facing 链路使用了 IP，但不能仅凭设备 UART 还原手机内部是否并行启动过 BLE scan。

### 局域网侧

在支持相应工具的电脑上，可以观察 commissionable service：

```bash
dns-sd -B _matterc._udp local
```

Linux 常见工具：

```bash
avahi-browse -rt _matterc._udp
```

Wireshark 可以从这些方向筛选：

```text
mdns
dns
udp.port == 5353
```

需要注意，Thread 侧本身通常使用 SRP 和 Unicast DNS，由 Border Router 的 Advertising Proxy 在相邻 LAN 上代表设备处理 mDNS。只抓 Thread 空口，不一定能看到与 Wi-Fi LAN 完全相同的 mDNS 报文。

### 成功判据

发现 `_matterc._udp` 只证明设备可被找到；`AddNOC` 也只证明新 Fabric credentials 已进入配网事务。完整闭环还应继续确认：

```text
PASE完成
→ Attestation/CSR完成
→ AddNOC成功
→ operational CASE建立
→ CommissioningComplete成功
→ Fabric提交并在重启后仍存在
→ 新生态建立订阅或正常读写
```

## Matter 官方文档在哪里描述

可以从 [Connectivity Standards Alliance 规范下载页面](https://csa-iot.org/developer-resource/specifications-download-request/)获取 Matter Core Specification。以 Matter 1.5 为例，相关章节主要是：

| 章节 | 内容 |
|---|---|
| §4.3.1 | Commissionable Node Discovery，定义 `_matterc._udp`、TXT 字段和 `CM` |
| §5.4.2.1 | 多种 discovery technology 的 announcement |
| §5.4.2.2 | 已配网节点只通过 operational network 上的 DNS-SD 发布 commissioning request |
| §5.4.2.7 | Existing IP-bearing Network，以及 Thread SRP/Advertising Proxy |
| §5.4.3 | Commissioner 怎样执行 discovery |
| §5.5 | PASE、Attestation、AddNOC、CASE、CommissioningComplete 主流程 |
| §5.6.2 | Basic Commissioning Method，原 Onboarding Payload 与 IP discovery |
| §5.6.3 | Enhanced Commissioning Method，临时 Passcode 与 DNS-SD |

生态实现参考还可以阅读：

- [Google：Commissionable and Operational Discovery](https://developers.home.google.com/matter/primer/commissionable-and-operational-discovery)
- [Amazon：Best Practices to Commission Matter Devices with Alexa](https://developer.amazon.com/docs/alexaplus/smarthome/best-practices-commission-matter.html)

Google 的说明特别解释了 Thread 设备如何通过 SRP 和 Border Router Advertising Proxy 对外提供 DNS-SD；Amazon 的说明则把 BCM 原始二维码、ECM 临时码和 `CM=1`/`CM=2` 的用户路径进行了对照。

## 最容易出现的六个误解

### 误解一：扫码就一定走 BLE

二维码提供凭据和匹配信息，不负责选择无线承载。PASE 可以通过 BLE commissioning channel，也可以通过现有 IP 网络。

### 误解二：BLE 就是 BCM，DNS-SD 就是 ECM

BLE/DNS-SD 是 discovery/channel；BCM/ECM 是 Passcode/window，两者是正交维度。

### 误解三：Border Router 是原 Fabric 的“分享服务器”

Border Router 代理 DNS-SD 并路由 IPv6，不代表它把原 Fabric credentials 分享给新生态。

### 误解四：新增 Fabric 就要加入新的 Thread 网络

Fabric 与 Thread operational network 不在同一层。Multi-Admin 可以在同一张 Thread 网络上增加多个独立 Fabric。

### 误解五：看到 AddNOC 就代表配网成功

还需要 CASE、`CommissioningComplete`、Fabric commit，以及需要时的订阅和业务交互证据。

### 误解六：Matter 规定所有产品长按固定秒数打开 BCM

按键和时长是产品交互定义。Matter 规定的是 commissioning window、discovery、安全会话和凭据语义。

## 总结

理解 Matter Multi-Admin 的关键，不是记住某一家 App 的页面顺序，而是始终分开三个问题：

```text
怎样找到设备？
→ BLE、DNS-SD、其他 discovery technology

使用什么临时信任凭据？
→ BCM 原始 Passcode，或 ECM 临时 Passcode

最终建立什么长期关系？
→ AddNOC，把设备加入一个新的 Matter Fabric
```

对于已连接 Thread 网络的设备，打开二次配网窗口后出现的核心变化，是设备开始注册 `_matterc._udp` commissionable service。Thread Border Router 将这项服务代理到家庭 LAN，新 Commissioner 用二维码或临时码匹配设备，通过 IP 建立 PASE，最后安装新的 Fabric credentials。

**二维码不是 BLE 的同义词，DNS-SD 不是 ECM 的同义词，Thread 网络也不是 Matter Fabric。**把这三组概念分开，跨生态二次配网的大部分现象就能解释清楚。
