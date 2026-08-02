---
title: Telink Matter SDK 入门：Zephyr、Matter 与底层库怎样组成一个固件？
date: 2026-08-02 23:55:00
categories:
  - 搭建教程
tags:
  - Telink
  - Zephyr
  - Matter
  - west
  - CMake
  - 固件构建
---

第一次接触 Telink Matter SDK 时，很容易产生一个疑问：Zephyr 在一个仓库，Matter 在另一个仓库，底下还有 HAL、OpenThread 和一些静态库，执行一次 `west build` 后，它们怎么就变成了一个固件？

先记住最重要的结论：

> **通常不是先生成一个 Zephyr 固件和一个 Matter 固件，再把两个 BIN 拼起来。Matter、Zephyr、应用和芯片底层会先分别编译成许多目标文件或静态库，最后由链接器装进同一个 `zephyr.elf`，再转换成 `zephyr.bin`。**

<!-- more -->

如果启用了 MCUboot、签名或出厂数据，后面还会有一次镜像签名或按 Flash 地址合并。那属于“固件打包”，不是把 Zephyr 和 Matter 两套程序硬拼在一起。

本文以公开的 Telink、Zephyr 和 Matter 仓库为线索，不要求读者先懂 CMake、Kconfig 或链接器。读完后，你应该能回答：

1. 每个仓库分别负责什么？
2. `west build` 到底调用了谁？
3. Zephyr 在哪里进入 Telink 的底层 API？
4. `zephyr.elf`、`zephyr.bin` 和 `merged.bin` 有什么区别？

## 先认识几位参与者

可以把一次固件构建想成盖房子：

| 组成部分 | 主要职责 | 类比 |
|---|---|---|
| 产品应用 | 按键、传感器、状态机和产品逻辑 | 房屋的使用需求 |
| Matter | 配网、设备模型、Cluster 和安全通信 | 智能家居的通用规则 |
| Zephyr | 线程、定时器、内存、日志、驱动框架和构建系统 | 施工组织与基础设施 |
| OpenThread | Thread 网络协议 | 通往外界的道路系统 |
| Telink 驱动与 HAL | 把通用接口落到具体芯片外设和射频 | 真正操作机器的工人 |
| 工具链 | 编译、链接并转换文件格式 | 加工与装配设备 |

这些部分不是彼此独立运行的几个固件。它们更像不同来源的零件，最后被装进同一个可执行程序。

下面的仓库与文件关系核对时间为 2026 年 8 月 2 日。公开开发环境里，常见结构可以简化为：

```text
Zephyr workspace
├── zephyr/                       # RTOS、驱动框架、west manifest
├── modules/hal/telink/           # Telink HAL、适配层和底层依赖
├── modules/lib/openthread/       # OpenThread
├── modules/lib/openthread_telink_lib/  # 某些配置使用的 Telink OpenThread 库
└── matter/                       # connectedhomeip，Matter SDK 与示例应用
```

实际目录名会随 SDK 版本变化，但角色基本不变。`west.yml` 像一张依赖清单：它记录要取哪些仓库、放在哪个目录、固定到哪个 revision。Telink 官方环境准备流程中的 `west update` 和 `west blobs fetch hal_telink`，就是根据工作区描述取回源码模块和 HAL 所需内容。

## 从一条命令开始

Telink 的公开 Matter 示例通常从类似命令开始：

```bash
source scripts/activate.sh
west build -b <board> -- -DFLASH_SIZE=<size>
```

表面上只运行了 `west`，背后大致会经过这条链：

```text
west build
  ↓
CMake 配置应用和 Zephyr
  ├── 读取 CMakeLists.txt
  ├── 合并 prj.conf / Kconfig
  ├── 解析 board 与 Devicetree overlay
  └── 生成 Ninja 构建规则
  ↓
GN + Ninja 编译 Matter 库
  ↓
Ninja 编译应用、Zephyr、OpenThread、驱动和 HAL
  ↓
链接为 build/zephyr/zephyr.elf
  ↓
objcopy 转换为 build/zephyr/zephyr.bin
  ↓
按配置执行签名、OTA 或多镜像合并
```

下面逐步拆开看。

## 第一步：应用把构建入口交给 Zephyr

以公开的 Matter Telink 示例为例，应用目录里通常能看到：

```text
telink/
├── CMakeLists.txt
├── prj.conf
├── boards/
├── src/
└── *.zap 或其他数据模型文件
```

这些文件分别回答不同问题：

- `CMakeLists.txt`：哪些源码要参与编译，还要加载哪些构建模块；
- `prj.conf`：要打开哪些 Zephyr、Matter、网络和驱动功能；
- board 与 overlay：芯片、内存、GPIO、UART、Flash 分区等硬件描述；
- ZAP 或数据模型文件：Matter Endpoint、Cluster、Attribute 和 Command；
- `src/`：应用自己的 C/C++ 代码。

