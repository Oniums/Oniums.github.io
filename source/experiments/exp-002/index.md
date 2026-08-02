---
title: EXP-002 多镜像固件版本配对
date: 2026-07-31 11:01:00
layout: page
aside: false
top_img: false
content_type: experiment
experiment_id: EXP-002
status: method-record
evidence: public-build-method
privacy: public
description: 验证多镜像构建中变体隔离、失败语义和最终字节校验的方法。
---

<div class="lab-record-header"><span class="lab-record-id">EXP-002 · METHOD RECORD</span><h1>多镜像固件：文件生成不等于配对正确</h1><p>本条目记录一套可验证的构建方法，当前不是某次私有 CI 构建的结果报告。</p></div>

## 实验目的

验证多镜像交付是否能够证明：

- Debug 和 Release 使用了独立配置；
- 子镜像构建失败时不会继续发布半套资产；
- 最终合并镜像中的字节与预期输入一致。

## 验证步骤

```text
显式 variant 参数
  -> 独立构建目录
  -> 编译并检查退出码
  -> 校验输入文件和哈希
  -> 合并
  -> 按 offset 提取
  -> 与输入镜像逐字节比较
```

## 成功标准

| 检查项 | 成功锚点 |
|---|---|
| 变体选择 | 未知 variant 直接失败 |
| 构建隔离 | Debug / Release 不共用缓存 |
| 资产完整性 | 缺失或空文件硬失败 |
| 最终嵌入 | 提取结果与输入文件完全相同 |
| 可追溯性 | 记录 variant、大小和 SHA-256 |

## 当前结论

仅检查文件存在、文件名或流水线顺序不足以证明交付正确。最终字节提取比较是这条链路中最接近交付物本身的决定性检查点。真实项目仍需将该方法接入对应构建流水线并保存构建证据。

## 关联内容

- [多镜像固件优化：版本配对与最终字节校验](/posts/multi-image-firmware-variant-verification/)
- [Oniums Lab 实验记录](/experiments/)
