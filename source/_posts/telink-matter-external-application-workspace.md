---
title: Telink Matter 开发环境：把产品应用从 SDK 仓库中抽离
date: 2026-07-28 13:50:00
categories:
  - 搭建教程
tags:
  - Telink
  - Matter
  - Zephyr
  - west
---

直接在 Matter SDK 的 example 目录里开发产品，开始很快，长期却会带来 SDK 升级困难、产品提交混入第三方源码、多个应用相互影响等问题。更稳定的方式是把 SDK 当作只读依赖，把产品应用、配置、生成物和构建入口放进独立仓库。

<!-- more -->

## 目标结构

把环境分成两个边界：

```text
vendor workspace
├── matter/
├── zephyr/
├── modules/
└── toolchain/

product repository
├── apps/
│   └── sensor/
│       ├── src/
│       ├── include/
│       ├── boards/
│       ├── prj.conf
│       ├── Kconfig
│       ├── CMakeLists.txt
│       └── data-model/
├── scripts/
├── docs/
└── out/              # ignored
```

SDK 提供 SoC、HAL、Zephyr、OpenThread、Matter 和平台适配；产品仓只保存业务代码与可复现配置。

## 为什么值得抽离

独立产品仓带来的收益包括：

- SDK 可以固定到明确版本，默认只读；
- 产品提交不会混入大量第三方源码变化；
- 多个产品可以共享同一套 SDK；
- `prj.conf`、board overlay 和数据模型的责任更清楚；
- CI 只需要检出产品仓并准备对应 SDK；
- SDK 升级可以作为显式迁移任务单独验证。

这不是简单复制 example。真正要做的是把应用与 SDK 的接口整理出来。

## 先建立可重复的 SDK 基线

在迁移前记录：

- SDK 发布版本或 commit；
- Matter、Zephyr 和 OpenThread 的配套关系；
- 编译器与 Python 环境；
- Board target；
- Flash 大小和构建参数；
- 原始 example 的成功构建命令。

先在未修改的 SDK example 上完成一次 full build。没有成功基线时，迁移后的错误很难区分是环境问题还是应用问题。

Matter 官方构建说明要求先执行仓库的环境激活脚本；Telink 官方示例同样使用 `source scripts/activate.sh` 和 `west build`。

## 使用外部 source 和独立 build tree

产品应用不需要位于 SDK 内部。激活环境后，可以让 west 指向外部 source：

```bash
SDK_ROOT=/opt/vendor/telink-sdk
APP_ROOT="$PWD/apps/sensor"
OUT_DIR="$PWD/out/sensor-build"

cd "$SDK_ROOT/matter"
source scripts/activate.sh

cd "$SDK_ROOT"
west build -p always \
  -b <telink-board> \
  -s "$APP_ROOT" \
  -d "$OUT_DIR" \
  -- -DFLASH_SIZE=<size>
```

这里有三个重要边界：

- `-s` 指向产品应用；
- `-d` 指向产品仓生成目录；
- west 仍在准备好的 SDK workspace 中解析 Zephyr modules。

不同应用和构建类型应使用不同输出目录，避免 CMake cache 串用。

## 产品仓应该保存什么

### 应用代码

包括入口任务、传感器管理、状态机、LED、按键、升级和产品业务模块。

### Zephyr 配置

- `prj.conf`：Kconfig 功能选择；
- `boards/<board>.overlay`：产品 GPIO、UART、I2C、ADC 等映射；
- 产品 Kconfig：只描述应用自己的选项。

### Matter 数据模型

保留 ZAP 或 Matter IDL 源文件，以及可重复执行的生成脚本。生成文件可以提交，但不能只提交生成结果而丢失源模型和生成命令。

### 构建包装脚本

包装脚本负责：

- 验证 SDK 位置和版本；
- 激活环境；
- 解析应用与 Board；
- 区分 incremental 和 full；
- 使用独立输出目录；
- 输出日志和制品位置；
- 在失败时返回非零退出码。

脚本不应该悄悄修改 SDK 源码，也不应把用户机器上的绝对路径写进仓库配置。

## 处理 SDK 接口依赖

应用通常会依赖三类接口：

```text
Zephyr API
  -> kernel / driver / settings / logging

Matter API
  -> server / clusters / platform

Telink platform API
  -> board / power / flash / BLE / radio adaptation
```

迁移时从 include、CMake target 和 Kconfig 三个方向检查依赖。不要把需要的 SDK 文件复制到产品仓；应通过正式 target 和 include path 使用它们。

如果产品确实需要 SDK 补丁，建议采用：

1. 固定 SDK commit；
2. 在产品仓保存最小补丁；
3. 构建前检查补丁适用性；
4. 构建完成或失败后可恢复；
5. 在升级 SDK 时重新审查补丁。

长期方案仍应是产品侧适配或把通用修复反馈给 SDK，而不是积累无法追踪的本地修改。

## 迁移验证顺序

```text
原始 example full build
  -> 外部最小应用 build
  -> Board overlay 与外设
  -> Matter 数据模型
  -> 产品模块逐层迁移
  -> full build
  -> flash 和串口启动
  -> 配网 / 网络 / 应用行为
  -> 低功耗与 OTA
```

每次只跨一个边界，失败时才能快速判断属于环境、SDK 接口还是产品逻辑。

## 仓库边界

产品仓可以记录 SDK 版本和依赖关系，但不应重新发布无权分发的厂商 SDK、工具链或第三方凭据。CI 中的 SDK 获取方式也需要遵守供应商许可。

参考资料：

- [Matter Building Guide](https://project-chip.github.io/connectedhomeip-doc/guides/BUILDING.html)
- [Matter Telink Example](https://project-chip.github.io/connectedhomeip-doc/examples/bridge-app/telink/README.html)
- [Zephyr Application Development](https://docs.zephyrproject.org/latest/develop/application/index.html)
- [Matter SDK Repository](https://github.com/project-chip/connectedhomeip)

