// 在主题评论区外提供头像入口，保留 giscus 自身的 GitHub 身份与头像。
hexo.extend.filter.register('after_render:html', html => {
  if (!html.includes('id="giscus-wrap"')) return html;
  return html.replace('<div class="comment-wrap">', '<p class="comment-avatar-tip">评论公开可见，留言需要登录 GitHub。想换个机器人头像？<a href="/tools/avatar/">生成并下载头像</a>，再到 GitHub 个人资料中设置。<a href="https://github.com/Oniums/Oniums.github.io/discussions" target="_blank" rel="noopener noreferrer">也可前往 GitHub 讨论区</a>。</p><div class="comment-wrap">');
});
