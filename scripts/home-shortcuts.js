// Insert static links into Butterfly's home hero, including paginated home pages.
// Keeping this in Hexo avoids modifying the installed theme or relying on browser JS.
const shortcuts = `
<nav class="home-shortcuts" aria-label="工具与交互演示">
  <a class="home-shortcut" href="/tools/">
    <span class="home-shortcut-title">工具箱 <span aria-hidden="true">↗</span></span>
    <span class="home-shortcut-description">配对码 · 字节与位域 · 低功耗预算</span>
  </a>
  <a class="home-shortcut" href="/playground/commissioning/">
    <span class="home-shortcut-title">配网过程播放器 <span aria-hidden="true">▶</span></span>
    <span class="home-shortcut-description">逐步播放 Matter 配网，切换故障场景</span>
  </a>
</nav>`;

hexo.extend.filter.register("after_render:html", (html) => {
  if (!html.includes('id="site-info"') || html.includes('class="home-shortcuts"')) return html;
  return html.replace(/(<\/div>\s*)(<div id="scroll-down")/, `${shortcuts}$1$2`);
});