Matter 示例的 Telink `common.cmake` 会整理配置和 overlay，然后把 `config/telink/chip-module` 加入 `ZEPHYR_EXTRA_MODULES`，最后调用 `find_package(Zephyr ...)`。这一步可以简单理解为：

> “这是一个 Matter 应用，但请使用 Zephyr 的规则来组织整次构建。”

## 第二步：Kconfig 和 Devicetree 决定“编什么”和“硬件在哪”

初学者经常把 `prj.conf` 和 Devicetree 混在一起，可以先这样区分：

- **Kconfig / `prj.conf` 决定要不要某个功能。** 例如是否启用 Bluetooth、OpenThread、日志或 MCUboot。
- **Devicetree 决定硬件是什么、地址在哪、引脚怎样接。** 例如某个 UART、GPIO 或 Flash 分区的位置。

CMake 配置阶段会把这些输入转换成后续编译能使用的结果，例如：

```text
build/zephyr/.config          # 最终生效的 Kconfig
build/zephyr/zephyr.dts       # 最终合并后的硬件描述
build/zephyr/include/generated/...  # 生成的配置头文件
```

所以，改了 `prj.conf` 或 overlay 后，变化并不是运行时才被“读取”，而是在编译前就决定哪些代码存在、使用哪些地址和参数。

## 第三步：Matter 为什么使用 GN，又怎样回到 Zephyr？

Matter SDK 本身大量使用 GN + Ninja，Zephyr 则主要使用 CMake。Telink 没有要求初学者手工运行两套互不相干的构建，而是在 `config/telink/chip-module` 中搭了一座桥。

这座桥主要做三件事：

1. 把 Zephyr 的编译器、编译选项和 Kconfig 结果转换为 Matter GN 参数；
2. 通过 CMake `ExternalProject` 调用 GN 和 Ninja 编译 Matter；
3. 把生成的 Matter 静态库加入 Zephyr 最终链接。

因此，中间过程虽然能看到 CMake、GN 和两次 Ninja，但最终目标仍然是同一个应用镜像：

```text
Matter 源码
  -> GN 生成规则
  -> Matter 静态库 ───────────┐
                              │
应用源码 -> 目标文件 ─────────┤
Zephyr   -> 内核与子系统库 ───┼─> zephyr.elf
OpenThread -> 网络协议库 ──────┤
Telink HAL -> 驱动/底层库 ─────┘
```

这里的“静态库”可以先理解成装有很多已编译零件的盒子。链接器会从盒子中取出当前程序真正引用的部分，并解析函数之间的调用关系。

## 第四步：Zephyr 在哪里调用 Telink 底层？

上层应用通常调用的是通用 API，例如 Flash、Bluetooth 或 IEEE 802.15.4 API。Zephyr 的 Telink 驱动负责把这些通用动作翻译成具体芯片函数。

最值得看的不是所有源码，而是下面三条代表性调用链。

### 例一：读写 Flash

```text
应用 / Settings / 存储模块
  ↓ Zephyr Flash API
zephyr/drivers/flash/soc_flash_tlx.c
  ↓
flash_read_page()
flash_write_page()
flash_erase_sector()
  ↓
Telink HAL / 芯片 Flash 驱动
```

`soc_flash_tlx.c` 最后注册的是 Zephyr `flash_driver_api`，但函数内部已经在调用 Telink 的 `flash_*` API。也就是说，上层看到统一的 Zephyr 接口，底层执行的是 Telink 芯片操作。

### 例二：BLE Host 怎样进入 Telink Controller

```text
Matter commissioning / Zephyr Bluetooth Host
  ↓ HCI 命令和数据
zephyr/drivers/bluetooth/hci/hci_tlx.c
  ↓
tlx_bt_controller_init()
tlx_bt_host_send_packet()
  ↓
Telink BLE Controller 与射频底层
```

反方向收到 HCI Event 或 ACL 数据时，Telink 适配层会把数据送回 Zephyr 的 `bt_recv()`。所以这条链是双向的：Zephyr Host 向下发命令，Controller 向上交事件。

这也解释了一个常见现象：应用和 GATT 代码可能都在 Matter/Zephyr 上层，但 BLE Controller 的核心实现未必位于同一个源码目录。

### 例三：OpenThread 怎样使用 Telink 2.4 GHz 射频

```text
Matter
  ↓
OpenThread
  ↓ Zephyr IEEE 802.15.4 Radio API
zephyr/drivers/ieee802154/ieee802154_tlx.c
  ↓
rf_set_chn()
rf_set_rxmode()
rf_set_txmode()
rf_tx_pkt()
  ↓
Telink RF / DMA / IRQ 底层
```

