// 每一步保存完整快照；回看时不依赖此前是否播放过某个事件。
const overview = "/posts/matter-over-thread-zigbee-commissioning-comparison/";
const initial = { network: "尚未加入", fabric: "尚未配置", session: "尚未建立" };
const pase = { ...initial, session: "PASE 临时会话" };
const pending = { ...pase, fabric: "待提交 · Fail-safe 中" };
const attached = { ...pending, network: "已加入 · CHILD" };
const secure = { ...attached, session: "CASE 运行会话" };
const complete = { ...secure, fabric: "已提交" };

function step(id, title, short, route, transport, message, state, explanation, proven, remaining, technical, log, extra = {}) {
  return { id, title, short, route, transport, message, state, explanation, proven, remaining, technical, log, article: overview, kind: "配网阶段", user: "正在添加设备…", ...extra };
}

export const normalSteps = [
  step("scan", "从一张二维码开始", "扫码", "none", "local", "扫描设备标签 → 读取 onboarding payload", initial,
    "手机获得寻找设备和建立临时安全会话所需的信息。此时只是准备好出发，还没有无线连接。",
    "已经读取配网信息。", "找到正在广播的目标设备。",
    "二维码包含 Discriminator、Setup Passcode 等配网信息；它不是 Thread Network Key。本演示假定手机已能取得目标网络的 Dataset，不展示真实配网凭据。",
    ["[APP] Onboarding payload read (values omitted)"], { user: "准备添加新设备", kind: "准备" }),
  step("ble", "蓝牙先搭起一座桥", "BLE / BTP", "ble", "ble", "发现广播 → GAP / GATT → BTP", initial,
    "手机找到设备并建立蓝牙传输通道。上方紫色路径直接连接手机和设备，边界路由器不参与这段通信。",
    "BLE 连接和 Matter BLE 传输已经准备好。", "通过配网码建立 PASE 安全会话。",
    "这里合并展示广播匹配、GAP 连接、GATT 服务发现、订阅 indication 和 BTP 握手。仅有 BLE connected 日志不能证明后面的步骤已经完成。",
    ["[BLE] Connection established", "[GATT] Matter service discovered; indication subscribed", "[BTP] Transport ready"], { article: "/posts/ble-gatt-connection-basics/" }),
  step("pase", "先建立临时的信任", "PASE", "ble", "ble", "PBKDF parameters ↔ PASE handshake", pase,
    "手机与设备利用配网码建立加密会话，后续配置可以在这条临时安全通道里传输。",
    "双方已建立 PASE 临时安全会话。", "开启失败保护，并核验设备证明材料。",
    "PASE 使用配网口令参与密钥协商，不是把口令直接发给设备。PASE 成功不等于设备证明通过，也不等于已加入 Fabric。",
    ["[PASE] Secure session established"]),
  step("failsafe", "给这次配置留条退路", "Fail-safe", "ble", "ble", "ArmFailSafe → response", pase,
    "设备开启配网失败保护。如果这轮配置最终没有完成，未提交的变更需要按 Fail-safe 规则回滚。",
    "本轮配置受 Fail-safe 保护。", "检查设备身份，然后配置运行凭据。",
    "此步骤也合并了基础信息读取、配网能力检查与监管配置等准备动作。真实控制器可能延长 Fail-safe；播放器时间不代表真实计时器。",
    ["[GC] Fail-safe armed", "[IM] Basic information and commissioning configuration ready"]),
  step("attestation", "确认设备的出厂身份", "设备证明", "ble", "ble", "DAC / PAI / CD → Attestation verification", pase,
    "手机检查设备证明材料和挑战响应，确认设备的出厂身份。它和下一步加入家庭的运行身份是两套不同的事情。",
    "本场景的设备证明检查通过。", "为设备配置当前 Fabric 的运行证书。",
    "Device Attestation 检查 DAC、PAI、Certification Declaration 及签名挑战等材料。本演示合并请求与验证过程，不展示任何证书内容。",
    ["[ATTEST] Certificate chain and declaration checked", "[ATTEST] Challenge signature verified"], { article: "/posts/matter-certificate-relationships/" }),
  step("noc", "给设备一张家庭通行证", "运行身份", "ble", "ble", "CSR → AddTrustedRootCertificate → AddNOC", pending,
    "设备生成运行密钥并提供 CSR，配网方为它配置运行证书。此时身份仍待提交，还不能说配网已经完成。",
    "运行凭据已安装，Fabric 仍处于待提交状态。", "把设备连接到目标 Thread 网络。",
    "NOC 属于 Matter Fabric 的运行身份。它不是 Thread 网络密钥；AddNOC 成功也不能证明后续的网络附着或 CASE 成功。",
    ["[OC] CSR generated; trusted root installed", "[OC] AddNOC accepted; fabric pending"], { article: "/posts/matter-certificate-relationships/" }),
  step("dataset", "把网络配置交给设备", "网络配置", "ble", "ble", "AddOrUpdateThreadNetwork → ConnectNetwork", pending,
    "手机通过现有安全通道下发目标 Thread 网络配置，并请求设备连接。保存了配置，还要由设备真正去寻找并加入网络。",
    "设备已接受 Thread Dataset，正在执行连接请求。", "观察 Thread 角色是否成为 CHILD。",
    "本场景采用配网方已经持有目标 Dataset 的路径，未展开可选的 ScanNetworks。此处仅表示 ConnectNetwork 请求已发出，成功响应要等连接结果。",
    ["[NC] Thread dataset accepted (values omitted)", "[NC] ConnectNetwork requested; attach pending"]),
  step("attach", "终于，加入 Thread 网络", "Thread 附着", "thread", "thread", "MLE attach ↔ Parent / Child exchange", attached,
    "设备通过自己的无线收发器寻找父节点并完成附着，成为 Thread Child。下方绿色路径现在有了网络基础。",
    "设备已成为 CHILD，目标 Thread 网络附着成功。", "注册服务，让手机能找到设备的运行地址。",
    "图中边界路由器同时作为父节点，仅代表本示例拓扑；父节点也可以是其他 Thread Router。CHILD 证明附着成功，不自动证明跨网段 IPv6 可达或 Matter 已可用。",
    ["[MLE] Parent selected; child attachment complete", "[THREAD] Role: CHILD", "[NC] ConnectNetwork completed successfully"], { article: "/posts/thread-foundations/" }),
  step("srp", "把服务地址登记下来", "SRP 注册", "thread", "thread", "SRP Update → SRP Server acknowledgement", attached,
    "设备向 SRP Server 登记主机和运行服务。本例由边界路由器提供 SRP 服务，并向家庭局域网代理发布。",
    "SRP Server 已接受本次主机与运行服务注册。", "确认手机侧也能解析到这个运行服务。",
    "本例将 SRP Server 与 Advertising Proxy 放在边界路由器上。SRP 接受注册和手机侧 DNS-SD 解析成功是不同证据。",
    ["[SRP] Host and operational service registered", "[SRP] Server accepted update"]),
  step("discovery", "在 IP 网络上重新找到你", "服务发现", "discovery", "ip", "DNS-SD query ↔ operational service resolution", attached,
    "手机在家庭 IP 网络上查找设备的运行服务，获得地址和端口。接下来才会使用运行身份建立新的安全会话。",
    "手机已解析到目标运行服务的地址和端口。", "通过这些地址实际连通设备并建立 CASE。",
    "本例通过 mDNS / DNS-SD 发现由边界路由器代理发布的运行服务。解析结果不等于地址一定可达，旧缓存或路由问题仍可能让后续连接失败。",
    ["[DNS-SD] Operational service resolved", "[DNS-SD] Peer address and port available"], { article: "/posts/matter-secondary-commissioning-bcm-ecm-dns-sd/" }),
  step("case", "用运行身份重新握手", "CASE", "ip", "ip", "CASE Sigma1 ↔ Sigma2 ↔ Sigma3", secure,
    "手机和设备通过 IP 网络，用运行证书建立 CASE 会话。边界路由器负责转发 IP 数据，不是这条 Matter 安全会话的终点。",
    "CASE 会话建立成功，本次运行通信路径可用。", "发送 CommissioningComplete，提交本轮配网。",
    "图中的绿色消息经过边界路由器，但 CASE 的安全端点是 Controller 与设备。蓝牙后续何时断开由实现决定，这里只展示当前消息的承载。",
    ["[CASE] Sigma exchange complete", "[CASE] Operational secure session established"]),
  step("complete", "配网事务，现在才完成", "配网完成", "ip", "ip", "CommissioningComplete → success response", complete,
    "手机在 CASE 会话上发送配网完成命令。设备提交这次配置、解除 Fail-safe，本轮 Matter 配网正式收尾。",
    "CommissioningComplete 成功，待提交的 Fabric 已提交。", "再验证业务读取、订阅和实际状态更新。",
    "此处表示协议配网流程完成；App 显示在线、订阅恢复和长期稳定性仍需要各自的证据。下一步作为配网后的业务验证单独演示。",
    ["[GC] CommissioningComplete accepted", "[FABRIC] Pending configuration committed", "[GC] Fail-safe disarmed"], { user: "设备已添加，正在同步状态", kind: "配网完成" }),
  step("subscribe", "收到第一份业务数据", "业务验证", "ip", "ip", "SubscribeRequest → ReportData → SubscribeResponse", complete,
    "控制器建立订阅并收到初始属性报告。这条演示现在走到了设备数据可以被应用使用的阶段。",
    "本轮订阅建立，初始属性报告已收到。", "长期在线、掉线恢复和真实硬件表现仍需持续验证。",
    "这里合并了订阅请求、初始 ReportData、状态响应与 SubscribeResponse 等交换。业务验证不属于 CommissioningComplete 之前的配网步骤，也不代替耐久性测试。",
    ["[IM] SubscribeRequest sent", "[IM] Initial ReportData received and acknowledged", "[IM] SubscribeResponse received; subscription active"], { user: "设备已就绪 · 状态已同步", kind: "业务验证" })
];

