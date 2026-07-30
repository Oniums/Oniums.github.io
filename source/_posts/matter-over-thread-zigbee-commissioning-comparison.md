---
title: Matter over Thread 入网为什么这么复杂？与 Zigbee 一步一步对照看懂
date: 2026-07-30 10:00:00
categories:
  - 无线协议
tags:
  - Matter
  - Thread
  - Zigbee
  - Commissioning
  - 入网
---

Zigbee 设备打开允许加入、搜索网络、获得密钥，似乎就能完成入网。Matter over Thread 为什么还要扫码、连接 Bluetooth LE、建立临时安全通道、验证设备证书、写入长期身份、加入 Thread，再切换到 IP 网络重新连接？

这些步骤是在把简单问题复杂化，还是在解决不同的问题？

<!-- more -->

本文跟随一台刚恢复出厂的门磁传感器，从拆箱一直走到 App 能稳定显示“门已打开”或“门已关闭”。每走一步，我们都回答五个问题：

1. 现在是谁在和谁通信？
2. 设备得到了什么？
3. 为什么需要这一步？
4. Zigbee 在相近阶段怎样处理？
5. 成功到这里，还不能证明什么？

## 先限定比较范围

“Matter 入网”和“Zigbee 入网”都不只有一种路径。为了让两条时间线能够真正对齐，本文只比较两个最常见的首次入网场景：

- Matter over Thread：恢复出厂的设备，通过常见的 Bluetooth LE 临时通道，加入已有 Thread 网络和 Matter Fabric；
- Zigbee：Factory New 设备，通过 Network Steering，加入采用集中式安全模型的 Zigbee 网络。

本文不把下面这些分支混进主线：

- 已经连接 IP 网络的 Matter On-network Commissioning；
- Matter 的第二管理员和多 Fabric；
- Zigbee Rejoin、Touchlink、分布式安全网络；
- 新版 Zigbee 增加的 Zigbee Direct、动态密钥协商和批量 commissioning。

这些分支会改变部分消息和安全步骤，但不会改变本文最重要的分析方法：**先分清网络接入、初始信任、长期身份和应用可用是四件不同的事。**

## 第 0 章：阅读前先认识几个角色

先不要急着记 PASE、CASE、NOC 等缩写。理解下面这些角色，已经足够开始阅读。

| 名词 | 先用一句人话理解 | 不要误解成 |
|---|---|---|
| Matter | 规定设备如何建立信任、描述功能和相互控制的标准 | 一种无线信号 |
| Thread | 面向低功耗设备的 IPv6 Mesh 网络 | 一套灯、门锁、传感器应用协议 |
| Matter over Thread | Matter 应用运行在 Thread 网络上的组合 | Matter 和 Thread 是同一个协议 |
| Zigbee | 从 Mesh 网络、安全到设备应用模型的一套协议体系 | Thread 的旧名称 |
| Commissioning | 把新设备安全登记进家庭系统的完整过程 | 只连上无线网络 |
| Commissioner | 给 Matter 新设备办理登记的一方，可能是手机或家庭中枢 | 必然就是 Border Router |
| Commissionee | 正在等待办理入网的 Matter 设备 | 一台特殊类型的硬件 |
| Thread Border Router | 在 Thread Mesh 与家庭 Wi-Fi、Ethernet 等 IP 网络之间转发数据 | Zigbee Coordinator 或协议翻译器 |
| Matter Fabric | 一组共享管理和信任关系的 Matter 节点 | 一张 Thread 网络或一个 Zigbee PAN |
| Zigbee Coordinator | 创建 Zigbee 网络的核心角色 | 所有 Zigbee Router |
| Zigbee Trust Center | 管理 Zigbee 设备准入和安全材料的角色 | 普通父节点 |

在实际产品里，一个家庭中枢可能同时承担 Matter Commissioner、Matter Controller 和 Thread Border Router；一个 Zigbee 网关也可能同时包含 Coordinator、Trust Center 和应用管理功能。

**装在同一个盒子里，不代表这些角色是同一件事。**

### 两边的简化关系

```text
Matter over Thread

手机或家庭中枢
  ├── Commissioner：办理入网
  ├── Controller：日常读取和控制
  └── 可能还包含 Thread Border Router
                         │
                         │ 在 Thread 与家庭 IP 网络间路由
                         ▼
                 Thread Mesh 中的门磁

Matter Fabric：
记录长期身份、管理关系和访问权限
```

```text
Zigbee

Zigbee 网关
  ├── Coordinator：创建网络
  ├── Trust Center：管理准入和安全
  └── 应用管理：识别门磁能力
             │
             ▼
      Router 或直接父节点
             │
             ▼
          Zigbee 门磁
```

如果还分不清三者的位置，可以先阅读[《Matter、Thread 与 Zigbee：先分清它们在哪一层》](/posts/matter-thread-zigbee-layers/)。

## 第 1 章：两台门磁加入的是同一种“网”吗？

### 先提出疑问

Matter over Thread 和 Zigbee 都可能使用 2.4 GHz IEEE 802.15.4。既然无线底层相似，为什么入网流程不能也做成一样？

