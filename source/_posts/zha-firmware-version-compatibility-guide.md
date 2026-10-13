---
title: 同一款 Zigbee 设备，不同固件怎么适配？ZHA Quirk 的版本兼容实践
date: 2026-10-13 17:00:00
categories:
  - 生态适配
tags:
  - Zigbee
  - ZHA
  - Home Assistant
  - Python
---

一款 Zigbee 设备升级后多了几个配置选项，Manufacturer 和 Model 却没有变化。直接把新选项加进 Quirk，旧固件也会显示这些选项；用户能选中，设备却未必能执行。

这时需要让 Quirk 根据固件能力选择合适的实体定义。本文用一个虚构设备演示版本分流、未知版本回退和实体一致性，并用测试检查匹配边界。

<!-- more -->

如果还不熟悉 QuirkBuilder，可以先读 [ZHA 第三方设备兼容：用 V2 Quirk 精确匹配和映射实体](/posts/zha-custom-quirk-development/)。本文沿用 V2 写法，重点讨论同一型号内部的版本差异。

> 示例中的厂商、型号、Cluster、属性和版本号均为教学用假设，不对应真实设备协议。代码按 2026-10-13 核对的 zha-device-handlers 开发版 API 编写；验证环境为 Python 3.12、zigpy 2.3.0、zha 2.3.0。它不是可以直接装到任意 Home Assistant 版本上的设备驱动。

## 先把能力边界说清楚

假设设备 `Example Devices / DEMO-MODE-01` 提供一个模式选择属性：

| 固件范围 | 支持的模式 | 平台应该显示 |
|---|---|---|
| 版本小于 `0x0200` | Normal、Quiet | 两个选项 |
| 版本大于等于 `0x0200` | Normal、Quiet、Adaptive | 三个选项 |
| 版本未知 | 无法确认是否支持 Adaptive | 暂时只显示两个基础选项 |

这份表依赖两个前提：基础选项在两代固件中含义相同；新版本继续兼容旧选项。如果升级改变了同一个数值的含义，或者不同硬件使用独立版本序列，就需要进一步区分 Cluster 行为、硬件或其他可验证条件。

版本阈值必须来自已确认的协议能力。不能仅凭“这个版本比较新”，就推断它支持某个功能。

## 过滤器到底在比较哪个版本

当前实现从设备的 OTA Client Cluster 中读取缓存的 `current_file_version`。它不比较固件名称字符串，也不把 Basic Cluster 的 `app_version` 或 `sw_build_id` 自动转换成这个值。匹配时没有可用的 OTA 版本，就进入缺失版本分支。

`firmware_version_filter()` 使用整数比较，范围为 **下界包含、上界不包含**：

```text
旧版：version < 0x0200
新版：version >= 0x0200
```

因此，两边都写同一个分界值即可。旧版若写成 `max_version=0x01FF`，版本恰好为 `0x01FF` 的设备会被排除。这个参数不是“支持到哪个版本为止”的包含式上限。