const threadFailure = step("attach-missing", "配置收到了，网络没加入", "附着重试", "thread", "thread", "MLE Parent Request → 未获得可用父节点", { ...pending, network: "DETACHED · 重试中" },
  "这次设备一直没有完成父节点选择。手机已经交出了网络配置，但设备还没真正加入目标网络。",
  "Dataset 已接受；当前仍是 DETACHED。", "核对目标网络、无线覆盖和父节点交换证据。",
  "教学条件：父节点选择未完成。单看 DETACHED 不能断言是密钥错误、干扰或边界路由器故障；需要设备日志与空口证据进一步区分。",
  ["[MLE] Parent request sent; no usable parent selected", "[THREAD] Role: DETACHED; attach retry pending"],
  { fault: true, normalIndex: 7, kind: "故障 · 重试", user: "正在连接网络…" });
const threadTimeout = { ...threadFailure, id: "attach-timeout", title: "本次网络连接超时", short: "连接超时", kind: "故障 · 结束", user: "添加失败 · 网络连接超时", state: { ...pending, network: "未加入 · 连接超时" }, message: "ConnectNetwork → network connection timeout", explanation: "本轮连接尝试结束，设备没有进入 CHILD。流程停在网络附着，后面的 SRP、CASE 和配网完成都还没有发生。", proven: "本次未观察到附着成功，连接请求以超时结束。", remaining: "先定位附着失败原因；本页未继续演示 Fail-safe 到期后的回滚。", log: ["[THREAD] Attach retry still unsuccessful", "[NC] Network connection timed out", "[DEMO] Stop before fail-safe expiry / rollback"], terminal: true };
const discoveryFailure = step("discovery-missing", "设备入网了，手机却找不到", "发现重试", "discovery", "ip", "DNS-SD query → 未获得目标运行服务结果", attached,
  "设备保持 CHILD，SRP 注册也已被接受。但手机侧没有解析到运行服务，无法推进到本例的 CASE 建连。",
  "设备已加入 Thread，SRP 注册成功；手机侧发现仍未完成。", "对齐 SRP、代理发布和手机侧 DNS-SD 的证据。",
  "教学条件：手机未解析到目标运行服务。这不能单凭设备日志归因于手机或边界路由器；需分别检查服务注册、广告代理、局域网发现路径与解析结果。",
  ["[DNS-SD] Operational lookup pending", "[DNS-SD] Query retried; target service unresolved"],
  { fault: true, normalIndex: 9, kind: "故障 · 重试", article: "/posts/matter-ble-connected-stale-discovery-pase-analysis/" });