### Zigbee 更像一套完整的小区系统

在本文讨论的经典集中式 Zigbee 网络里，设备从扫描网络开始，随后建立父子关系、获得网络地址和 Network Key，最后被网关识别出应用能力。

Zigbee 自己定义了：

- Mesh 网络怎样形成；
- 网络地址怎样使用；
- Trust Center 怎样管理安全准入；
- NWK、APS 层怎样保护通信；
- Endpoint、Cluster、Attribute 怎样表达设备功能。

它很像一个同时负责道路、门禁、住户管理和物业服务的小区系统。

### Matter over Thread 是两层组合

Matter over Thread 则把问题拆开：

- Thread 回答：设备怎样获得一条低功耗 IPv6 通信道路？
- Matter 回答：设备是谁、属于哪个家庭信任域、谁可以控制它、它有哪些标准能力？

因此，一台 Matter over Thread 门磁要完成两类登记：

1. 获得 Thread 网络资料并接入 Thread Mesh；
2. 获得 Matter 运行身份并加入一个 Fabric。

这两个结果经常在同一次用户操作中完成，但不是同一层协议状态。

### 为什么要这样拆开？

拆开的好处是：

- Matter 身份不必绑定在某个父节点或某个临时 IPv6 路由位置上；
- 同一个 Matter Fabric 可以包含 Thread、Wi-Fi 和 Ethernet 设备；
- Thread Border Router 只需要路由 IP 数据，不必理解门磁、灯或门锁；
- Matter 可以在应用层统一身份、权限和数据模型。

代价也很直接：

- 网络凭据和 Matter 身份凭据要分别管理；
- 配网要跨越 Bluetooth LE、Thread、IPv6 和 Matter 安全会话；
- “连接成功”出现了更多不同层次。

> **如果不拆开会怎样？**
>
> 网络拓扑、应用身份和生态管理会更加紧密地绑定在一起。系统可能更直接，但跨不同 IP 承载、多管理员和统一访问控制会更依赖网关或厂商自己的设计。

> **到这里证明了什么？**
>
> 我们只理解了两种架构的目标，还没有开始真正入网。

## 第 2 章：为什么要先打开一个“允许加入”的窗口？

### Matter：设备先表示“我现在可以办理登记”

恢复出厂的 Matter 设备通常会进入可 commissioning 状态，或者由用户按键主动打开 Commissioning Window。设备随后通过支持的发现方式告诉附近的 Commissioner：“我现在接受入网。”

在本文的典型场景里，这通常包括 Bluetooth LE 广播。

窗口不会永远开放，因为长期允许陌生控制端尝试建立初始会话，会增加无意义连接和攻击面。用户明确触发配网，也能把一次现实世界中的操作与后续网络操作联系起来。

### Zigbee：网关和设备两边都要准备好

Zigbee 网关通常先打开 Permit Join。Factory New 设备启动 Network Steering，在配置的信道集合中寻找允许加入的网络。

这里要区分两件事：

- Permit Join：网络允许新设备提出申请；
- 设备最终被接纳：还要经过关联和安全准入。

看到 Permit Join 已打开，不代表任何附近设备都已经成为网络成员。

### 可以怎样类比？

| 目的 | Matter over Thread | Zigbee |
|---|---|---|
| 设备表示愿意办理入网 | Commissioning Window / Commissionable 广播 | Factory New + Network Steering |
| 网络侧允许新设备申请 | Commissioner 开始添加流程 | Permit Join |
| 最终准入 | 后续 PASE、Attestation、NOC 等 | Association、Trust Center 安全流程等 |

Commissioning Window 和 Permit Join 的目的相近，但它们不是同一条协议命令。

> **如果没有窗口会怎样？**
>
> 设备或网络可能长期接受未经用户触发的入网尝试，既浪费资源，也难以把“用户正在添加这台设备”与无线世界里的请求对应起来。

> **到这里证明了什么？**
>
> 只证明双方进入了“可以尝试添加”的状态，还没有找到彼此，更没有建立安全关系。

## 第 3 章：为什么 Matter 要扫码，而 Zigbee 常常自己搜索网络？

### 扫码不是无线连接

Matter 二维码或手动配对码携带的是 Onboarding Payload，也就是帮助 Commissioner 找到目标设备并建立初始信任的引导信息。

对本文主线最重要的两项是：

- Discriminator：帮助从附近多个待配网设备中缩小目标；
- Setup Passcode：后面建立初始安全会话时使用的秘密。

二维码不包含真实家庭的 Thread Dataset，也不会因为被摄像头扫到，就自动连接设备。

可以把它理解为：

> 二维码告诉接待员“应该找哪位新住户，以及第一次见面用什么暗号”，而不是直接把小区总钥匙印在包装上。

### Matter 怎样发现设备？

典型过程是：

```text
用户扫描二维码
  -> App 解析引导信息
  -> 手机扫描附近 Commissionable 广播
  -> 使用 Discriminator 等信息筛选目标
  -> 建立 Bluetooth LE 连接
```

Bluetooth LE Connected 只说明手机和设备之间有了一条近距离通信链路。

