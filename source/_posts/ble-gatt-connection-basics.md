---
title: BLE GATT 入门：手机连上设备后，到底发生了什么？
date: 2026-08-02 15:00:00
categories:
  - 无线协议
tags:
  - Bluetooth LE
  - BLE
  - GATT
  - ATT
  - 入门
---

打开一个蓝牙调试工具，点下 Connect，页面很快显示“Connected”。这是不是说明手机已经能读到设备数据，也能正常控制设备了？

不一定。

**BLE 连接成功，只表示两台设备已经建立了一条无线链路。** 后面通常还要发现 Service、找到 Characteristic、确认读写方式、订阅通知，应用数据才真正开始流动。

<!-- more -->

本文不从复杂的协议分层开始，而是跟着一台简单的 BLE 温度计，看清手机从“发现设备”到“收到温度变化”之间发生了什么。

读完后，你应该能够回答三个问题：

1. Service、Characteristic 和 Descriptor 分别是什么？
2. BLE 显示 Connected 后，手机为什么还要继续发现和订阅？
3. 怎样判断问题卡在连接、GATT，还是设备自己的业务协议？

## 先看结论：一次常见的 BLE 通信过程

先不管每个名词的精确定义，只看一条最常见的时间线：

```text
温度计发送广播
  ↓
手机扫描并发现温度计
  ↓
手机发起连接
  ↓
BLE 链路建立：Connected
  ↓
双方可能进行配对、加密和 MTU 交换
  ↓
手机发现设备提供的 Service
  ↓
手机发现 Service 里的 Characteristic 和 Descriptor
  ↓
手机读取数据、写入命令，或者订阅通知
  ↓
温度变化时，设备主动向手机发送新值
```

这里最容易混淆的是中间那条线：

```text
建立 BLE 连接 ≠ 已经找到 GATT 服务 ≠ 已经订阅数据 ≠ 业务功能正常
```

每一步成功，都只能证明这一小步已经完成。

## 连接前：广播和扫描是在做什么？

BLE 设备在没有连接时，可以周期性发送很短的广播数据。广播通常可能包含：

- 设备名称；
- 设备地址或身份相关信息；
- 某些重要 Service 的 UUID；
- 厂商自定义数据；
- 设备是否允许连接等信息。

温度计不断发送广播，就像它在说：

> “我在这里，我叫客厅温度计，现在可以连接。”

手机进行扫描，是在附近收听这些广播。收到广播，只证明手机“看见”了设备，并不代表双方已经连接。

当手机决定连接时，它会向目标设备发起连接请求。连接建立后，双方按照约定的时间间隔交换无线数据。此时调试工具通常会显示 Connected。

### 三组角色不要混在一起

BLE 中会遇到几组看起来相似的角色：

| 所处阶段 | 角色 | 简单理解 |
|---|---|---|
| 广播阶段 | Advertiser / Scanner | 一个发送广播，一个扫描广播 |
| 连接阶段 | Peripheral / Central | 一个接受连接，一个发起连接 |
| GATT 阶段 | Server / Client | 一个提供数据，一个访问数据 |

在常见的手机连接传感器场景中：

- 手机通常是 Central，也是 GATT Client；
- 传感器通常是 Peripheral，也是 GATT Server。

但这只是常见组合，不是强制绑定。Central 不一定永远是 GATT Client，Peripheral 也不一定永远是 GATT Server。

## 连接后：GATT 像一组整理好的资料柜

连接只解决“怎样把数据送到对方”。设备究竟提供哪些数据、哪些可以读取、哪些可以写入，则主要由 GATT 描述。

可以把一台 GATT Server 想成一个资料柜：

```text
GATT Server
├── Service：电池
│   └── Characteristic：当前电量
├── Service：设备信息
│   ├── Characteristic：厂商名称
│   └── Characteristic：固件版本
└── Service：温度计功能
    ├── Characteristic：当前温度
    └── Characteristic：测量间隔
```

