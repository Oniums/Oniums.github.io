---
title: 项目与实践
date: 2026-07-28 09:00:00
layout: page
aside: false
top_img: false
---

这里展示我负责或深度参与过的代表性工作。为了保持公开边界，项目使用功能描述，不展示公司名称、产品型号、私有源码和内部实现。

<div class="project-grid">
  <article class="project-card project-card-featured">
    <p class="project-kicker">SMART HOME · 2025 - 至今</p>
    <h2>低功耗门磁与人体感知设备</h2>
    <p>面向智能家居的低功耗传感设备，覆盖 Matter over Thread 与 Zigbee 两条产品路径。负责从需求、驱动和应用开发，到入网、低功耗、OTA、状态机、双镜像构建及量产问题定位。</p>
    <div class="project-tags"><span>TL3238x</span><span>Zephyr</span><span>Matter</span><span>OpenThread</span><span>Zigbee</span><span>MCUboot</span></div>
  </article>

  <article class="project-card">
    <p class="project-kicker">SMART HOME · 2025</p>
    <h2>低功耗无线场景控制器</h2>
    <p>负责多按键无线控制设备的固件开发与量产交付，完成低功耗设计、TouchLink 配对、多生态兼容和多通道升级能力，并参与产测方案与工程文档建设。</p>
    <div class="project-tags"><span>TLSR8656</span><span>Zigbee</span><span>BLE</span><span>TouchLink</span><span>OTA</span></div>
  </article>

  <article class="project-card">
    <p class="project-kicker">SMART HOME · 2025 - 2026</p>
    <h2>24 GHz 人体存在检测设备</h2>
    <p>开发路由型人体存在检测设备，完成雷达模块接入、空间学习、干扰过滤、分区检测、无线升级与智能家居联动，支持复杂环境下的稳定检测。</p>
    <div class="project-tags"><span>TLSR8656</span><span>Zigbee Router</span><span>24 GHz Radar</span><span>BLE OTA</span></div>
  </article>

  <article class="project-card">
    <p class="project-kicker">SMART HOME · EMBEDDED EXAMPLES</p>
    <h2>安防、报警与环境感知设备</h2>
    <p>围绕门磁、PIR、报警器等设备积累 Zigbee 终端开发经验，覆盖 ZCL 数据模型、IAS Zone、属性与命令、休眠终端、上报、入网和认证测试问题定位。</p>
    <div class="project-tags"><span>TLSR8656</span><span>ZCL</span><span>IAS Zone</span><span>Sleepy End Device</span></div>
  </article>

  <article class="project-card">
    <p class="project-kicker">HVAC · 2023 - 2025</p>
    <h2>无线与有线温控器平台</h2>
    <p>参与多 MCU 温控器的固件适配和发布，负责外设、LCD 与 LVGL 界面、无线通信、模块间串口协议和软硬件联调，覆盖从项目开发到量产的完整周期。</p>
    <div class="project-tags"><span>RTL8722W</span><span>TLSR9218 / 9518</span><span>SWM341</span><span>LVGL</span><span>Wi-Fi</span><span>Zigbee</span></div>
  </article>

  <article class="project-card">
    <p class="project-kicker">EV CHARGING · 2022 - 2023</p>
    <h2>交流充电设备固件平台</h2>
    <p>负责应用架构、通信链路、运行模式、非易失存储和远程升级能力，参与现场问题诊断、生产支持与技术文档输出，并开发桌面分析工具提升报文排查效率。</p>
    <div class="project-tags"><span>STM32</span><span>Nuvoton</span><span>4G</span><span>Ethernet</span><span>CAN / RS485</span><span>IAP</span></div>
  </article>

  <article class="project-card">
    <p class="project-kicker">ENGINEERING PRACTICE</p>
    <h2>构建、诊断与交付工具</h2>
    <p>把多镜像构建、制品校验、日志分析、协议抓包和持续集成整理成可重复执行的工作流；使用 Qt、Python 与 Wireshark 辅助定位设备和通信问题。</p>
    <div class="project-tags"><span>CMake</span><span>Git</span><span>CI</span><span>Qt</span><span>Python</span><span>Wireshark</span></div>
  </article>
</div>

## 早期项目

- 基于 STM32F103、微信小程序与 Spring Boot 的智能盆栽毕业设计；
- 基于 CC2530 的智能家居实验项目；
- 微信小程序、Java 与智能合约方向的课程和个人练习。

部分早期代码保留在 [GitHub](https://github.com/Oniums)，作为学习过程的历史记录。

## 工作方法

项目之外，我持续把一次性的排障过程整理成可以复用的判断方法。公开文章会保持产品中立，并明确区分事实、推断和待验证项。