### Zigbee 怎样发现网络？

经典 Network Steering 更像设备主动找小区：

```text
设备扫描候选信道
  -> 发送 Beacon Request
  -> 接收周围网络的 Beacon
  -> 判断网络是否允许加入
  -> 比较候选网络和父节点
  -> 选择目标网络
```

设备看到 Beacon，只证明它发现了网络。它还没有完成 Association，也没有获得可用的 Network Key。

### 为什么两边选择不同？

Matter 的用户通常是在 App 中明确添加某一台商品设备，二维码能帮助用户指认目标，并提供设备独有的初始秘密。Zigbee Network Steering 则更强调由设备扫描附近符合条件的 Zigbee 网络，再进入网络侧准入流程。

这不是“扫码一定比扫描安全”，而是两种系统如何把现实世界中的用户操作与网络申请绑定起来的不同选择。

> **如果 Matter 只有 BLE 广播、没有配对码会怎样？**
>
> 手机可能知道附近有待配网设备，却缺少设备独有的初始秘密来建立后续安全会话，也更难确认用户指向的是哪一台同型号设备。

> **到这里证明了什么？**
>
> 扫码证明 App 获得了引导信息；BLE 连接证明双方可以传数据。两者都不能证明 Thread 或 Matter 入网成功。

## 第 4 章：Bluetooth LE 已经连接，为什么还需要 PASE？

### “电话接通”不等于“进入保密会议室”

Bluetooth LE 解决的是近距离传输问题。它不自动证明对端就是二维码对应的设备，也不意味着 Thread 网络资料可以直接明文发送。

手机和设备会利用 Setup Passcode 建立一条本次 commissioning 使用的临时安全会话。Matter 把这一步称为 **PASE**，全称 Passcode Authenticated Session Establishment。

先记住一句话：

> PASE 是配网阶段的临时安全通道，不是设备日常运行的长期身份证。

### PASE 成功后能做什么？

Commissioner 可以通过受保护的 Matter 会话执行后续 commissioning 操作，例如：

- 读取设备的 commissioning 能力；
- 启动 Fail-safe；
- 配置法规或时间相关信息；
- 请求设备认证材料；
- 写入 Matter 运行凭据；
- 配置 Thread 网络。

Fail-safe 可以理解为“配网安全绳”：如果流程中途失败或超时，设备能够回退未最终确认的配置，避免长期停在只完成一半的状态。

### Zigbee 中哪个步骤最像 PASE？

没有一个完全相同的步骤。

Zigbee Association 主要建立设备的网络成员关系和父子关系；初始 Link Key、Install Code 派生 Key 等则承担初始安全引导的一部分目的。它们与 PASE 有交集，但协议层次和生命周期不同。

| 问题 | Matter PASE | Zigbee 经典加入 |
|---|---|---|
| 是否建立临时安全会话 | 是 | 不按 PASE 方式建立 |
| 是否建立父子网络关系 | 否 | Association 负责 |
| 初始秘密来源 | Setup Passcode | 预配置 Link Key、Install Code 派生 Key等 |
| 是否用于长期日常单播 | 否 | 初始 Key 是否继续使用取决于安全策略 |

> **如果没有 PASE 会怎样？**
>
> Thread Dataset、证书配置和其他 commissioning 数据将缺少 Matter 定义的初始安全会话保护，初始秘密也难以安全过渡到长期身份。

> **到这里证明了什么？**
>
> PASE 成功只证明双方建立了临时安全会话。设备仍可能没有 Thread 网络资料、没有 NOC，也没有加入 Fabric。

## 第 5 章：有了配网码，为什么还要验证设备是不是可信产品？

### 知道暗号，不等于拥有可信身份证

Setup Passcode 证明的是双方掌握同一个初始秘密。它不能单独回答：

- 设备是否由它声称的厂商制造；
- 设备是否持有对应的设备私钥；
- 产品身份和合规声明是否能形成可信链条；
- 当前响应是否来自一次旧通信的重放。

Matter 因此还有 **Device Attestation**，也就是设备认证。

### 用“身份证链”理解 Attestation

不用先背缩写，先看角色：

1. 每台设备有自己的设备证书和私钥；
2. 设备证书由上级产品认证机构签发；
3. Commissioner 信任更上层的根；
4. Commissioner 发送一次性随机挑战；
5. 设备使用私钥对本次挑战相关数据签名；
6. Commissioner 验证证书链、签名和产品声明。

专业名称对应如下：

| 白话角色 | Matter 名称 |
|---|---|
| 每台设备的身份证 | Device Attestation Certificate，DAC |
| 签发设备证书的上级 | Product Attestation Intermediate，PAI |
| 信任链根 | Product Attestation Authority，PAA |
| 产品合规声明 | Certification Declaration，CD |

PAA 根证书通常来自 Commissioner 的信任库，不是简单要求设备“自己拿一张根证书证明自己”。

### Attestation 能证明到什么程度？

它帮助 Commissioner 验证设备持有的认证身份和产品声明。它不自动证明：

