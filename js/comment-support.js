(() => {
  const reload = () => {
    const wrap = document.getElementById('giscus-wrap');
    const iframe = wrap?.querySelector('iframe');
    if (!iframe) { wrap?.scrollIntoView({ block: 'center' }); return; }
    document.getElementById('comment-service-status')?.remove();
    wrap.hidden = false; iframe.src = iframe.src;
  };
  document.addEventListener('click', event => { if (event.target.closest('#comment-reload')) reload(); });
  // 接收 giscus 官方错误事件；不读取或替换跨域 iframe 内的身份信息。
  window.addEventListener('message', event => {
    if (event.origin !== 'https://giscus.app') return;
    const wrap = document.getElementById('giscus-wrap');
    const iframe = wrap?.querySelector('iframe');
    if (!iframe || event.source !== iframe.contentWindow) return;
    const discussionURL = event.data?.giscus?.discussion?.url;
    if (typeof discussionURL === 'string') {
      try {
        const url = new URL(discussionURL);
        if (url.origin === 'https://github.com' && /^\/Oniums\/Oniums\.github\.io\/discussions\/\d+\/?$/i.test(url.pathname) && !url.username && !url.password) {
          const link = document.getElementById('comment-manage');
          if (link) link.href = url.origin + url.pathname;
        }
      } catch { /* 忽略无效元数据，保留当前文章的讨论搜索入口。 */ }
    }
    const error = event.data?.giscus?.error;
    if (typeof error !== 'string' || error.includes('Discussion not found')) return;
    wrap.hidden = true;
    let note = document.getElementById('comment-service-status');
    if (!note) {
      note = document.createElement('p'); note.id = 'comment-service-status'; note.setAttribute('role', 'status');
      note.textContent = '评论服务暂时不可用，可先通过上方链接前往 GitHub 讨论区。';
      const retry = document.createElement('button'); retry.type = 'button'; retry.textContent = '重新加载评论';
      retry.addEventListener('click', reload);
      note.append(' ', retry); wrap.parentElement.append(note);
    }
  });
})();
