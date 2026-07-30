---
title: SmartThings Edge Driver 发布实战：从本地打包到 Channel 邀请链接
date: 2026-07-30 09:30:00
categories:
  - 生态适配
tags:
  - Zigbee
  - SmartThings
  - Edge Driver
  - Lua
  - CLI
---

写完 SmartThings Edge Driver 只是第一步。要让测试者通过一个链接安装 Driver，还要完成云端上传、Channel 版本绑定、Hub 注册、Driver 安装和邀请创建。这些动作处在不同层级，任何一步“成功”都不能替代下一步验证。

<!-- more -->

## 先理解完整链路

一条可复用的发布链是：

```text
本地源码
  -> fingerprint / profile / handler 静态检查
  -> 本地 build-only 打包
  -> 上传 Driver，产生 Driver ID 与 Version
  -> 创建或选择 Driver Channel
  -> 把指定 Driver Version 分配到 Channel
  -> 将测试 Hub 注册到 Channel
  -> 从 Channel 安装 Driver 到 Hub
  -> 创建 Channel Invitation
  -> 通过真实设备完成运行验证
```

其中有三个容易混淆的对象：

| 对象 | 作用 | 是否秘密 |
|---|---|---|
| PAT / OAuth Token | 允许 CLI 调用 SmartThings API | 是 |
| Driver Channel | 固定并分发一组 Driver 版本 | 通常不公开其管理信息 |
| Invitation URL | 邀请其他账号加入 Channel | 按分享范围管理 |

邀请链接不是登录 Token。创建邀请后，不需要把 PAT 一起发给测试者；PAT 过期也不等于已经创建的邀请立即失效。

## CLI 认证：PAT 适合临时操作

SmartThings CLI 默认支持浏览器 OAuth 登录，也支持使用 Personal Access Token。当前新建 PAT 的有效期是 24 小时，不能设置成永久 Token。

在临时测试或无图形界面的开发机上，可以把 PAT 放进 CLI 配置：

```yaml
default:
  token: "<YOUR_PAT>"
```

配置文件通常位于：

```text
~/.config/@smartthings/cli/config.yaml
```

限制文件权限：

```bash
chmod 600 ~/.config/@smartthings/cli/config.yaml
```

不要把真实 Token 写进 Git、脚本、截图或文章，也尽量不要通过 `--token` 直接放在命令行中，以免进入 Shell history。出现 `401 Unauthorized` 时，先检查 Token 是否已过期，以及创建 PAT 时是否选择了所需 Scope。管理 Driver Channel 时，至少要注意官方文档要求的 Channel 读写权限。

如果是长期运行的服务集成，应使用 OAuth 2.0 和刷新机制，而不是定期手工更换 PAT。对于偶尔执行一次的 CLI 发布任务，短期 PAT 更简单，但要接受每天重新签发的限制。

## 设备身份：允许别名，但不要放宽匹配

实际项目中，同一类硬件可能因固件批次、销售渠道或身份迁移而报告不同 Model。此时可以让多个精确 fingerprint 指向同一个 Profile：

```yaml
zigbeeManufacturer:
  - id: "example/motion-a"
    manufacturer: "Example"
    model: "MOTION-A"
    deviceProfileName: "motion-light-battery"
    deviceLabel: "Motion sensor"

  - id: "example/motion-b"
    manufacturer: "Example"
    model: "MOTION-B"
    deviceProfileName: "motion-light-battery"
    deviceLabel: "Motion sensor"
```

这表示两个身份共享同一组平台能力，不表示它们的 Zigbee 行为必然完全相同。至少要逐项比较：

- Endpoint、Device ID 与 Server/Client Cluster；
- Attribute 类型、单位、倍率和无效值；
- 上报方式、Reporting 配置与休眠行为；
- 厂商自定义 Cluster、Attribute 和 Command；
- 首次加入、rejoin、重启和恢复出厂行为。

Sub-driver 的 `can_handle` 也要覆盖同一组身份，并同时检查 Manufacturer 和 Model：

```lua
local supported_models = {
  ["MOTION-A"] = true,
  ["MOTION-B"] = true,
}

local function can_handle(_, _, device)
  return device:get_manufacturer() == "Example"
    and supported_models[device:get_model()] == true
end
```