- 固件永远没有漏洞；
- 设备运行环境没有被破坏；
- 用户一定应该授权这台设备进入家庭；
- 入网后的每一次业务操作都天然允许。

设备认证是准入证据之一，最终策略仍由 Commissioner 和生态决定。

### Zigbee 有没有完全对应的步骤？

在本文比较的经典 Zigbee 3.x 集中式安全加入中，没有与 Matter 设备证书链认证完全等价的通用步骤。

Trust Center 可以根据设备信息和安全策略决定是否接纳；Install Code 可以让设备与 Trust Center 拥有设备唯一的初始秘密。但“证明双方知道唯一秘密”与“验证厂商、产品声明和设备证书链”仍然是不同问题。

较新的 Zigbee 版本继续扩展 commissioning 和安全能力，因此具体项目必须回到目标 Zigbee Core、BDB 与安全策略确认，不能把本文的经典路径当成所有版本的唯一实现。

> **如果没有 Attestation 会怎样？**
>
> Commissioner 仍可能依靠配网码建立初始加密，但更难用标准化证书链验证设备声称的产品身份和设备私钥。

> **到这里证明了什么？**
>
> Attestation 成功证明认证材料通过了 Commissioner 的验证流程；它不证明 Thread 已连接，也不证明最终 CommissioningComplete 已完成。

## 第 6 章：为什么既要 Thread Dataset，又要 Matter NOC？

这是整篇文章最重要的问题。

### 两份材料回答两个不同问题

**Thread Active Operational Dataset** 回答：

> 设备怎样进入这张 Thread 网络？

它描述目标 Thread 网络的关键参数和安全材料，例如信道、网络标识、Mesh-Local Prefix 和网络安全信息。它不是适合公开分享的普通配置文本。

**Node Operational Certificate，NOC** 回答：

> 设备以什么 Node 身份加入哪个 Matter Fabric？

可以把二者理解为：

- Thread Dataset：小区道路和门禁的入场资料；
- NOC：写有住户身份和家庭归属的长期电子证件。

### Matter 长期身份怎样产生？

典型流程可以简化为：

```text
设备生成运行密钥对
  -> 设备提交 CSR
  -> Fabric 管理侧签发 NOC
  -> Commissioner 写入受信任根
  -> Commissioner 写入 NOC
  -> 建立 Node ID、Fabric 和初始管理关系
```

设备的运行私钥应留在设备内部。CSR 是证书签名请求，不是把私钥交给 Commissioner。

在典型流程中，AddNOC 还会帮助建立初始管理员主体和访问控制关系。日后 Matter 的读取、写入、命令和订阅仍要经过访问控制判断，而不是“知道设备 IP 地址就可以任意操作”。

### Zigbee 用哪些材料？

Zigbee 没有一张与 NOC 完全等价的单一证件。几个常见概念分别承担不同作用：

| Zigbee 概念 | 主要作用 |
|---|---|
| EUI-64 | 设备长期标识 |
| 16 位短地址 | 当前网络中的运行地址 |
| Network Key | 保护 Zigbee NWK 层通信的网络共享密钥 |
| Trust Center Link Key | 设备与 Trust Center 之间的安全管理材料 |
| Install Code 派生 Key | 设备唯一的初始安全引导材料 |

Network Key 让设备参与受保护的 Zigbee 网络通信，但它不是某台设备独有的运行证书。短地址适合当前网络中的高效寻址，但也不等于长期产品身份。

### 最容易记错的几个等式

```text
Thread Dataset ≠ Matter NOC
Matter Fabric ≠ Thread Network
Matter Fabric ≠ Zigbee PAN
Matter NOC ≠ Zigbee Network Key
Matter Node ID ≠ Zigbee Short Address
Setup Passcode ≠ Zigbee Install Code
```

它们可以在“网络凭据”“长期身份”“初始秘密”等目的层面比较，但不能在实现、抓包或日志里互换。

> **如果只有 Dataset、没有 NOC 会怎样？**
>
> 设备可以获得 Thread 网络连接，却缺少加入 Matter Fabric 的标准长期身份。

> **如果只有 NOC、没有 Dataset 会怎样？**
>
> 设备可能已经准备好 Matter 身份，却没有进入目标 Thread 网络的道路。

> **到这里证明了什么？**
>
> NOC 写入证明 Fabric 运行凭据已经配置到相应阶段。它不等于设备已经成功 Thread Attach，也不等于 CASE 和 CommissioningComplete 已完成。

## 第 7 章：设备怎样真正加入 Thread？Zigbee 又怎样加入自己的网络？

### Matter：通过 PASE 下发 Thread 入场资料

在本文场景里，Commissioner 已经从家庭系统获得目标 Thread Dataset，再通过 PASE 保护的 commissioning 会话配置设备的 Thread 网络。

高层过程是：

```text
Commissioner 配置 Thread Dataset
  -> 要求设备连接目标网络
  -> 设备扫描并找到目标 Thread Partition
  -> 设备寻找可用 Router 或 REED
  -> 建立 Parent-Child 关系
  -> 获得 Thread 网络数据和 IPv6 地址能力
  -> 成为 Child
```