`allow_missing=True` 表示缺失版本时允许命中这一分支。本文只在基础分支启用它，避免未知版本同时满足两套定义。[QuirkBuilder 的参数说明](https://github.com/zigpy/zha-device-handlers/blob/dev/zhaquirks/builder/builder.py)和 [ZHA 的匹配实现](https://github.com/zigpy/zha/blob/dev/zha/quirks.py)分别说明了范围与版本来源。

十六进制只是表示方法。真实设备的版本编码不一定按十进制版本号排列，建立阈值前应核对设备返回的原始整数，以及该产品的版本编码规则。

## 用一个公共定义，生成两套互斥 Quirk

下面是完整的教学模块，可保存为 `demo_version_quirk.py`。它假设设备 Endpoint 1 已有一个 Server Cluster，模式属性可以直接读写。示例只演示适配层结构；真实协议若要求 Manufacturer Code、专用命令或特殊响应处理，需要按协议补齐。

```python
import zigpy.types as t

from zhaquirks.builder import QuirkBuilder
from zhaquirks.clusters import CustomCluster

FEATURE_VERSION = 0x0200


class BaseMode(t.enum8):
    Normal = 0x00
    Quiet = 0x01


class ExtendedMode(t.enum8):
    Normal = 0x00
    Quiet = 0x01
    Adaptive = 0x02


class DemoModeCluster(CustomCluster):
    cluster_id = 0xFC80
    ep_attribute = "demo_mode"
    attributes = {
        0x0001: ("operating_mode", t.enum8),
    }


base = QuirkBuilder("Example Devices", "DEMO-MODE-01").replaces(
    DemoModeCluster
)


def register_variant(builder, modes):
    return (
        builder.enum(
            attribute_name="operating_mode",
            enum_class=modes,
            cluster_id=DemoModeCluster.cluster_id,
            endpoint_id=1,
            unique_id_suffix="operating_mode",
            translation_key="operating_mode",
            fallback_name="Operating mode",
        )
        .add_to_registry()
    )


BASE_ENTRY = register_variant(
    base.clone(omit_man_model_data=False).firmware_version_filter(
        max_version=FEATURE_VERSION,
        allow_missing=True,
    ),
    BaseMode,
)

EXTENDED_ENTRY = register_variant(
    base.clone(omit_man_model_data=False).firmware_version_filter(
        min_version=FEATURE_VERSION,
        allow_missing=False,
    ),
    ExtendedMode,
)
```

公共的 `base` 只保存共同配置，不调用 `add_to_registry()`。最终只有两个带版本条件的分支注册，避免额外留下一条没有版本限制的规则。

`clone(omit_man_model_data=False)` 也不能省略。当前 `clone()` 默认移除厂商和型号信息，方便派生适配不同型号的设备；这里仍然适配同一型号，需要显式保留这些匹配条件。

两套枚举保持已有成员的名字和数值一致。Quiet 始终对应 `0x01`，新增能力只增加 Adaptive。不要为了让界面排序好看而重排协议数值。

最后，这里的枚举限制作用于平台选项定义。它不意味着设备端增加了能力，也不等价于对所有直接 ZCL 写入建立了校验。

## 未知版本为什么落到基础分支

在这个例子里，错误开放 Adaptive 会给用户一个无法可靠执行的控制项；暂时隐藏它，基础功能仍然可用。因此，我们选择未知版本走基础分支。

这不是所有 Quirk 都应遵守的固定规则。如果旧版适配负责修正错误倍率，把新版设备误当旧版可能直接得到错误读数。这类场景应依据具体证据选择默认行为，必要时暂不匹配特殊修正，而不是机械地“未知就选旧版”。

两套规则不要都使用默认的 `allow_missing=True`。即使框架最终只选择一个结果，候选重叠也会让行为依赖规则优先级，掩盖版本条件的问题。

还要检查同型号是否已经注册了其他通用规则。两条新规则彼此互斥，不代表整个注册表没有冲突。

## 功能变了，实体标识尽量保持稳定

用户可能已经把这个模式实体放进仪表盘，或用于自动化。升级后只是多一个选项，应尽量继续使用原来的实体。

示例通过公共注册函数保持以下元数据一致：

| 元数据 | 保持一致的目的 |
|---|---|
| `endpoint_id`、`cluster_id`、`cluster_type` | 继续指向同一个协议对象 |
| `attribute_name` | 继续映射同一个属性 |
| `entity_platform`、`entity_type` | 保持实体类别与用途 |
| `unique_id_suffix` | 避免引入另一套实体身份 |
| `translation_key`、`fallback_name` | 保持翻译键与默认名称一致 |

当前元数据校验要求提供 `translation_key` 或 `device_class`；本例的 Select 使用前者，并提供 `fallback_name`。教学用翻译键不表示 Home Assistant 已内置相应翻译，正式适配仍需按上游规则处理。翻译名称与实体身份是不同问题，改了名字不等于解决了实体重复。

元数据一致是代码层面的约束。升级后 Home Assistant 是否保留原有实体、仪表盘引用和自动化，还要在实际的 Entity Registry 中验证，不能仅凭这张表作保证。

## 测试要同时检查边界和实际选择

至少覆盖四种输入：未知版本、分界值前一版、分界值本身、分界值后一版。每个输入都检查“只有一个候选命中”和“注册表实际选中了它”，这样可以发现重叠、空档，以及未带入设备匹配条件等问题。

下面的测试使用 zha-device-handlers 仓库自带的 `zigpy_device_from_v2_quirk` fixture。它会在匹配前构造 OTA 版本缓存；这不代表真实设备已经成功上报版本。

在该仓库开发环境中，将前面的模块放到 `tests/demo_version_quirk.py`，下面的代码保存为 `tests/test_demo_version_quirk.py`：

```python
import pytest
from zha.quirks import QUIRK_REGISTRY_ENTRY_ATTR
from zigpy.zcl import ClusterType

from .demo_version_quirk import (
    BASE_ENTRY,
    EXTENDED_ENTRY,
    FEATURE_VERSION,
    BaseMode,
    DemoModeCluster,
    ExtendedMode,
)


@pytest.mark.parametrize(
    ("version", "expected_entry", "expected_modes"),
    [
        (None, BASE_ENTRY, BaseMode),
        (FEATURE_VERSION - 1, BASE_ENTRY, BaseMode),
        (FEATURE_VERSION, EXTENDED_ENTRY, ExtendedMode),
        (FEATURE_VERSION + 1, EXTENDED_ENTRY, ExtendedMode),
    ],
)
def test_version_selection(
    zigpy_device_from_v2_quirk, version, expected_entry, expected_modes
):
    device = zigpy_device_from_v2_quirk(
        manufacturer="Example Devices",
        model="DEMO-MODE-01",
        firmware_version=version,
        cluster_ids={
            1: {DemoModeCluster.cluster_id: ClusterType.Server}
        },
    )
    matches = [
        entry
        for entry in (BASE_ENTRY, EXTENDED_ENTRY)
        if entry.device_match.matches(device)
    ]
    assert matches == [expected_entry]
    assert getattr(device, QUIRK_REGISTRY_ENTRY_ATTR) is expected_entry

    definition = expected_entry.zha_device_factory.quirk_definition
    assert len(definition.entity_metadata) == 1
    assert definition.entity_metadata[0].enum is expected_modes


def test_entity_metadata_stays_stable():
    old = BASE_ENTRY.zha_device_factory.quirk_definition.entity_metadata[0]
    new = EXTENDED_ENTRY.zha_device_factory.quirk_definition.entity_metadata[0]
    fields = (
        "endpoint_id",
        "cluster_id",
        "cluster_type",
        "attribute_name",
        "entity_platform",
        "entity_type",
        "unique_id_suffix",
        "translation_key",
        "fallback_name",
    )
    for field in fields:
        assert getattr(old, field) == getattr(new, field)

    for member in BaseMode:
        assert int(ExtendedMode[member.name]) == int(member)
```

运行：

```bash
python -m pytest -q tests/test_demo_version_quirk.py
```

这个最小用例有五项检查：四组版本选择，以及一项元数据和已有枚举值的一致性检查。实际项目还应补充错误厂商、错误型号、其他同型号规则，以及属性写入和报告回读的测试。

本文的教学代码已在前述开发环境中运行通过这五项检查。它验证的是 Quirk 匹配与元数据，不包含无线通信、设备执行或真实 Home Assistant 升级流程。

## 设备升级后，还要验证重新匹配

版本过滤在 Quirk 选择时生效。本文代码没有监听版本变化并动态替换正在使用的实体定义，因此不能据此宣称“OTA 一结束，新选项就会立即出现”。

实际部署时，先确认当前平台加载了支持该 API 的 Quirk，再检查匹配时读取到的版本、选中的分支，以及实体是否按预期重建。根据所用 ZHA 版本的设备初始化与重载机制操作，不要把删除设备、重新配对当作默认排障步骤。

一轮完整的设备验证可以按下面的顺序进行：

1. 旧固件首次接入，只显示基础选项；选择后设备执行并正确回报。
2. 新固件首次接入，显示新增选项；写入和回报与协议一致。
3. 版本不可用时，只有基础分支命中，界面行为符合预期。
4. 已接入设备升级并重新完成适配后，新增选项出现，原实体和自动化仍可用。
5. 平台重启、设备离线后重连，再检查版本、实体与状态恢复。

这样，单元测试负责守住规则的确定性，设备与平台验证负责确认实际升级路径。后续增加第三段版本范围时，也能沿用同一张能力表和边界测试，避免把兼容逻辑逐渐变成依赖注册顺序的特例集合。

## 参考与延伸

- [zha-device-handlers：QuirkBuilder 实现](https://github.com/zigpy/zha-device-handlers/blob/dev/zhaquirks/builder/builder.py)，查看 `firmware_version_filter()` 与 `clone()`。
- [ZHA：Quirk 匹配实现](https://github.com/zigpy/zha/blob/dev/zha/quirks.py)，查看 OTA 版本读取与匹配条件。
- [zha-device-handlers：测试 fixture](https://github.com/zigpy/zha-device-handlers/blob/dev/tests/conftest.py)，查看模拟版本如何在选择 Quirk 前写入。
- [ZHA 第三方设备兼容：用 V2 Quirk 精确匹配和映射实体](/posts/zha-custom-quirk-development/)。
- [Zigbee 第三方平台适配：ZHA、Z2M 与 SmartThings 的统一方法](/posts/zigbee-third-party-platform-compatibility/)。

上游开发分支会继续变化。复现时应以实际安装的依赖和对应版本源码为准。