Service、Characteristic 和 Descriptor，就是整理这个资料柜的三种基本结构。

### Service：一组相关功能

Service 用来把同一类功能放在一起，可以先把它理解成一个文件夹。

常见的标准 Service 有：

| Service | 用途 |
|---|---|
| Generic Access | 设备名称、外观等基础访问数据 |
| Generic Attribute | GATT 数据库自身发生变化时的相关能力 |
| Device Information | 厂商、型号、序列号、固件版本等设备信息 |
| Battery Service | 电池电量和电池状态 |

设备也可以定义自己的 Service。例如，一台温度计可以使用自定义 Service 表达测量结果和设置项。

### Characteristic：真正要读写的数据项

Characteristic 是 Service 中具体的数据项。它通常包含：

- UUID：这是什么类型的数据；
- Value：当前数据值；
- Properties：允许怎样操作，例如 Read、Write、Notify；
- Descriptor：对这个数据项的补充说明或配置。

Properties 回答“支持什么操作”，Permissions 则回答“满足什么安全条件才允许操作”。所以，一个 Characteristic 即使带有 Read 属性，也可能要求链路先加密才能读取。

例如，标准 Battery Service 的 UUID 是 `0x180F`，其中 Battery Level Characteristic 的 UUID 是 `0x2A19`。如果它当前的 Value 是十进制 `83`，就表示剩余电量为 83%。

```text
Battery Service（0x180F）
└── Battery Level Characteristic（0x2A19）
    ├── Value：83
    ├── Properties：Read、Notify
    └── Descriptor：通知开关
```

标准功能通常使用 Bluetooth SIG 分配的 UUID。产品自己的功能则常使用 128-bit 自定义 UUID。

### Descriptor：Characteristic 的补充信息和开关

Descriptor 属于某个 Characteristic，可以描述数据格式，也可以控制它的行为。

初学者最常见的是 Client Characteristic Configuration Descriptor，通常简称 **CCCD**，UUID 为 `0x2902`。

如果一个 Characteristic 支持 Notify 或 Indicate，Client 通常要先写入 CCCD，告诉 Server：

> “这个数据变化时，请主动发给我。”

因此，看见 Characteristic 支持 Notify，不等于手机已经能收到通知。**支持通知是一种能力，写入 CCCD 才是实际订阅。**

## UUID 和 Handle 有什么区别？

调试工具里经常同时显示 UUID 和 Handle，它们不是一回事。

| 名称 | 用途 | 类比 |
|---|---|---|
| UUID | 说明这个 Attribute 是什么类型 | 资料名称 |
| Handle | 指向当前 GATT 数据库中的具体条目 | 资料柜里的编号 |

同一种标准 Characteristic 在不同设备上可以使用相同 UUID，但它在各自数据库里的 Handle 不一定相同。

应用通常先通过 UUID 发现目标，再使用发现到的 Handle 访问它。不要因为某次连接中 Handle 是 `0x0012`，就假设所有设备和所有固件版本都永远相同。

## Read、Write、Notify 和 Indicate

找到 Characteristic 后，双方常用下面几种方式交换数据：

| 操作 | 谁先发起 | 简单理解 |
|---|---|---|
| Read | Client | “把现在的值告诉我” |
| Write | Client | “请把这个值改成我发送的内容”，并等待 GATT 层响应 |
| Write Without Response | Client | “快速写入这个内容”，不等待对应的 GATT 写响应 |
| Notify | Server | “数据变了，我主动告诉你”，不要求 ATT 层确认 |
| Indicate | Server | “数据变了，我主动告诉你”，要求 Client 在 ATT 层确认 |

假设温度计每次变化都要上报：

1. 手机发现温度 Characteristic；
2. 手机写入它的 CCCD，开启 Notify；
3. 温度从 24.1°C 变为 24.3°C；
4. 设备发送 Notification；
5. 手机收到新值并更新页面。

如果第 2 步没有完成，设备即使一直在测温，手机也可能什么都收不到。