const discoveryTimeout = { ...discoveryFailure, id: "discovery-timeout", title: "发现超时，配网仍未完成", short: "发现超时", kind: "故障 · 结束", user: "添加失败 · 未能找到设备", message: "Operational discovery → timeout", explanation: "这次超时发生在运行服务发现阶段。设备的 Thread 网络状态没有随界面报错自动变成离线，Fabric 仍待提交。", proven: "发现请求超时，尚未建立 CASE，也未提交配网。", remaining: "定位发现路径；稍后的 Fail-safe 回滚可能改变状态，本页止于当前时刻。", log: ["[DNS-SD] Operational discovery timed out", "[CASE] Not started in this scenario", "[DEMO] Stop before fail-safe expiry / rollback"], terminal: true };

export const scenarios = {
  normal: { label: "正常配网", description: "手机已持有目标 Thread 网络配置。沿着主干流程，看设备从等待配网走到业务可用。", steps: normalSteps },
  thread: { label: "Thread 加入失败", description: "教学故障：设备已接受网络配置，但始终未选中可用父节点。观察它与正常流程在哪一步分开。", steps: [...normalSteps.slice(0, 7), threadFailure, threadTimeout] },
  discovery: { label: "服务发现异常", description: "教学故障：Thread 已加入、SRP 已注册，但手机侧解析不到目标运行服务。入网成功，仍可能添加失败。", steps: [...normalSteps.slice(0, 9), discoveryFailure, discoveryTimeout] }
};