Thread 使用 Mesh Link Establishment，简称 MLE，发现和维护邻居关系。本文的电池门磁通常作为 End Device，通过一个 Parent Router 通信。即使是 Router-Eligible 设备，首次 Attach 也先以 Child 身份进入网络。

Thread Border Router 的任务是把 Thread 与相邻 IP 网络连接起来。它不是负责给门磁解释 Matter Cluster 的应用网关，也不一定是门磁当前的无线父节点。

### Zigbee：先建立网络位置，再完成安全准入

经典首次 Network Steering 可以简化为：

```text
扫描信道和 Beacon
  -> 选择目标 PAN 与父节点
  -> Association Request
  -> Association Response
  -> 获得 16 位短地址
  -> Trust Center 安全准入
  -> 接收并安装 Network Key
  -> 开始受保护的 NWK 通信
```

Association 由 IEEE 802.15.4 MAC 层提供，用来建立网络成员关系。获得短地址说明设备已经有了初步网络位置，但它还必须正确接收、验证并安装安全材料。

所以：

- Transport Key 已经从发送端发出，不等于接收端已经解密；
- 收到 MAC ACK，不等于 Network Key 已安装；
- 获得短地址，不等于 BDB commissioning 全部完成。

### 两条路径真正对应在哪里？

| 目标 | Matter over Thread | Zigbee |
|---|---|---|
| 找到无线网络 | Thread 扫描与发现 | 信道扫描与 Beacon |
| 建立父子关系 | Thread MLE Attach | Association |
| 获得网络安全资料 | 预先通过 PASE 配置 Dataset | Trust Center 传输 Network Key |
| 获得网络地址能力 | Thread IPv6 地址与网络数据 | 16 位短地址与 Zigbee NWK 状态 |
| 网络层可通信 | Thread/IPv6 可用 | 受保护 Zigbee NWK 通信可用 |

两边都要解决“找网络、选父节点、获得网络安全材料、开始正常通信”，但凭据怎样送到设备、长期身份放在哪一层，设计明显不同。

> **如果只看到 Thread 设备成为 Child 会怎样？**
>
> 可以确认 Thread 网络层已经进展到 Attach 成功附近，但仍不能确认 Matter CASE、CommissioningComplete 和应用订阅。

> **如果只看到 Zigbee Association Success 会怎样？**
>
> 可以确认父子关系和短地址分配已经进展，但仍不能确认 Network Key 安装、TCLK 流程和应用发现。

## 第 8 章：Thread 已经连上，为什么 Matter 还要重新找设备？

### 从临时接待通道切换到正式道路

前面的 Matter 操作主要通过 Bluetooth LE 上的 PASE 会话完成。设备加入 Thread 后，后续日常通信应走 Thread 承载的 IPv6，而不是长期依赖手机与设备之间的 BLE 连接。

Commissioner 需要在正式 IP 网络中找到设备。这称为 **Operational Discovery**。Matter 使用 DNS-SD 等机制解析设备当前可用的地址和端口。

这里有一个很重要的设计：

> Matter 身份是 Node 与 Fabric 身份，不是某个固定 IPv6 地址。

Thread 节点可能拥有多类 IPv6 地址，某些地址还会随拓扑变化。Controller 应通过运行态发现解析设备，而不是把 commissioning 时看到的某个地址永久当成设备身份。

### 为什么还要建立 CASE？

找到设备地址以后，双方使用 Fabric 的运行证书建立长期单播安全会话。这称为 **CASE**，全称 Certificate Authenticated Session Establishment。

可以这样区分：

| 会话 | 使用阶段 | 主要信任基础 | 用完以后 |
|---|---|---|---|
| PASE | 初次 commissioning | Setup Passcode | 不作为日常长期身份 |
| CASE | 日常运行和正式管理 | Fabric 运行证书 | 可按需重建和恢复 |

PASE 像门口的一次性接待室，CASE 像正式住户凭证建立的长期安全通信。

### Zigbee 为什么没有同样的通道切换？

经典 Zigbee 入网从扫描、Association 到后续 Cluster 通信，都留在 Zigbee 协议栈中。设备安装 Network Key 后，会继续通过 Zigbee NWK、APS 和 ZCL 交互。

它不需要经历“BLE 临时通道 → Thread/IPv6 正式通道”的相同切换，因此也没有与 Operational Discovery + CASE 完全等价的一组步骤。

Zigbee 仍然要处理地址映射、Device Announcement、Link Key 和应用发现，只是问题被组织在另一套协议结构里。

> **如果没有 Operational Discovery 会怎样？**
>
> Commissioner 可能知道设备的 Fabric 身份，却不知道它现在可以通过哪个 IP 地址和端口访问。

> **如果继续只用 PASE、不建立 CASE 会怎样？**
>
> 日常通信将依赖初始配网秘密，难以利用 Fabric 证书、Node 身份和访问控制建立长期管理关系。

> **到这里证明了什么？**
>
> CASE 成功证明双方已通过正式网络和 Fabric 身份建立安全会话。最终 commissioning 仍要完成确认。

## 第 9 章：为什么还需要 CommissioningComplete？

