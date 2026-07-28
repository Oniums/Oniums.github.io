---
title: Matter 各类证书的关系：Attestation 链与 Fabric 身份链
date: 2026-07-28 19:40:00
categories:
  - 无线协议
tags:
  - Matter
  - PKI
  - Device Attestation
  - CASE
---

Matter 中至少有两套容易混淆的证书体系：产品证明身份的 Device Attestation 链，以及加入某个 Fabric 后使用的 Operational Certificate 链。它们的签发者、生命周期和验证目的都不同。

<!-- more -->

## 总览

```text
产品证明链
PAA
  -> PAI
      -> DAC + DAC Private Key（每台设备）
  + Certification Declaration（独立的签名声明）

Fabric 运行身份链
RCAC
  -> 可选 ICAC
      -> NOC（该 Node 在该 Fabric 的身份）
```

PAA/PAI/DAC 回答“这是什么产品、凭据是否来自可信产品链”；RCAC/ICAC/NOC 回答“这个 Node 在哪个 Fabric 中拥有什么 operational 身份”。

## PAA、PAI 与 DAC

### PAA

Product Attestation Authority 是产品证明链的根。Commissioner 的信任库保存或可获得受信任 PAA。

### PAI

Product Attestation Intermediate 是可选但常用的中间 CA，由 PAA 签发，再用于签发 DAC。它帮助隔离产品线或制造流程。

### DAC

Device Attestation Certificate 是设备级证书：

- 与设备持有的 DAC Private Key 配对；
- 在制造或安全 provisioning 阶段写入；
- 用于 commissioning 期间证明设备持有对应私钥；
- 不应在设备之间共享同一私钥。

链验证的简化方向是：

```text
DAC <- PAI <- trusted PAA
```

私钥永远不应出设备安全边界，也不应进入源码、构建日志或公开仓库。

## Certification Declaration

Certification Declaration，简称 CD，是与产品认证信息相关的签名声明，不是 DAC 链中的另一张 X.509 证书。

Commissioner 在 Device Attestation 时同时检查：

- DAC/PAI 到可信 PAA 的链；
- 设备对 attestation challenge 的签名；
- CD 的签名和内容；
- Vendor ID、Product ID 等信息之间的一致性；
- 适用的撤销与政策信息。

“DAC 链有效”和“产品认证声明有效”是两个相关但不同的检查。

## RCAC、ICAC 与 NOC

### RCAC

Root CA Certificate 是某个 Fabric 的 operational 信任根，由 Fabric 管理域控制。

### ICAC

Intermediate CA Certificate 是可选中间层，用于组织 operational CA 层级。

### NOC

Node Operational Certificate 是 Node 在一个 Fabric 中的身份证书，包含对应 Fabric 和 Node 身份信息，并由 operational CA 链签发。

```text
NOC <- optional ICAC <- RCAC
```

设备加入多个 Fabric 时，会拥有多套彼此独立的 NOC 和 Fabric 状态。

## Commissioning 中它们何时出现

```text
PASE 建立
  -> 读取 Attestation 信息
  -> 验证 DAC / PAI / PAA 与 CD
  -> 请求 Node 生成 operational key pair 和 CSR
  -> Commissioner / Fabric CA 签发 NOC
  -> AddNOC 写入 RCAC、ICAC/NOC 与 Fabric 参数
  -> 后续通过 CASE 建立 operational session
```

关键边界：

- PASE 使用 setup passcode，不依赖 NOC；
- Device Attestation 先于 NOC 安装；
- NOC 由 Fabric 的 CA 体系产生，不是制造商 DAC 的替代品；
- CASE 使用 operational credentials，不使用 DAC 建立日常会话。

## 多 Fabric 场景

同一设备的 DAC 身份通常保持不变，但每个 Fabric 会安装自己的：

- NOC；
- Root / Intermediate CA 信息；
- Fabric ID 与 Node ID；
- IPK 和组密钥状态；
- ACL。

删除一个 Fabric 应只清理该 Fabric 的 operational 状态，不能误删设备的制造 attestation 凭据或其他 Fabric。

## 开发凭据与量产凭据

Matter SDK 提供测试证书和 `chip-cert` 工具，适合本地开发与理解格式，不应直接用于量产或正式认证。

推荐分层：

| 环境 | 凭据 |
|---|---|
| 本地开发 | 明确标识的测试 PAA/PAI/DAC |
| 自动化测试 | 隔离的测试 PKI |
| 认证样机 | 满足当前认证政策的独立设备凭据 |
| 量产 | 受控 PKI、硬件保护和可审计 provisioning |

## 排障问题清单

1. 失败发生在 PASE、Attestation、CSR、AddNOC 还是 CASE？
2. 验证的是 CD、DAC 链还是 operational 链？
3. VID/PID 与证书、CD、Basic Information 是否一致？
4. 设备是否能用对应私钥完成 challenge 签名？
5. PAA 是否在 Commissioner 的信任库？
6. NOC 是否属于当前 Fabric 和 Node？
7. 多 Fabric 清理是否越界？
8. 测试凭据是否被误带到认证或量产构建？

继续阅读：

- [CSA Product Attestation Authorities](https://csa-iot.org/certification/paa/)
- [Matter/CHIP Certificate Tool](https://project-chip.github.io/connectedhomeip-doc/src/tools/chip-cert/README.html)
- [Matter Access Control Guide](https://project-chip.github.io/connectedhomeip-doc/guides/access-control-guide.html)
- [CSA PKI Certificate Policy](https://csa-iot.org/wp-content/uploads/2024/02/pki-certificate-policy-2025.pdf)
