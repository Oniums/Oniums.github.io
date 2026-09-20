(() => {
  // 接收 giscus 官方错误事件；不读取或替换跨域 iframe 内的身份信息。
  window.addEventListener('message', event => {
    if (event.origin !== 'https://giscus.app') return;
    const wrap = document.getElementById('giscus-wrap');
    const iframe = wrap?.querySelector('iframe');
    if (!iframe || event.source !== iframe.contentWindow) return;
    const error = event.data?.giscus?.error;
    if (typeof error !== 'string' || error.includes('Discussion not found')) return;
    wrap.hidden = true;
    let note = document.getElementById('comment-service-status');
    if (!note) {
      note = document.createElement('p'); note.id = 'comment-service-status'; note.setAttribute('role', 'status');
      note.textContent = '评论服务暂时不可用，可先通过上方链接前往 GitHub 讨论区。';
      const retry = document.createElement('button'); retry.type = 'button'; retry.textContent = '重新加载评论';
      retry.addEventListener('click', () => { note.remove(); wrap.hidden = false; iframe.src = iframe.src; });
      note.append(' ', retry); wrap.parentElement.append(note);
    }
  });
})();
