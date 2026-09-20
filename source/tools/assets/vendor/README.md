# 浏览器本地依赖

`qrcode.js` 为 qrcode-generator 1.4.4 的原样副本（MIT）。

- 上游：<https://github.com/kazuhikoarase/qrcode-generator>
- 固定发布包：<https://registry.npmjs.org/qrcode-generator/-/qrcode-generator-1.4.4.tgz>
- 来源文件：`package/qrcode.js`
- 文件 SHA-256：`18ae399f81182bc9de916e9c77b195df20cc58d6f2d55a62b085a299f1bf1780`
- 许可：[LICENSE.txt](LICENSE.txt)

该文件只在本地绘制 QR 模块，不使用远端二维码服务。升级时需重新核验许可、二维码解码回读与无网络请求行为。

## 机器人头像

`dicebear.mjs` 是 DiceBear 的本地 ESM bundle，不调用在线头像 API。

- 上游：<https://github.com/dicebear/dicebear>
- npm 固定版本：`@dicebear/core@9.4.3`、`@dicebear/bottts@9.4.3`、`@dicebear/bottts-neutral@9.4.3`
- 打包器：`esbuild@0.25.12`，参数 `--bundle --format=esm --minify --legal-comments=eof`
- 入口导出：`createAvatar` from `@dicebear/core`、`* as bottts` from `@dicebear/bottts`、`* as botttsNeutral` from `@dicebear/bottts-neutral`
- 许可：[dicebear-LICENSE.txt](dicebear-LICENSE.txt)，包含 core 的 MIT 与两种 Bottts 风格的原包许可。
- bundle SHA-256：`d7aa742c36e8bce0c8bc26987a0d4177c5b0d7ea5c9a384b1eea411fd8e6e949`

在独立临时目录安装以上固定版本并创建入口后打包；不覆盖二维码依赖。升级时核对确定性输出、SVG/PNG 下载、许可和零外部请求。头像外观与固定库版本绑定，升级可能改变同名生成结果。
