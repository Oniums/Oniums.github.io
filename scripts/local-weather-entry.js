hexo.extend.filter.register('after_render:html', html => {
  if (!html.includes('id="nav"')) return html;
  return html.replace('<div id="menus">', '<div id="menus"><button id="local-weather-toggle" type="button" title="授权定位后显示当地天气；坐标取两位小数后发送给 Open-Meteo" aria-controls="local-weather" aria-expanded="false">本地天气</button>');
});