### 配置写完，不等于验收结束

Commissioner 已经完成设备认证、运行凭据配置和 Thread 网络连接，也已经通过正式网络建立 CASE。最后，它会发送 **CommissioningComplete**。

这一步的意义可以理解为：

- 确认新的运行身份和网络路径确实可用；
- 正式结束本次 commissioning；
- 解除前面用于失败回滚的 Fail-safe；
- 不再把设备停留在“正在办理入住”的中间状态。

它像装修、通电和证件登记都完成后的最终交房签字。

### Zigbee 怎样宣布完成？

Zigbee 设备安装 Network Key 并开始受保护通信后，通常还会：

- 发送 Device Announcement；
- 完成由目标 BDB 版本和 Trust Center 策略要求的 Link Key 相关流程；
- 由 BDB 状态机报告 commissioning 结果。

具体的 TCLK 更新或交换路径取决于目标版本和安全策略。不能看到 Network Key 就一概宣称所有安全步骤完成。

### 两边的成功阶梯

```text
Matter over Thread

发现设备
  -> BLE 连接
  -> PASE
  -> Device Attestation
  -> NOC / Fabric 身份
  -> Thread Attach
  -> Operational Discovery
  -> CASE
  -> CommissioningComplete
```

```text
Zigbee

发现网络
  -> 选择父节点
  -> Association
  -> 获得短地址
  -> 接收并安装 Network Key
  -> 受保护的 NWK 通信
  -> Device Announcement
  -> TCLK / BDB 相应流程完成
```

> **如果没有最终完成确认会怎样？**
>
> 设备可能保留只完成一部分的网络或身份配置，系统也难以区分“仍在办理”与“已经正式可用”。Matter 的 Fail-safe 正是为了约束这种中间状态。

> **到这里证明了什么？**
>
> CommissioningComplete 成功证明本次 Matter commissioning 正式闭环。它仍不保证生态已经建立稳定订阅，也不保证 App 的设备模型完全正确。

## 第 10 章：为什么 App 显示“添加成功”，设备仍可能不可用？

### 入网成功与业务可用是两个阶段

一台门磁真正好用，至少还要让平台知道：

- 它有哪些 Endpoint；
- 它是什么 Device Type；
- 它实现了哪些 Cluster；
- 门开、门关状态从哪里读取；
- 状态变化怎样持续上报；
- 当前 Controller 是否有读取或订阅权限。

Matter Controller 通常会读取设备结构和属性，并建立 Subscribe。订阅建立后，设备才能在约定条件下持续报告状态变化。

如果 CommissioningComplete 已成功，但从未建立 Subscribe，门磁可能“在网、可信、可寻址”，App 却无法持续得到门状态。

### Zigbee 网关也要做设备 Interview

Zigbee 网络接入完成后，网关通常还会：

- 查询 Node Descriptor；
- 查询 Active Endpoints；
- 读取 Simple Descriptor；
- 读取 Basic 属性；
- 识别支持的 Cluster；
- 配置 Reporting；
- 按需要建立 Binding。

所以 Zigbee 设备获得短地址或发送 Device Announcement，也不等于网关已经完整识别它。

### 把“成功”分成四级

| 成功级别 | Matter over Thread 示例 | Zigbee 示例 | 还不能证明 |
|---|---|---|---|
| 发现成功 | 找到 BLE 广播 | 看到 Beacon | 已建立安全或网络成员关系 |
| 网络接入成功 | Thread Attach / IPv6 可用 | Association + 安全 NWK 通信 | 长期应用关系和平台识别完成 |
| 长期信任成功 | NOC、CASE、CommissioningComplete | BDB 和目标安全流程完成 | 状态订阅、Reporting 一定正常 |
| 业务可用 | Read/Subscribe/Report 正常 | Interview/Binding/Reporting 正常 | 所有异常和长期稳定性都已验证 |

这四级比一个模糊的“配网成功”更适合分析真实问题。

> **到这里证明了什么？**
>
> 只有平台成功识别设备并稳定收发业务状态，才能说门磁对用户真正可用。

## 第 11 章：断线以后，为什么有时自动回来，有时必须重新配网？

设备离线不等于所有身份和密钥都已丢失。

### Matter over Thread

如果设备仍保存 Thread Dataset 和 Fabric 凭据：

- Thread 可以重新选择父节点并 Reattach；
- IPv6 地址或路由位置可能变化；
- Controller 可以重新执行 Operational Discovery；
- CASE 会话可以按需重新建立；
- 原有 Fabric 身份不需要因为一次无线掉线重新签发。

因此：

```text
Thread Reattach ≠ Matter Recommissioning
CASE 重建 ≠ 重新扫码入网
IPv6 地址变化 ≠ Matter Node 身份变化
```

只有凭据被清除、Fabric 被移除、网络资料失效或设备恢复出厂等情况，才可能需要重新走完整 commissioning。

### Zigbee

设备如果保留网络参数和安全材料，可以通过 Rejoin 或恢复父子关系重新接入。Rejoin 与 Factory New 设备的首次 Network Steering 不是同一条路径。

