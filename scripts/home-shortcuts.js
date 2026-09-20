// Insert static links into Butterfly's home hero, including paginated home pages.
// Keeping this in Hexo avoids modifying the installed theme or relying on browser JS.
const shortcuts = `
<nav class="home-shortcuts" aria-label="工具与交互演示">
  <a class="home-shortcut" href="/tools/">
    <span class="home-shortcut-title">工具箱 <span aria-hidden="true">↗</span></span>
    <span class="home-shortcut-description">工程工具与趣味探索 · 头像、天气、串口</span>
  </a>
  <a class="home-shortcut" href="/playground/commissioning/">
    <span class="home-shortcut-title">配网过程播放器 <span aria-hidden="true">▶</span></span>
    <span class="home-shortcut-description">逐步播放 Matter 配网，切换故障场景</span>
  </a>
  <a class="home-shortcut" href="/playground/radar/">
    <span class="home-shortcut-title">雷达交互课堂 <span aria-hidden="true">↗</span></span>
    <span class="home-shortcut-description">4 章 16 节 · 从回波到距离谱</span>
  </a>
  <a class="home-shortcut" href="/playground/presence/">
    <span class="home-shortcut-title">人存实验室 <span aria-hidden="true">↗</span></span>
    <span class="home-shortcut-description">拖动人物与风扇 · 从点云到有人 / 无人</span>
  </a>
  <a class="home-shortcut" href="/playground/iss/">
    <span class="home-shortcut-title">空间站追踪 <span aria-hidden="true">↗</span></span>
    <span class="home-shortcut-description">跟随 ISS · 看位置、高度与飞行轨迹</span>
  </a>
  <a class="home-shortcut" href="/tools/weather/">
    <span class="home-shortcut-title">桌面天气站 <span aria-hidden="true">↗</span></span>
    <span class="home-shortcut-description">选择一座城市 · 看天空的下一步</span>
  </a>
</nav>`;

hexo.extend.filter.register("after_render:html", (html) => {
  if (!html.includes('id="site-info"') || html.includes('class="home-shortcuts"')) return html;
  return html.replace(/(<\/div>\s*)(<div id="scroll-down")/, `${shortcuts}$1$2`);
});
