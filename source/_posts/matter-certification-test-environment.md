---
title: Matter 认证环境搭建：Test Harness、DUT 与网络基础设施
date: 2026-07-28 19:50:00
categories:
  - 认证实践
tags:
  - Matter
  - Test Harness
  - PICS
  - 环境搭建
---

Matter 认证环境不是一台电脑加一个 `chip-tool`。稳定的预认证环境需要把 Test Harness、Device Under Test、参考节点、网络基础设施、PICS 和版本证据作为一个整体管理。

<!-- more -->

## 先冻结版本组合

在安装前确认：

- 目标 Matter Specification 版本；
- 对应 Test Plan、PICS/PIXIT 和 CCB；
- Test Harness 发布版本或镜像；
- Test Harness 使用的 Matter SDK commit；
- DUT 的网络传输：Thread、Wi-Fi 或 Ethernet；
- 认证路径：完整产品、平台或派生产品；
- 实验室接受的设备与辅助硬件。

Test Harness、SDK、测试脚本和 PICS 之间存在版本配套关系。只更新其中一项可能制造环境假失败。

## 推荐架构

```text
浏览器工作站
      │
Matter Test Harness 主机
  ├── Web / Backend / Database
  ├── 参考 Commissioner 或 Accessory
  ├── 测试脚本与日志
  └── OTBR（Thread DUT 时）
          │
        RCP
          │ IEEE 802.15.4
         DUT
```

Wi-Fi / Ethernet DUT 还需要稳定、可控且支持 IPv6 与组播的局域网。

## 硬件准备

当前官方 Test Harness 用户指南以 Raspberry Pi 4 或 5、至少 8 GB RAM 和至少 64 GB 存储作为完整环境的基础示例。Thread DUT 还需要受支持固件的 RCP。

实际送测前以对应 Test Harness 版本的用户指南为准，不要把这组规格当作永久不变的认证要求。

建议额外准备：

- 两台或以上独立 DUT；
- 串口日志采集器；
- 可控电源与重启方式；
- 独立抓包器；
- 有线管理网络；
- 时间同步；
- 足够保存镜像、数据库和原始日志的空间。

## 网络准备

Matter 对本地网络提出的典型基础要求：

- IPv6 可用；
- mDNS / DNS-SD 组播不被错误阻断；
- 主机路由和接口选择明确；
- 防火墙不拦截测试流量；
- Wi-Fi SSID 与 Thread Dataset 独立保存；
- 测试网与办公网、生产网隔离。

不要在公开配置文件中提交 Wi-Fi 密码、Thread Dataset、setup passcode 或证书私钥。

## 安装原则

1. 从 [官方 certification-tool 仓库](https://github.com/project-chip/certification-tool)选择目标 release 或 commit；
2. 完整阅读该版本的 `Matter_TH_User_Guide`；
3. 使用文档指定的系统镜像、容器和 SDK 配套；
4. 记录每个镜像、仓库和 RCP 固件的版本；
5. 先用官方参考节点完成环境冒烟测试；
6. 再接入自己的 DUT。

不要把 `main` 分支当天状态当作认证基线，也不要在问题出现后无记录地升级整个环境。

## DUT 准备

DUT 至少应支持：

- 稳定进入和退出 commissioning 模式；
- 可靠恢复出厂；
- 可识别的固件、硬件版本；
- 测试要求的自动化触发或人工操作；
- 持续串口日志；
- 正确的 Device Attestation Credentials；
- 与 PICS 一致的 Endpoint、Device Type 和 Cluster。

开发测试凭据与认证/量产凭据必须隔离。正式认证是否要求独立 provisioned DUT 及具体样机数量，应按当前计划和实验室要求执行。

## PICS 驱动测试

Test Harness 根据 PICS 选择适用用例。推荐流程：

```text
审查 Data Model
  -> 填写 PICS / PIXIT
  -> PICS Tool 校验
  -> 导入 Test Harness
  -> 检查自动选择的用例
  -> 运行并审查原始日志
```

用例没被选中不自动表示“不适用”，也可能是 PICS 填错。

## 环境验收

在测试产品功能前，先证明环境：

- Web UI、Backend 与数据库健康；
- 参考 Commissioner / Accessory 可运行；
- BLE adapter 可发现参考 DUT；
- Thread 时 OTBR 与 RCP 正常；
- Wi-Fi / Ethernet 时 IPv6 和 mDNS 正常；
- 测试主机时间一致；
- 日志、报告和备份可导出；
- 恢复出厂后可重复 commissioning。

## 证据与故障隔离

每次运行保存：

- Test Harness、SDK、镜像和脚本版本；
- PICS / PIXIT；
- DUT 固件和构建标识；
- 测试项目配置的脱敏副本；
- Test Harness、DUT、OTBR 和抓包日志；
- 用例结果与人工操作记录。

先用参考节点区分“环境坏了”还是“DUT 有问题”，再进入产品代码分析。

官方入口：

- [Matter Test Harness User Guide](https://github.com/project-chip/certification-tool/blob/main/docs/Matter_TH_User_Guide/Matter_TH_User_Guide.adoc)
- [CSA 认证工具](https://csa-iot.org/certification/tools/)
- [Matter SDK 测试文档](https://project-chip.github.io/connectedhomeip-doc/testing/index.html)
