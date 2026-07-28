---
title: Wireshark + Thread 抓包：从信道到协议阶段的完整流程
date: 2026-07-28 13:40:00
categories:
  - 搭建教程
tags:
  - Wireshark
  - Thread
  - OpenThread
  - 抓包
---

Thread 抓包的关键不是“看到 802.15.4 帧”，而是让信道、时间、解密条件和设备日志对齐，再按 MLE、6LoWPAN、IPv6 和上层会话逐层判断。抓包只能证明捕获范围内发生的网络行为，不能替代设备端状态。

<!-- more -->

## 准备组成

一个常见环境包括：

```text
Thread device under test
Thread network / Border Router
802.15.4 sniffer hardware
Pyspinel or vendor extcap
Wireshark
serial log
```

OpenThread 官方 Pyspinel 指南使用 RCP 或 NCP 设备向 Wireshark 输出 pcap 流。实际 sniffer 可以来自不同厂商，但必须支持目标信道与正确的 802.15.4 帧格式。

## 第一步：确认信道

Thread 使用 2.4 GHz IEEE 802.15.4 信道。sniffer 配错信道时，最容易产生“设备没有发包”的错误结论。

从授权的网络管理界面、Border Router 或本地测试配置确认当前信道，然后让 sniffer 固定在同一信道：

```bash
python sniffer.py \
  --channel <channel> \
  --uart /dev/ttyACM0 \
  --crc \
  --rssi \
  | wireshark -k -i -
```

串口、波特率、`--crc`、`--tap` 和 `--no-reset` 是否需要，应按 sniffer 固件与硬件说明选择，不能机械复制一套参数。

## 第二步：建立捕获基线

正式复现前先验证：

- Wireshark 能看到 IEEE 802.15.4 帧；
- RSSI 和 Channel 元数据合理；
- 抓包机附近有已知设备活动；
- pcapng 能正常保存和重新打开；
- 主机时间与串口日志时间可对应。

“有帧”只证明射频信道上有活动，不证明它来自目标设备，也不证明上层 Thread 或 Matter 成功。

## 第三步：按协议层过滤

常用观察顺序：

```text
wpan
  -> 802.15.4 MAC 与确认
mle
  -> Thread attach、parent、link 建立
ipv6
  -> 地址与 IP 可达性
udp / coap
  -> 上层传输与管理交互
```

可以先使用宽过滤器确定时间范围，再逐层缩小：

```text
wpan
mle
ipv6
udp
coap
```

不要一开始只搜某个错误文本。先找到最后一个明确成功的阶段和第一个缺失或失败的阶段。

## 解密边界

未配置网络密钥时，仍可分析信道、MAC 地址类型、帧控制、ACK、重传和部分未加密信息。要进一步解析受 Thread 网络安全保护的内容，需要在本地 Wireshark 中配置目标测试网络的授权密钥。

安全原则：

- 密钥只在受控本机输入；
- 不写入公开文章、脚本、终端录屏或共享日志；
- 分享 pcap 前评估其中是否含可复用的网络信息；
- 测试完成后清理临时配置和导出文件。

Thread 网络密钥用于 Thread 网络层分析，不等于 Matter 会话密钥。即使 Wireshark 已能解析 MLE、6LoWPAN 和 IPv6，也不能因此读取 Matter CASE 加密的应用负载。

## 把串口日志和抓包对齐

推荐为一次实验记录：

```text
T0  开始抓包
T1  设备复位或触发动作
T2  串口出现启动锚点
T3  Thread attach 开始
T4  网络层成功或失败
T5  应用操作
T6  停止抓包
```

如果设备日志没有可靠绝对时间，可以在开始与结束时制造可识别动作，例如按键、LED 或明确的本地日志标记，再用空口突发对齐。

## 常见误判

### 看到 ACK 就认为入网成功

MAC ACK 只证明某个链路层帧被相邻节点确认，不证明 MLE attach、IPv6 配置或 Matter commissioning 完成。

### 能解析 Thread 就认为能解析 Matter

Thread 解决低功耗 IPv6 网络连接；Matter 还有独立的发现、安全会话和应用交互。

### 没看到包就认为设备没发送

也可能是信道错误、距离过远、sniffer 丢帧、天线方向、捕获开始太晚或目标设备切换了网络。

### 只保留 pcap，不保留实验条件

没有信道、版本、动作时间线和设备日志的 pcap，之后很难复盘。

## 推荐实验记录

```text
capture tool:
sniffer firmware:
channel:
capture start/end:
device action:
expected stage:
last proven success:
first missing/failing stage:
serial log reference:
security material handling:
```

结论应写成“流程已通过 A，在 B 前失败”，而不是笼统写“Thread 有问题”。

参考资料：

- [OpenThread Packet Sniffing Requirements](https://openthread.io/guides/pyspinel/requirements)
- [OpenThread Packet Sniffing with Pyspinel](https://openthread.io/guides/pyspinel/sniffer)
- [Install Pyspinel](https://openthread.io/guides/pyspinel/install-pyspinel)

