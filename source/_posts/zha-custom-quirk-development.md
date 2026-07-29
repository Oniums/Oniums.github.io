---
title: ZHA 第三方设备兼容：用 V2 Quirk 精确匹配和映射实体
date: 2026-07-29 10:30:00
categories:
  - 生态适配
tags:
  - Zigbee
  - ZHA
  - Home Assistant
  - Python
---

ZHA Quirk 是 Zigpy 与 Home Assistant 之间的设备适配层。它适合修正非标准描述符、补充厂商 Cluster，或把已有 Zigbee 属性映射成正确的 Home Assistant Entity。

<!-- more -->

## Quirk 的边界

一个 Quirk 通常包含：

- Matcher：识别 Manufacturer、Model 和可选的设备条件；
- Cluster modification：增加、移除或替换 Cluster；
- Entity metadata：把属性或命令映射成 Entity；
- Automation trigger：把遥控器命令映射成设备动作；
- Reporting configuration：声明需要配置的属性上报。

Quirk 不会修复射频、入网安全或设备没有发送报文的问题。先确认目标报文确实到达 Zigpy，再处理映射。

## 优先使用 V2 QuirkBuilder

当前 zha-device-handlers 推荐新适配使用声明式 `QuirkBuilder`。一个只补充 IAS Zone Tamper 实体的通用示例：

```python
from zigpy.zcl.clusters.security import IasZone

from zhaquirks.builder import BinarySensorDeviceClass, QuirkBuilder

(
    QuirkBuilder("Example Manufacturer", "GENERIC-CONTACT-01")
    .binary_sensor(
        attribute_name=IasZone.AttributeDefs.zone_status.name,
        cluster_id=IasZone.cluster_id,
        device_class=BinarySensorDeviceClass.TAMPER,
        attribute_converter=lambda value: bool(
            value & IasZone.ZoneStatus.Tamper
        ),
        unique_id_suffix="tamper",
        fallback_name="Tamper",
    )
    .add_to_registry()
)
```

这个示例假设设备已经正确提供 IAS Zone Cluster，只是平台需要把 `zone_status` 的 Tamper 位拆成独立实体。它没有虚构 Cluster，也没有改变空口数据。

## Matcher 为什么经常失败

先从 ZHA Device Signature 或调试日志确认：

- Basic Cluster 的 Manufacturer；
- Model；
- Endpoint 列表；
- 每个 Endpoint 的 Profile、Device Type；
- Server / Client Cluster。

字符串必须与设备实际返回完全一致。营销名称、包装型号和 Basic Cluster Model 可能不同。

如果多个固件共享 Manufacturer/Model 但行为不同，可使用固件版本过滤或更具体条件，避免一个 workaround 覆盖所有版本。

## 什么时候替换 Cluster

只有出现以下情况才需要自定义 Cluster：

- 厂商 Cluster 未在 Zigpy 中定义；
- 属性类型、Manufacturer Code 或访问方式需要补充；
- 报告值需要稳定、可证明的转换；
- 标准 Cluster 的设备实现存在已确认偏差。

自定义属性应明确：

- Attribute ID；
- Zigbee 数据类型；
- 读写权限；
- Manufacturer Code；
- 单位与缩放；
- 无效值；
- reporting 行为。

不要根据一条抓包就猜测类型。至少验证边界值、重启和多个样机。

## Server 与 Client 方向

ZHA 中：

- `in_clusters` 对应设备提供的 Server Cluster；
- `out_clusters` 对应设备使用的 Client Cluster。

命令定义的方向也要与 Zigpy 当前 API 一致。升级 Zigpy 时，如果命令定义模型发生变化，应保持 Command ID、载荷类型和空口序列化不变。

## Entity 映射注意点

建立 Entity 时核对：

- `endpoint_id`；
- `cluster_id`；
- `attribute_name` 或 `command_name`；
- Device Class；
- Entity Type：Standard、Config 或 Diagnostic；
- 单位、倍率和显示精度；
- `unique_id_suffix` 是否稳定且无冲突；
- 是否默认禁用。

同一个位图拆成多个实体时，每个实体都要使用稳定且不同的 suffix。已有用户依赖 Entity ID 后，不应随意更换。

## 本地加载

Home Assistant 可通过 ZHA 配置加载自定义 quirks：

```yaml
zha:
  custom_quirks_path: /config/custom_zha_quirks
```

把 Python 文件放入该目录后重启 Home Assistant。随后在设备信息与日志中确认实际加载的 Quirk 类。

如果 Quirk 已匹配但新实体仍未出现，可先执行重新配置；只有在确认平台没有重建设备实体时，再评估删除并重新配对。重新配对不是验证 Matcher 的替代方法。

## 最小验证

开发仓库中的常见检查：

```bash
python -m py_compile path/to/quirk.py
ruff check path/to/quirk.py
pytest path/to/relevant_tests.py
```

还需要设备侧验证：

1. Quirk 被目标设备匹配；
2. 相似设备不被误匹配；
3. 属性报告更新正确实体；
4. 写入或命令使用正确 Endpoint 和方向；
5. 重启 Home Assistant 后仍可加载；
6. 设备 rejoin 后 reporting 正常；
7. 未知值不会导致异常或错误状态。

## 常见问题

| 症状 | 先检查 |
|---|---|
| Quirk 没加载 | Manufacturer、Model、签名与加载路径 |
| Quirk 加载但无实体 | Entity metadata、Cluster 方向、Entity registry |
| 实体不更新 | Attribute ID、报告方向、converter |
| 写入失败 | 权限、Manufacturer Code、Endpoint、设备唤醒 |
| 多个 Quirk 冲突 | Matcher 是否过宽、版本是否重复注册 |
| 升级后警告 | Zigpy/ZHA API 与命令定义版本 |

正式贡献前应遵守仓库当前的格式、类型检查、测试和贡献说明。官方入口：

- [zha-device-handlers](https://github.com/zigpy/zha-device-handlers)
- [Home Assistant ZHA 集成](https://www.home-assistant.io/integrations/zha/)