只检查 Model、只检查 Manufacturer，或让 fingerprint 与 `can_handle` 使用不同的身份集合，都会造成“选中了 Profile，却没有进入预期 Handler”的隐蔽故障。

## Profile 只声明真实支持的能力

一个运动传感器 Profile 可能包含：

```yaml
name: motion-light-battery
components:
  - id: main
    capabilities:
      - id: motionSensor
        version: 1
      - id: illuminanceMeasurement
        version: 1
      - id: battery
        version: 1
    categories:
      - name: MotionSensor
```

如果 Driver 还支持检测保持时间、照度补偿等参数，可以通过 Preference 或自定义 Capability 暴露，但必须确认：

1. Driver 能把 App 命令正确转换成 Zigbee Write 或 Command；
2. 设备会接受该值；
3. Read Back 或后续 Report 能校正平台状态；
4. 参数范围和单位与固件一致。

UI 中出现一个字段，只证明 Profile 被平台接受，不证明设备端功能已经闭环。

## 本地门禁：先打包，不上传

在执行任何云端写操作前，先完成本地检查：

```bash
luac -p src/init.lua
luac -p src/sub_drivers/example/init.lua
```

再检查 YAML、JSON、fingerprint、Profile 和 Handler 的一致性。最关键的交叉关系包括：

```text
fingerprint.deviceProfileName -> profiles/<name>.yml
fingerprint Manufacturer/Model -> can_handle 支持集合
profile capability -> 默认 Handler 或自定义 Handler
config.yml permissions -> 实际使用的 Zigbee Cluster
```

SmartThings CLI 的无上传构建命令是：

```bash
smartthings edge:drivers:package \
  --build-only /tmp/example-driver.zip \
  <driver-directory>
```

注意命令中的 `drivers` 是复数。`--build-only` 只生成 Zip，用于验证目录和包结构，不会创建云端 Driver 版本。

本地打包通过仍然不能证明：

- fingerprint 能匹配真实设备；
- Hub 上能加载 Driver；
- Zigbee 上报能转成正确 Capability event；
- App 下发能到达设备；
- rejoin、重启和低功耗场景正常。

## 上传 Driver

确认本地门禁通过后，再执行上传：

```bash
smartthings edge:drivers:package --json <driver-directory>
```

保存返回结果中的：

```text
Driver ID
Driver Version
```

同一个 Driver 每次重新打包上传都会产生新 Version。后续给 Channel 分配时要使用这次返回的准确版本，不要只记 Driver ID。

执行云端写操作前，建议先列出现有资源：

```bash
smartthings edge:drivers --json
smartthings edge:channels --json
smartthings devices --type=HUB --json
```

这样可以避免重复创建 Channel，也能确认当前账号、区域和 Hub 是否正确。

## 创建 Channel 并绑定版本

第一次发布时创建 Driver Channel：

```bash
smartthings edge:channels:create
```

CLI 会交互式询问名称、描述和服务条款链接。也可以先准备 JSON/YAML，再使用 `--input`。

将刚上传的指定版本分配到 Channel：

```bash
smartthings edge:channels:assign \
  <DRIVER_ID> \
  <DRIVER_VERSION> \
  --channel <CHANNEL_ID>
```

Channel 锁定的是一个具体 Driver Version。以后上传新版本，不会自动替换 Channel 中的旧版本，也不会自动更新 Hub 上已安装的版本。

如果创建 Channel 时遇到 `502` 或响应体为空，不要立即连续重试。先重新查询：

```bash
smartthings edge:channels --json
```

确认服务端是否已经创建成功，再决定是否重试，避免产生重复 Channel。

## Enroll Hub 并安装 Driver

先把自己的测试 Hub 注册到 Channel：

```bash
smartthings edge:channels:enroll \
  <HUB_ID> \
  --channel <CHANNEL_ID>
```

然后从该 Channel 安装 Driver：

```bash
smartthings edge:drivers:install \
  <DRIVER_ID> \
  --hub <HUB_ID> \
  --channel <CHANNEL_ID>
```

这两步解决的问题不同：

- `enroll`：让 Hub 能看到 Channel；
- `install`：把 Channel 中的某个 Driver 安装到 Hub。

只有 Channel 中存在正确版本、Hub 已注册、Driver 已安装，真实设备加入时才有机会匹配该 Driver。

更新版本时，可以重新 Assign 并 Install，也可以使用官方提供的组合方式：

