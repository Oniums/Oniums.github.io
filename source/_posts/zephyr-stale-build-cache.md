---
title: Zephyr 构建仍引用旧 SDK：缓存污染的定位与修复
date: 2026-07-28 14:30:00
categories:
  - 问题排查
tags:
  - Zephyr
  - CMake
  - west
  - 构建系统
---

切换 Zephyr SDK、临时工作区或 Git worktree 后，如果构建日志仍然引用已经删除的目录，问题通常不在源码，而在复用的构建目录。先确认失败阶段和缓存来源，再清理明确的生成目录，比反复修改代码更有效。

<!-- more -->

## 典型现象

这类问题经常出现在以下场景：

- 为验证一个补丁，临时复制了一份 SDK；
- 在多个 Zephyr 版本或厂商 SDK 之间切换；
- 使用 worktree 隔离实验，但沿用了原来的输出目录；
- 临时目录已经删除，普通构建仍报其中的路径不存在；
- `west build -p always` 在真正编译前就失败。

最值得关注的不是最后一行“build failed”，而是第一条真实错误。如果失败发生在 CMake 配置或 pristine 阶段，编译器可能还没有处理任何产品源码。

## 为什么缓存会记住旧路径

Zephyr 构建系统基于 CMake。首次配置时，CMake 会在构建目录生成 `CMakeCache.txt`，保存配置项和依赖路径；`build.ninja`、生成脚本和子目录中也可能写入绝对路径。

可以把构建目录理解成一次配置的快照：

```text
源代码 + Board + SDK + Toolchain + Kconfig
                  │
                  ▼
            CMake build tree
```

只替换源代码或环境变量，并不会保证已有 build tree 自动变成另一套配置。Zephyr 官方文档也说明，首次选中的 Zephyr package 会被后续构建沿用；切换安装位置时需要 pristine build。

## 按阶段定位

### 1. 找到第一条真实错误

先区分失败发生在哪个阶段：

```text
pristine / clean
  -> CMake configure
  -> devicetree / Kconfig
  -> compile
  -> link
  -> package
```

如果日志在 `pristine.cmake`、`find_package(Zephyr)` 或生成 Ninja 文件附近失败，就不应该先从业务代码搜索根因。

### 2. 检查缓存中的路径

在明确的构建目录中检查关键项：

```bash
rg 'ZEPHYR_BASE|Zephyr_DIR|BOARD_DIR|TOOLCHAIN_ROOT' \
  build/app/CMakeCache.txt
```

重点确认：

- 路径是否存在；
- 是否仍指向临时目录；
- Board 和工具链是否属于当前环境；
- 当前命令使用的输出目录是否与预期一致。

### 3. 排除“旧产物假成功”

一些构建包装脚本会在失败后继续列出已有的 `.elf`、`.bin` 或 `.map`。文件存在只表示曾经构建过，不表示本次成功。

至少核对：

- 构建命令的退出码；
- 日志是否完整经过 link 和 package；
- 产物修改时间是否晚于本次开始时间；
- 版本、尺寸或哈希是否来自当前输入。

## 修复方法

如果缓存明确绑定到已经失效的 SDK，删除具体的生成目录，然后重新配置：

```bash
cmake -E remove_directory build/app
west build -b <board> -d build/app path/to/app
```

执行删除前应确认目标是项目内的生成目录，不要对工作区根目录使用宽泛的递归删除。

如果构建目录仍能正常执行 pristine，也可以使用：

```bash
west build -p always -b <board> -d build/app path/to/app
```

两种方式的区别在于：当已有 pristine 脚本本身就引用失效路径时，显式移除生成目录更直接。

## 如何避免再次发生

为不同 SDK、Board 和构建类型分配不同目录：

```text
build/
├── app-main-release/
├── app-main-debug/
└── app-sdk-experiment/
```

进一步可以在构建入口加入保护：

1. 输出实际 `ZEPHYR_BASE`、Board 和 Toolchain；
2. 检测缓存路径是否存在；
3. SDK 身份变化时拒绝增量构建；
4. 实验构建必须指定独立输出目录；
5. 成功摘要只在命令退出码为零后生成。

## 适用边界

清理缓存只能解决构建树绑定错误。重新配置后仍可能出现真正的源码、Kconfig、Devicetree 或链接问题，应把它们视为下一阶段的独立故障。

参考资料：

- [Zephyr Application Development](https://docs.zephyrproject.org/latest/develop/application/index.html)
- [Zephyr west build](https://docs.zephyrproject.org/latest/develop/west/build-flash-debug.html)
- [Zephyr CMake Package](https://docs.zephyrproject.org/latest/build/zephyr_cmake_package.html)