OpenThread 负责 Thread 协议，但它不会自己操作 Telink 的射频寄存器。Zephyr 的 IEEE 802.15.4 驱动实现标准 Radio API，再调用 Telink 的 RF、DMA、定时器和中断接口。

把三条链放在一起，就能看到稳定的分层：

```text
产品 / Matter / OpenThread
        ↓ 通用接口
Zephyr 子系统和 driver API
        ↓ 芯片适配
Telink Zephyr driver
        ↓ 厂商 API
Telink HAL、驱动源码或静态库
        ↓
芯片外设与射频
```

## “底下还有个库”到底是哪一个？

这个记忆很可能是对的，但要区分两类库。

### Telink HAL 与 BLE/芯片底层库

Zephyr 的 manifest 会把 `hal_telink` 放到 `modules/hal/telink`。较新的公开 HAL 结构中，`hal_v2` 还会获取 Telink 的公开 `tl_ble_sdk` 仓库，并针对目标 SoC 链接对应的静态库。

以 TL323X 为例，公开文件中可以看到两种容易遇到的命名：

- 原始 SDK 的 `proj_lib/liblt_TL323X.a`；
- Zephyr 集成流程中的 `lib_zephyr_tl323x.a`。

具体名字和生成方式会随分支、SDK 发布版发生变化，不要只靠文件名判断版本。更可靠的方法是查看当前 `hal_telink` 的 `CMakeLists.txt`、实际链接命令和最终 map 文件。

同时也不要把 `.a` 理解成“整个底层只有一个黑盒”。公开 `tl_ble_sdk` 中还能看到 GPIO、Flash、UART、I2C 等驱动源码和头文件；某些协议栈、控制器或优化实现则可能以静态库参与链接。**仓库可以公开下载，不等于其中每个库都有完整可读源码，也不自动代表所有内容使用同一种开源许可。**

### 可选的 OpenThread Telink 库

`openthread_telink_lib` 是另一件东西。它公开提供 OpenThread 头文件以及类似下面的库：

```text
libopenthread-ftd-extended.a
libopenthread-ftd-reduced.a
```

只有相应 Kconfig 选项开启时，模块的 CMake 才会选择并链接它。它解决的是 OpenThread 库实现选择，不是 BLE Controller 库，也不等于 Telink 全部 HAL。

因此，当日志或 map 文件里看到一个 `.a`，先问三个问题：

1. 它是芯片驱动/BLE Controller，还是 OpenThread？
2. 是当前配置主动选择的，还是只存在于工作区但没有参与链接？
3. 它有哪些公开头文件和源码，哪些实现只有二进制？

## 第五步：链接器怎样变出一个完整程序？

编译器通常一次只编译一个源码文件，产生许多 `.o` 目标文件；Matter、Zephyr、OpenThread 和 HAL 也可能先整理成多个 `.a` 静态库。

链接阶段会：

- 找到 `main` 和系统启动入口；
- 解析一个函数对另一个函数的引用；
- 按 linker script 安排代码、只读数据、RAM 数据和保留区；
- 丢弃没有被使用的部分；
- 生成带符号和段信息的 `zephyr.elf`。

所以“完整固件”的第一次成形发生在链接阶段，而不是最后复制 BIN 时。

想确认某个底层函数有没有真的进入固件，可以查看：

```text
build/zephyr/zephyr.map
build/zephyr/zephyr.elf
```

map 文件适合追踪“某个符号来自哪个 `.o` 或 `.a`”；ELF 则可以配合 `nm`、`readelf`、`objdump` 和调试器继续分析。

## 第六步：ELF、BIN 和 merged.bin 有什么区别？

常见产物可以这样理解：

| 文件 | 主要用途 |
|---|---|
| `zephyr.elf` | 包含代码、数据、地址和调试符号，适合调试与分析 |
| `zephyr.bin` | 从 ELF 中提取出的原始二进制，常用于烧录 |
| `zephyr.map` | 记录内存布局、符号和来源，适合查大小与调用来源 |
| `merged.bin` | Telink 后处理得到的最终入口文件；内容取决于配置 |

公开的 Telink `process_binaries.py` 中，如果当前配置没有额外镜像需要合并，`merged.bin` 可以只是指向 `zephyr.bin` 的链接。启用不同功能后，它也可能负责：

- 把 MCUboot 与签名后的应用放到各自 Flash offset；
- 合入出厂数据分区；
- 生成 OTA 或 DFU 需要的文件。

因此，看到 `merged.bin` 不能立刻推断它一定包含多个镜像；看到只有一个 `zephyr.bin`，也不能推断它内部只有 Zephyr。Matter、OpenThread 和应用通常早已在 ELF 链接阶段进入其中。