```bash
smartthings edge:drivers:package \
  <driver-directory> \
  --install \
  --channel <CHANNEL_ID> \
  --hub <HUB_ID>
```

组合命令更方便，拆分命令则更适合首次发布和故障定位，因为每一步的输入与结果更清楚。

## 生成并核对邀请链接

为指定 Channel 创建邀请：

```bash
smartthings edge:channels:invites:create \
  --channel <CHANNEL_ID>
```

CLI 会根据交互选项创建 Invitation，并返回分享 URL。创建后再查询一次：

```bash
smartthings edge:channels:invites \
  --channel <CHANNEL_ID>
```

核对邀请是否存在、状态是否符合预期、URL 是否对应目标 Channel。不要只以“命令没有报错”作为成功证据。

收到链接的测试者通常需要：

1. 打开 Invitation URL 并登录 Samsung Account；
2. 接受邀请；
3. 选择自己的 Hub 加入 Channel；
4. 在可用 Driver 中选择并安装；
5. 在 SmartThings App 中重新添加或迁移目标设备。

第三方 Edge Driver 不等于 SmartThings 官方审核或认证 Driver。邀请页可访问、Driver 可安装，也不能替代真实设备验证和正式生态认证。

## 验证结果必须分层

建议用下面的矩阵记录结果：

| 层级 | 最小证据 | 能证明什么 |
|---|---|---|
| 静态 | Lua、YAML、JSON 检查通过 | 文件可解析、引用基本一致 |
| 本地构建 | `--build-only` 成功生成 Zip | Driver 包结构可构建 |
| 云端上传 | 返回 Driver ID 与 Version | 云端接受该版本 |
| Channel | 查询到准确 Driver Version | 目标版本已进入分发通道 |
| Hub | 安装列表中存在 Driver | Driver 已部署到目标 Hub |
| 匹配 | Live log 显示目标设备选中 Driver | fingerprint 与 Handler 生效 |
| 上行 | 运动、照度、电量事件正确 | Zigbee 到 Capability 路径成立 |
| 下行 | 参数写入、响应与 Read Back 正确 | Capability 到 Zigbee 路径成立 |
| 稳定性 | 重启、rejoin、休眠恢复通过 | 生命周期和低功耗行为可用 |

查看 Hub 运行日志可使用：

```bash
smartthings edge:drivers:logcat --hub-address=<HUB_IP>
```

日志公开前要删除设备 EUI、Hub 地址、Location、账号信息、Channel/Driver UUID 和任何网络密钥。

## 发布前隐私清单

提交 Driver 或技术文章前，至少搜索：

- PAT、OAuth Client Secret、Refresh Token；
- Invitation URL 与短码；
- Hub、Location、Channel、Driver、Device UUID；
- 设备 EUI、Network Key、Install Code；
- 内部仓库地址、本机绝对路径和公司环境名称；
- 未公开产品型号、固件版本和测试记录。

示例应使用 `<CHANNEL_ID>`、`<DRIVER_ID>`、`<HUB_ID>` 等占位符。邀请链接虽然不是账号 Token，但获得链接的人可能因此访问测试 Channel，仍应按预期受众控制传播。

## 最后形成可重复的发布节奏

一次稳妥的迭代可以压缩为：

```text
精确身份匹配
  -> 本地静态检查
  -> build-only
  -> 上传新 Version
  -> Channel 重新 Assign
  -> Hub 重新 Install
  -> Live log + 真实设备回归
  -> 最后才分享 Invitation URL
```

把每一步的 ID、Version、命令结果和验证结论保存在私有发布记录中；公开文章只保留方法、占位符和经过脱敏的错误现象。这样既能让发布流程可追溯，也不会把认证凭证和测试环境暴露出去。

官方资料：

- [SmartThings CLI 与认证](https://developer.smartthings.com/docs/sdks/cli)
- [Driver Channels](https://developer.smartthings.com/docs/devices/hub-connected/driver-channels)
- [接受共享 Channel 并安装 Driver](https://developer.smartthings.com/docs/devices/hub-connected/enroll-in-a-shared-channel)
- [Authorization and Permissions](https://developer.smartthings.com/docs/getting-started/authorization-and-permissions)
- [Edge Driver 结构](https://developer.smartthings.com/docs/devices/hub-connected/driver-components-and-structure)
