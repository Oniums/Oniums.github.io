import { avatarSVG } from './avatar-core.mjs?v=20260920-1';
const $ = id => document.getElementById(id);
let currentSVG = '', previewURL = '', galleryURLs = [];
const options = () => ({ seed: $('seed').value, style: $('style').value, color: $('color').value, background: $('background').value, radius: $('radius').value, transparent: $('transparent').checked, flip: $('flip').checked });
const objectURL = svg => URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
function render() {
  try {
    currentSVG = avatarSVG(options());
    const old = previewURL; previewURL = objectURL(currentSVG);
    $('avatar-preview').src = previewURL;
    if (old) URL.revokeObjectURL(old);
    $('avatar-name').textContent = $('seed').value.trim() || 'Oniums';
    $('radius-value').textContent = `${$('radius').value}%`;
    $('color').disabled = $('style').value !== 'bottts';
    document.querySelectorAll('[data-color]').forEach(button => { button.disabled = $('style').value !== 'bottts'; });
    $('color-note').textContent = $('style').value === 'bottts' ? '选择机器人的外壳颜色。' : '极简机器人使用背景色作为主色。';
    $('avatar-status').textContent = '头像已生成 · 所有处理均在当前浏览器完成';
    $('avatar-status').dataset.kind = 'ok';
  } catch (error) { $('avatar-status').textContent = error.message; $('avatar-status').dataset.kind = 'error'; }
}
function gallery() {
  galleryURLs.forEach(URL.revokeObjectURL); galleryURLs = [];
  $('gallery').replaceChildren();
  for (const seed of ['Oniums', 'Orbit', 'Pixel', 'Thread', 'Hello']) {
    const button = document.createElement('button'); button.type = 'button'; button.title = `使用名字 ${seed}`; button.setAttribute('aria-label', `使用名字 ${seed}`);
    const img = document.createElement('img'); img.alt = ''; img.src = objectURL(avatarSVG({ ...options(), seed })); galleryURLs.push(img.src);
    button.append(img); button.addEventListener('click', () => { $('seed').value = seed; render(); }); $('gallery').append(button);
  }
}
function download(blob, extension) {
  const url = URL.createObjectURL(blob), link = document.createElement('a');
  link.href = url; link.download = `oniums-robot.${extension}`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
for (const id of ['seed', 'style', 'color', 'background', 'radius', 'transparent', 'flip']) $(id).addEventListener('input', () => { render(); if (id !== 'seed') gallery(); });
document.querySelectorAll('[data-color]').forEach(button => button.addEventListener('click', () => { $('color').value = button.dataset.color; render(); gallery(); }));
$('random').addEventListener('click', () => { $('seed').value = `Robot-${crypto.getRandomValues(new Uint32Array(1))[0].toString(36)}`; render(); });
$('download-svg').addEventListener('click', () => download(new Blob([currentSVG], { type: 'image/svg+xml' }), 'svg'));
$('download-png').addEventListener('click', async () => {
  const button = $('download-png'); button.disabled = true;
  const url = objectURL(currentSVG);
  try {
    const img = new Image(); img.src = url; await img.decode();
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 512;
    canvas.getContext('2d').drawImage(img, 0, 0, 512, 512);
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    if (!blob) throw new Error('PNG 导出失败，请重试');
    download(blob, 'png');
  } catch (error) { $('avatar-status').textContent = error.message; $('avatar-status').dataset.kind = 'error'; }
  finally { URL.revokeObjectURL(url); button.disabled = false; }
});
render(); gallery();