Notify 没有 ATT 层的逐条确认，Indicate 则有。这里说的是 GATT/ATT 这一层，不表示底层无线链路完全没有校验或重传。

## ATT 又是什么？它和 GATT 有什么关系？

可以先记住一句话：

> GATT 负责把数据组织成 Service、Characteristic 和 Descriptor；ATT 负责发现、读取、写入和传送这些 Attribute。

如果 GATT 像餐厅菜单，ATT 就像点单和上菜时使用的规则：

- 菜单怎样分组、一道菜叫什么，由 GATT 描述；
- “读取这个值”“写入那个值”“这个值变化了”等消息怎样发送，由 ATT 处理。

开发时经常直接使用平台提供的 GATT API，不需要手工拼每一个 ATT 数据包。但抓包、看日志或定位超时时，ATT Read、Write、Notification、MTU Exchange 等名字就会出现。

## MTU：一次 ATT 消息能装多少

MTU 可以先理解成“一次允许携带多大的包裹”。BLE 的默认 ATT MTU 是 23 字节，但这 23 字节还包含 ATT 自己的字段，并不全是应用数据。

连接后，Client 和 Server 可以交换各自支持的 MTU，最终使用双方都能接受的大小。更大的 MTU 通常能让较长数据减少拆分，但需要注意：

- MTU 交换成功，不代表 Service 已经发现；
- MTU 更大，不代表通知已经订阅；
- MTU 更大，也不保证业务一定更快；
- 真正能放入的 Characteristic Value 通常小于 ATT MTU。

初学阶段不用急着计算每一层开销。先把 MTU 当成连接建立后可能进行的一项“传输能力协商”即可。

## 配对、绑定和加密是不是每次都有？

不一定。

有些 Characteristic 允许连接后直接读取；有些数据要求链路加密，甚至要求经过身份验证。此时双方可能进行配对，生成安全密钥并启用加密。

- Pairing：协商安全能力并生成密钥；
- Bonding：把密钥保存下来，方便以后重连；
- Encryption：使用密钥保护当前链路中的数据。

它们有关联，但不是同义词。**BLE Connected 也不自动等于已经配对、已经绑定或已经加密。**

如果读取某个 Characteristic 时提示权限或认证错误，应检查它的访问权限和当前安全级别，而不是只看连接状态。

## 从连接到收到数据，逐步证明了什么？

下面这张表很适合在调试时使用：

| 看到的现象 | 能证明什么 | 还不能证明什么 |
|---|---|---|
| 扫描到设备 | 广播可被接收，手机能发现它 | 可以建立连接 |
| Connected | BLE 链路已经建立 | GATT Service 正常、业务正常 |
| MTU Exchange 完成 | 双方协商了 ATT 消息大小 | Service 已发现、吞吐一定更高 |
| 找到目标 Service | GATT Client 发现了这组功能 | 目标 Characteristic 可正常使用 |
| 找到 Characteristic | UUID 和 Handle 已发现 | 权限满足、数据格式正确 |
| CCCD 已写为开启值 | Client 已请求 Notify 或 Indicate | Server 一定会产生业务数据 |
| 收到第一条 Notification | Server 到 Client 的这条数据路径已跑通 | 所有命令、异常和重连都正常 |
| 一次完整且被正确解析的读写成功 | 本次操作的业务格式和方向基本正确 | 长时间稳定性和所有边界情况正常 |

所以，“连接上了但不能用”并不矛盾。它只是说明故障范围已经从广播和连接阶段，缩小到了后续阶段。

## 初学者最容易遇到的五个误区

### 误区一：广播里有 Service UUID，连接后就一定能用

广播中的 Service UUID 主要帮助扫描端识别设备。真正的 Service、Characteristic、权限和数据仍要在连接后通过 GATT 访问。

### 误区二：能 Read，就一定能 Notify

Read 和 Notify 是不同能力。Notify 还需要 Client 完成订阅，Server 也要在合适时机主动发送数据。

### 误区三：Notify 和 Indicate 完全一样