```text
Zigbee Rejoin ≠ 首次 Network Steering
父节点变化 ≠ EUI-64 身份变化
短地址变化 ≠ 换了一台物理设备
```

具体 Rejoin 安全条件仍取决于网络和 BDB 策略。

## 第 12 章：Matter 这样设计，究竟比 Zigbee 好在哪里？

不能用“步骤更多”直接推出“协议更安全”，也不能用“步骤更少”直接推出“体验更好”。更公平的比较是看两边选择解决什么问题，以及复杂度放在哪里。

### Matter over Thread 的主要设计收益

- 把低功耗 IP 网络与 Matter 应用身份分开；
- 把初始配网秘密与长期运行证书分开；
- 定义设备认证和产品身份验证流程；
- 使用 Fabric、Node 身份和访问控制管理权限；
- 允许同一应用协议运行在 Thread、Wi-Fi 和 Ethernet 等 IP 承载上；
- Thread Border Router 不需要翻译 Matter 应用数据；
- 每个阶段都有相对清晰的成功边界。

### Matter over Thread 付出的成本

- 角色、凭据和状态更多；
- 需要从 Bluetooth LE 临时通道切换到 Thread/IP；
- 要处理 PASE、Attestation、证书、CASE 和访问控制；
- Border Router、DNS-SD 或 IPv6 路径问题也会影响 commissioning；
- 日志里会出现更多“部分成功”状态。

### 经典 Zigbee 架构的主要特点

- 网络、安全和应用模型在同一套协议体系中；
- 典型网关架构下，首次加入链路比较集中；
- Coordinator、Trust Center 和应用管理经常由同一网关统一提供；
- 低功耗 Mesh、Cluster、Binding 和 Reporting 形成成熟体系；
- 跨 IP 网络或跨 Matter 生态时，通常由网关或 Bridge 终止两边协议并做应用语义转换。

### Zigbee 的复杂度并没有消失

Zigbee 用户界面可能只显示“正在搜索设备”，但底层仍可能经历：

- 多信道扫描；
- 父节点选择；
- Association；
- Trust Center 准入；
- Transport Key；
- Network Key 安装；
- Frame Counter 与 Key Sequence 管理；
- TCLK 相关流程；
- Descriptor 查询；
- Binding 与 Reporting。

很多复杂度被网关集中处理，不代表它不存在。

## 第 13 章：如果把每个 Matter 步骤删掉，会失去什么？

| 被删掉的步骤 | 直接失去的能力 |
|---|---|
| Commissioning Window | 难以把用户意图与本次入网尝试绑定 |
| QR / Manual Code | 缺少目标筛选和设备初始秘密 |
| Bluetooth LE 临时通道 | 未加入 Thread 的普通设备难以直接从手机获得网络资料 |
| PASE | 缺少基于 Setup Passcode 的临时安全会话 |
| Device Attestation | 难以标准化验证设备认证身份和产品声明 |
| CSR / NOC | 缺少设备独有的 Matter Fabric 运行身份 |
| Thread Dataset | 设备不知道怎样加入目标 Thread 网络 |
| Operational Discovery | Controller 难以找到设备当前正式 IP 地址和端口 |
| CASE | 缺少基于 Fabric 证书的长期单播安全会话 |
| CommissioningComplete | 难以安全确认并结束本次配置，Fail-safe 无法正常闭环 |
| Subscribe | 平台可能无法持续获得门状态变化 |

这张表也回答了开篇问题：Matter over Thread 的长流程并不是围绕一个“无线连接”问题反复加步骤，而是连续解决不同问题。

## 第 14 章：用两个故障练习检查是否真的看懂

### 故障一：Matter 设备已经成为 Thread Child，但 App 最后超时

已经证明：

- 设备找到了 Thread 网络；
- Parent-Child 关系已经建立；
- Thread Attach 至少进展到网络层成功附近。

还要继续检查：

1. 设备是否发布或代理了运行态发现信息；
2. Commissioner 是否完成 Operational Discovery；
3. CASE 是否建立；
4. CommissioningComplete 是否成功；
5. 后续 Read、Subscribe 和 Report 是否出现。

不能因为 Thread Attached 就直接修改应用 Cluster，也不能把超时一概归因于射频。

### 故障二：Zigbee 门磁已经获得短地址，但网关没有显示设备

已经证明：

- Association 至少进展到地址分配；
- 设备与父节点之间有基本链路。

还要继续检查：

1. Transport Key 是否到达接收端；
2. 设备是否成功验证并安装 Network Key；
3. 是否开始受保护的 NWK 通信；
4. BDB 和目标 TCLK 流程是否完成；
5. Device Announcement 和 Descriptor 查询是否成功；
6. Reporting 是否正确配置。

不能把 MAC ACK、Association Response 或短地址当成完整业务成功。

## 一张最终时间线

```text
Matter over Thread

用户打开配网
  -> 扫码获得引导信息
  -> 发现并连接 BLE 设备
  -> PASE 临时安全会话
  -> Fail-safe 与基础配置
  -> Device Attestation
  -> CSR / NOC / Fabric 身份
  -> 配置 Thread Dataset
  -> Thread Attach
  -> Operational Discovery
  -> CASE 正式安全会话
  -> CommissioningComplete
  -> 读取设备能力并建立 Subscribe
  -> 门磁业务可用
```