## 一个最实用的排查顺序

如果想亲手确认构建过程，不必一开始读遍所有仓库。按下面顺序就够了：

1. 看应用 `CMakeLists.txt`、`prj.conf` 和 board overlay，确认构建入口；
2. 看 `build/zephyr/.config` 与 `zephyr.dts`，确认最终配置；
3. 在构建日志或 `build.ninja` 中找 `chip-gn`，确认 Matter 子构建；
4. 在 `zephyr.map` 中搜索目标函数或 `.a` 文件名，确认它是否进入最终 ELF；
5. 看 `process_binaries.py` 的日志和输出，确认是否又做了签名或镜像合并。

定位某个外设时，再沿着一条窄链向下追：

```text
应用调用
  -> Zephyr API
  -> Telink Zephyr driver
  -> Telink 头文件中的函数声明
  -> 对应 .c 或 .a
  -> 最终 map 文件中的来源
```

这样比在所有仓库里搜索“Telink”更容易建立完整证据。

## 初学者最容易混淆的六件事

### 1. `west` 不是编译器

它主要管理工作区并调用构建系统。真正完成配置、编译和链接的是 CMake、GN、Ninja 与工具链。

### 2. Matter 不是另一个独立 RTOS

在这个平台组合里，Matter 使用 Zephyr 提供的线程、网络、存储、Bluetooth 和驱动能力。

### 3. Matter 库不是第二个可单独运行的 BIN

它通常作为库参与最终链接。只有多核或特殊架构才可能出现额外可执行镜像，不能把特殊情况当成普通流程。

### 4. `west update` 不等于所有东西都来自 Zephyr 官方仓库

它会按照 manifest 拉取多个项目，其中可以包含 Telink fork、HAL 和其他模块。

### 5. 工作区里有某个库，不代表它进入了当前固件

Kconfig、CMake 条件和链接器引用共同决定它是否参与构建。最终以配置、链接命令和 map 文件为准。

### 6. 编译成功不等于设备行为已经验证

编译和链接只能证明静态组合成立。启动、配网、BLE、Thread、Flash、低功耗和 OTA 仍需要真机日志、抓包或功耗测量。

## 最后用一句话串起来

一次普通的 Telink Matter 构建，可以浓缩成：

```text
west 找齐工作区
  -> CMake 组织 Zephyr 应用
  -> Kconfig 和 Devicetree 确定配置
  -> GN/Ninja 编译 Matter
  -> Ninja 编译其余模块
  -> 链接器把应用、Matter、Zephyr、OpenThread 和 Telink 底层装进 zephyr.elf
  -> 转成 zephyr.bin
  -> 需要时再签名或合并为最终镜像
```

以后再面对庞大的 SDK，不需要先记住每个目录。先抓住“谁提供通用接口、谁做芯片适配、谁在最终链接中出现”这三件事，整个构建链就不会再像一个黑盒。

## 参考资料

- [Telink Matter Developer Guide](https://doc.telink-semi.cn/doc/en/software/res/sdk/matter/telink_matter_developer_guide_en/)
- [Zephyr：Application Development](https://docs.zephyrproject.org/latest/develop/application/index.html)
- [Zephyr：Build System](https://docs.zephyrproject.org/latest/build/cmake/index.html)
- [Zephyr：Modules](https://docs.zephyrproject.org/latest/develop/modules.html)
- [Matter SDK：connectedhomeip](https://github.com/project-chip/connectedhomeip)
- [Matter Telink 构建桥接模块：CMakeLists.txt](https://github.com/project-chip/connectedhomeip/blob/master/config/telink/chip-module/CMakeLists.txt)
- [Matter Telink 平台实现](https://github.com/project-chip/connectedhomeip/tree/master/src/platform/telink)
- [Matter Telink 镜像后处理：process_binaries.py](https://github.com/project-chip/connectedhomeip/blob/master/scripts/tools/telink/process_binaries.py)
- [Telink Zephyr Fork](https://github.com/telink-semi/zephyr)
- [Telink Zephyr Flash Driver](https://github.com/telink-semi/zephyr/blob/develop_v3.3/drivers/flash/soc_flash_tlx.c)
- [Telink Zephyr Bluetooth HCI Driver](https://github.com/telink-semi/zephyr/blob/develop_v3.3/drivers/bluetooth/hci/hci_tlx.c)
- [Telink Zephyr IEEE 802.15.4 Driver](https://github.com/telink-semi/zephyr/blob/develop_v3.3/drivers/ieee802154/ieee802154_tlx.c)
- [Telink HAL](https://github.com/telink-semi/hal_telink)
- [Telink BLE SDK](https://github.com/telink-semi/tl_ble_sdk)
- [Telink OpenThread Library](https://github.com/telink-semi/openthread_telink_lib)
