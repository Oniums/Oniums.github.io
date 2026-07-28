---
title: AI + Zephyr + Matter：构建、烧录与串口调试的可控闭环
date: 2026-07-28 13:20:00
categories:
  - 搭建教程
tags:
  - AI
  - Telink
  - Zephyr
  - Matter
  - 串口调试
  - 自动化测试
---

AI 可以把代码修改、构建、串口日志分析和回归测试连接成闭环，但“能执行命令”不等于“可以无限自动操作硬件”。可靠流程需要固定工程边界、明确设备身份、把烧录设为授权门，并让每轮结论都对应可复核证据。

<!-- more -->

## 闭环不是无限重试

推荐状态机：

```text
理解需求
  -> 读取工程规则与代码流
  -> 修改产品代码
  -> 静态检查
  -> full build
  -> 人工烧录授权门
  -> 烧录明确目标
  -> 只读串口采集
  -> 执行测试动作
  -> 对照成功锚点
  -> 修复或结束
```

每一轮都应有时间、尝试次数和停止条件。没有新证据时反复编译烧录，只会消耗硬件寿命并制造更多状态差异。

## 第一层：把构建入口固定下来

不要让 AI 每次临时拼接长命令。产品仓应提供单一包装入口：

```text
scripts/build.sh
  --app <name>
  --full | --incremental
  --out <directory>
  --dry-run
```

包装脚本负责解析：

- SDK 与应用路径；
- Board 和 Flash 配置；
- Matter 环境激活；
- west build 参数；
- 输出目录和日志；
- 预期制品；
- 退出码和失败阶段。

AI 首先运行 `--dry-run`，确认解析结果，再执行构建。full build 通过后记录：

```text
source commit:
build mode:
board:
artifact path:
artifact size:
artifact sha256:
build log:
```

制品存在不等于本次构建成功，必须同时验证退出码和修改时间。

## 第二层：建立硬件注册表

不要通过“第一个 ttyUSB”猜目标设备。维护一个不含秘密的本地硬件映射：

```yaml
boards:
  bench-a:
    board: <telink-board>
    runner: <runner>
    programmer_id: <local-id>
    serial: /dev/serial/by-id/<stable-name>
    baud: 115200
```

映射文件应留在本地或受控测试环境，不在公开日志中暴露唯一设备标识。

AI 在烧录前必须输出并确认：

```text
目标板:
制品 SHA256:
runner:
是否擦除:
预期影响:
```

默认使用普通 `west flash`，不要把全片擦除设为自动默认动作。擦除可能清除配网、校准和测试状态，需要单独授权。

## 第三层：把烧录设置为动作门

建议权限模型：

```text
build / inspect / hash     自动允许
open serial read-only      自动或一次授权
flash known artifact       每轮明确授权
erase / recover / unlock   高风险单独授权
factory commands           默认禁止
```

如果没有授权，AI 应停在“构建已通过、制品已准备、等待烧录确认”，而不是绕过边界寻找其他写入方式。

## 第四层：只读串口采集

pySerial 可以列出串口并提供 miniterm。用于自动分析时，更推荐只读采集脚本：

```python
from datetime import datetime, timedelta
import serial

deadline = datetime.now() + timedelta(seconds=60)

with serial.Serial("/dev/serial/by-id/<stable-name>", 115200, timeout=1) as port:
    while datetime.now() < deadline:
        line = port.readline()
        if line:
            print(line.decode("utf-8", errors="replace").rstrip())
```

采集器不调用 `write()`，避免测试脚本意外发送命令。需要交互测试时，应使用独立、白名单化的命令层。

日志保存前应移除：

- 密钥、证书和配网凭据；
- QR、PIN 和 verifier；
- Thread Dataset；
- 唯一设备地址；
- 内部服务器和仓库信息。

## 第五层：用成功锚点驱动判断

不要让 AI 只搜索 `error`。为每个测试定义阶段：

```text
boot
  -> platform init
  -> network init
  -> attach / commissioning
  -> application ready
  -> test action
  -> expected state / report
```

测试结果应输出：

```text
最后成功阶段:
第一个失败阶段:
直接证据:
当前推断:
仍缺少的证据:
下一项最小实验:
```

这样能够防止把底层发送成功误判成上层业务成功。

## 第六层：修复后的回归

每次修复至少经过：

1. 格式和静态检查；
2. full build；
3. 制品哈希记录；
4. 目标场景复测；
5. 一项相邻正常场景；
6. 重启后再次验证；
7. 工作树和 diff 审查。

复杂项目可以进一步接入 Zephyr Twister。Twister 支持 hardware map、串口、flash timeout 和自定义 flash command，可以把多块测试板映射到明确平台与端口。

## 一个可执行的控制器

控制器本身只负责状态推进：

```text
if source_changed:
    run_static_checks()
    full_build()

if build_passed:
    collect_artifact_manifest()

if flash_approved:
    verify_target_mapping()
    flash_without_erase()
    capture_serial_read_only()
    evaluate_anchors()

if evidence_supports_fix:
    run_regression()
else:
    stop_and_report_gap()
```

实际修改和判断仍应保留 Git diff、构建日志和串口证据，不能只保存 AI 的自然语言总结。

## 安全停止条件

出现以下任一情况应停止自动循环：

- 目标板或串口身份不确定；
- 当前制品哈希与批准的不一致；
- 构建连续重复失败但没有新证据；
- 烧录器提示解锁、恢复或全片擦除；
- 串口出现可能包含安全材料的数据；
- 设备表现出异常复位或供电问题；
- 操作范围扩展到 SDK、工厂区或其他产品。

自动化的目标是缩短证据闭环，不是取消工程授权和硬件安全边界。

参考资料：

- [Zephyr Building, Flashing and Debugging](https://docs.zephyrproject.org/latest/develop/west/build-flash-debug.html)
- [Zephyr Twister Hardware Testing](https://docs.zephyrproject.org/latest/develop/test/twister.html)
- [pySerial Tools](https://pyserial.readthedocs.io/en/stable/tools.html)
- [Matter SDK Basics](https://project-chip.github.io/connectedhomeip-doc/getting_started/SDKBasics.html)