两者都由 Server 主动发送，但 Indicate 要求 ATT 层确认，Notify 不要求。具体选择要看实时性、流量和可靠性需求。

### 误区四：UUID 就是数据内容

UUID 只说明数据类型，真正内容在 Value 中。Value 往往是一串字节，还要按照该 Characteristic 的格式解释。

### 误区五：MTU 越大，速度一定越快

MTU 只是影响一次 ATT 消息可以携带的大小。实际速度还受到连接间隔、PHY、数据长度、设备处理速度和应用交互方式等因素影响。

## 最简单的动手顺序

准备一台支持 BLE 的设备和一个能够查看 GATT 的调试工具，然后只做下面几步：

1. 扫描设备，观察名称、信号强度和广播内容；
2. 建立连接，确认 Connected；
3. 展开 Service 列表，先找 Device Information 和 Battery Service；
4. 查看 Characteristic 的 UUID、Properties 和 Value；
5. 对允许 Read 的 Characteristic 执行一次读取；
6. 对允许 Notify 的 Characteristic 开启订阅，观察 CCCD 和后续数据；
7. 断开再连接一次，观察哪些步骤需要重新执行。

不要随意向含义未知的 Characteristic 写入数据。它可能代表重启、清空数据、进入升级模式或其他控制命令。

第一次动手的目标不是记住所有 UUID，而是建立一条判断链：

```text
能扫描到吗？
  -> 能连接吗？
  -> 能发现目标 Service 吗？
  -> 能找到目标 Characteristic 吗？
  -> 权限和安全条件满足吗？
  -> CCCD 订阅成功吗？
  -> 第一条读、写或通知出现了吗？
```

## 一页小抄

| 名词 | 一句话理解 |
|---|---|
| Advertising | 设备在连接前发送“我在这里”等信息 |
| Scanning | 手机收听附近广播 |
| Connection | 双方建立可持续交换数据的 BLE 链路 |
| GATT Server | 保存并提供 GATT 数据库的一方 |
| GATT Client | 发现、读取、写入和订阅数据的一方 |
| Service | 一组相关功能 |
| Characteristic | 一个具体数据项及其操作方式 |
| Descriptor | Characteristic 的补充说明或配置 |
| UUID | Attribute 的类型标识 |
| Handle | GATT 数据库中具体条目的编号 |
| CCCD | Client 用来开启或关闭 Notify、Indicate 的配置项 |
| ATT | 操作和传送 Attribute 的底层协议 |
| MTU | 单个 ATT PDU 允许的最大尺寸 |

## 最后再看一次完整过程

一台 BLE 设备“真正可用”，通常不是一个瞬间，而是一串连续的小成功：

```text
广播可见
  -> 连接建立
  -> 安全条件满足
  -> 如有需要，完成 MTU 等传输参数协商
  -> Service / Characteristic / Descriptor 被发现
  -> Read、Write 或 CCCD 订阅完成
  -> 第一条业务数据成功传输
```

以后再看到“BLE 已连接但没有数据”，不要把所有问题都叫作“连接失败”。沿着这条时间线向下检查，很快就能知道自己是在找不到服务、订阅没有完成，还是业务命令根本没有开始。

## 参考资料

- [Bluetooth SIG：Bluetooth Low Energy Primer](https://www.bluetooth.com/bluetooth-le-primer/)
- [Bluetooth SIG：Generic Attribute Profile](https://www.bluetooth.com/wp-content/uploads/Files/Specification/HTML/Core-61/out/en/host/generic-attribute-profile--gatt-.html)
- [Bluetooth SIG：Battery Service 1.1](https://www.bluetooth.com/specifications/specs/battery-service/)
- [Zephyr：Generic Attribute Profile 文档](https://docs.zephyrproject.org/latest/services/connectivity/bluetooth/api/gatt.html)
- [Zephyr：MTU Update 示例](https://docs.zephyrproject.org/latest/samples/bluetooth/mtu_update/README.html)