```text
经典 Zigbee 集中式首次加入

网关打开 Permit Join
  -> 设备启动 Network Steering
  -> 扫描信道与 Beacon
  -> 选择网络和父节点
  -> Association
  -> 获得短地址
  -> Trust Center 安全准入
  -> 接收并安装 Network Key
  -> 受保护的 Zigbee 通信
  -> Device Announcement
  -> TCLK / BDB 相应流程
  -> Descriptor / Cluster 识别
  -> Binding / Reporting
  -> 门磁业务可用
```

## 最后只记住三句话

> Thread 解决设备怎样接入低功耗 IPv6 网络。

> Matter 解决设备是谁、属于哪个信任域、谁能控制它，以及怎样表达设备能力。

> Zigbee 使用另一套更集中的网络、安全和应用体系完成相似的产品目标。

Matter over Thread 不是简单地把 Zigbee 的一次入网拆成更多消息。它把网络接入、初始秘密、产品身份、长期 Fabric 身份、正式安全会话和应用权限分别建模。

它的优势来自这种拆分，它的复杂度也来自这种拆分。

## 术语速查

| 术语 | 所属体系 | 一句话解释 |
|---|---|---|
| Commissioning | Matter | 把设备安全登记进 Fabric 并配置运行网络的完整过程 |
| Commissioner | Matter | 负责办理 commissioning 的一方 |
| Commissionee | Matter | 正在被 commissioning 的设备 |
| Fabric | Matter | 共享运行信任根和管理关系的 Matter 信任域 |
| PASE | Matter | 基于 Setup Passcode 的初始安全会话 |
| Device Attestation | Matter | 验证设备认证身份、签名和产品声明的流程 |
| DAC / PAI / PAA | Matter | 从设备证书到信任根的认证链角色 |
| CSR | Matter | 设备为运行证书提交的签名请求 |
| NOC | Matter | Matter Node 在某个 Fabric 中的运行证书 |
| CASE | Matter | 基于 Fabric 运行凭据的正式单播安全会话 |
| Operational Discovery | Matter | 在正式 IP 网络中解析已入网 Node 的地址和端口 |
| Active Operational Dataset | Thread | 描述 Thread 网络参数和安全材料的配置集合 |
| MLE Attach | Thread | 发现 Parent 并建立 Thread 邻居关系的过程 |
| Border Router | Thread | 在 Thread 与相邻 IP 网络之间转发数据 |
| Permit Join | Zigbee | 网络暂时允许新设备申请加入 |
| Network Steering | Zigbee | 设备寻找并尝试加入合适网络的 BDB 方法 |
| Association | IEEE 802.15.4 / Zigbee 路径 | 建立网络成员和父子关系的 MAC 服务 |
| Network Key | Zigbee | 保护 Zigbee NWK 层通信的网络共享密钥 |
| TCLK | Zigbee | 设备与 Trust Center 之间的 Link Key |
| Device Announcement | Zigbee | 设备向网络公告地址映射等信息 |
| Reporting | Zigbee | 按条件或周期报告属性变化 |

## 继续阅读与资料来源

站内延伸：

- [Matter 基础概念：Node、Fabric、Endpoint 与安全会话](/posts/matter-foundations/)
- [Thread 基础概念：IPv6 Mesh、设备角色与 Border Router](/posts/thread-foundations/)
- [Matter 与 Zigbee 关系映射：相似名词不等于相同协议](/posts/matter-zigbee-concept-mapping/)
- [Zigbee 入网流程：从 Network Steering 到可用设备](/posts/zigbee-network-joining-flow/)
- [Zigbee 各类 Key 的作用范围](/posts/zigbee-security-key-scope/)

公开技术资料：

- [CSA 规范下载入口](https://csa-iot.org/developer-resource/specifications-download-request/)
- [Matter 官方开源 SDK：CHIP Tool Commissioning Guide](https://project-chip.github.io/connectedhomeip-doc/development_controllers/chip-tool/chip_tool_guide.html)
- [Matter SDK Access Control Guide](https://project-chip.github.io/connectedhomeip-doc/guides/access-control-guide.html)
- [OpenThread：Network Discovery and Formation](https://openthread.io/guides/thread-primer/network-discovery)
- [OpenThread：Node Roles and Types](https://openthread.io/guides/thread-primer/node-roles-and-types)
- [Thread Group：Border Router 的职责](https://threadgroup.org/Newsroom/Blog/what-is-a-thread-border-router-and-how-is-it-different-from-a-hub-or-a-bridge)
- [CSA Zigbee Specification](https://csa-iot.org/wp-content/uploads/2023/04/05-3474-23-csg-zigbee-specification-compressed.pdf)

本文描述的是便于理解的高层主线，不替代目标版本的 Matter Core、Thread、Zigbee Core、BDB 与生态实现要求。认证、量产和故障定责还应结合目标版本规范、设备日志、Controller 或网关日志与抓包证据。
