// 管理操作交给 GitHub 原生权限；元数据返回后链接会定位到当前文章讨论。
hexo.extend.filter.register('after_render:html', html => {
  if (!html.includes('id="giscus-wrap"')) return html;
  const canonical = html.match(/<link rel="canonical" href="([^"]+)"/);
  let search = '';
  try { search = encodeURIComponent(`in:title "${new URL(canonical[1]).pathname.replace(/^\//, '')}"`); } catch {}
  const url = `https://github.com/Oniums/Oniums.github.io/discussions${search ? '?discussions_q=' + search : ''}`;
  return html.replace('<div class="comment-wrap">', `<p class="comment-avatar-tip">评论公开可见，留言需要登录 GitHub。<a href="/tools/avatar/">机器人头像生成器</a>。</p><div class="comment-actions"><a id="comment-manage" href="${url}" target="_blank" rel="noopener noreferrer">管理 / 删除评论（GitHub） ↗</a><button id="comment-reload" type="button">刷新评论</button></div><p class="comment-manage-help">编辑或删除：打开对应讨论，在评论右上角点击 ⋯ → Edit / Delete。可用操作由 GitHub 根据账号权限决定；删除后返回这里刷新评论。</p><div class="comment-wrap">`);
});
