import { TAU, beatFrequency, sampleSignal, quantize, spectrum } from './physics.mjs';
const teal = '#087f72', orange = '#bd7438', purple = '#7a6aab';
const fmt = n => Math.abs(n) < 1e-8 ? '0' : Number(n.toPrecision(3)).toString();
function chart(canvas, { xmin = 0, xmax, ymin, ymax, xlabel, ylabel }) {
  const width = canvas.clientWidth, height = canvas.clientHeight, ratio = Math.min(devicePixelRatio || 1, 2);
  if (width <= 0 || height <= 0) return null;
  if (canvas.width !== Math.round(width * ratio) || canvas.height !== Math.round(height * ratio)) { canvas.width = Math.round(width * ratio); canvas.height = Math.round(height * ratio); }
  const ctx = canvas.getContext('2d'); ctx.setTransform(ratio, 0, 0, ratio, 0, 0); ctx.clearRect(0, 0, width, height);
  const area = { left: 43, right: width - 16, top: 24, bottom: height - 39 };
  const x = n => area.left + (n - xmin) / (xmax - xmin) * (area.right - area.left);
  const y = n => area.bottom - (n - ymin) / (ymax - ymin) * (area.bottom - area.top);
  ctx.font = '10px sans-serif'; ctx.lineWidth = 1; ctx.strokeStyle = '#e2e9df'; ctx.fillStyle = '#718578';
  for (let i = 0; i <= 4; i++) {
    const xx = xmin + (xmax - xmin) * i / 4, yy = ymin + (ymax - ymin) * i / 4;
    ctx.beginPath(); ctx.moveTo(x(xx), area.top); ctx.lineTo(x(xx), area.bottom); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(area.left, y(yy)); ctx.lineTo(area.right, y(yy)); ctx.stroke();
    ctx.textAlign = 'center'; ctx.fillText(fmt(xx), x(xx), area.bottom + 15);
    ctx.textAlign = 'right'; ctx.fillText(fmt(yy), area.left - 6, y(yy) + 3);
  }
  ctx.textAlign = 'right'; ctx.fillText(xlabel, area.right, height - 5); ctx.textAlign = 'left'; ctx.fillText(ylabel, area.left, 13);
  const clip = fn => { ctx.save(); ctx.beginPath(); ctx.rect(area.left, area.top, area.right - area.left, area.bottom - area.top); ctx.clip(); fn(); ctx.restore(); };
  const line = (points, color, dash = []) => clip(() => {
    ctx.strokeStyle = color; ctx.lineWidth = 1.8; ctx.setLineDash(dash); ctx.beginPath();
    points.forEach(([xx, yy], i) => i ? ctx.lineTo(x(xx), y(yy)) : ctx.moveTo(x(xx), y(yy))); ctx.stroke();
  });
  const dots = (points, color, stems = false) => clip(() => {
    ctx.fillStyle = color; ctx.strokeStyle = color; ctx.lineWidth = 1;
    for (const [xx, yy] of points) { if (stems) { ctx.beginPath();ctx.moveTo(x(xx), y(0));ctx.lineTo(x(xx),y(yy));ctx.stroke(); } ctx.beginPath();ctx.arc(x(xx),y(yy),2.7,0,TAU);ctx.fill(); }
  });
  const marker = (xx, color, label) => {
    if (xx < xmin || xx > xmax) return;
    line([[xx, ymin], [xx, ymax]], color, [4,4]); ctx.fillStyle=color;ctx.textAlign='center';ctx.fillText(label,x(xx),area.top+12);
  };
  return { line, dots, marker, ctx, x, y, area };
}
const values = (end, fn, begin = 0, count = 900) => Array.from({ length: count + 1 }, (_, i) => { const x = begin + (end - begin) * i / count; return [x, fn(x)]; });
const title = (id, text) => { document.getElementById(id).textContent = text; };
export function makePlotData(state, lesson) {
  const two = lesson.id === 'spectrum-components' || lesson.id === 'spectrum-resolution' || lesson.id === 'spectrum-window';
  return { ...spectrum(state, two), two };
}
export function drawPlots(state, lesson, progress, data) {
  const first = document.getElementById('plot-one'), second = document.getElementById('plot-two');
  const view = lesson.view, a = state.amplitude, f = data.frequency, shift = progress * TAU, phase = state.phase * Math.PI / 180;
  if (view === 'wave' || view === 'phase') {
    title('plot-one-title', view === 'phase' ? '同频率，不同相位' : '一个位置的电场随时间变化'); title('plot-one-label', view === 'phase' ? '青：参考波 · 橙：相位偏移后的波' : '纵轴：相对幅度 · 真实时间轴放大到 ps');
    const p = chart(first, { xmax: 150, ymin: -1.2, ymax: 1.2, xlabel: '时间 (ps)', ylabel: '相对幅度' });
    p?.line(values(150, t => a * Math.cos(TAU * state.carrier * t / 1000 - shift)), teal);
    if (view === 'phase') p?.line(values(150, t => a * Math.cos(TAU * state.carrier * t / 1000 + phase - shift)), orange);
    title('plot-two-title', '同一时刻，沿传播方向观察'); title('plot-two-label', '实际波长刻度；与房间里的慢放路径分开表示');
    const q = chart(second, { xmax: 40, ymin: -1.2, ymax: 1.2, xlabel: '位置 (mm)', ylabel: '相对幅度' });
    q?.line(values(40, x => a * Math.cos(TAU * x / (data.wavelength * 1000) - shift)), teal);
    if(view === 'phase')q?.line(values(40, x => a * Math.cos(TAU * x / (data.wavelength * 1000) + phase - shift)), orange);
  } else if (view === 'echo') {
    title('plot-one-title','发射与回波的时间标记');title('plot-one-label','青：发射 · 橙：回波；脉冲形状仅用于标记到达时刻');
    const p=chart(first,{xmin:-10,xmax:65,ymin:0,ymax:1.2,xlabel:'时间 (ns)',ylabel:'示意幅度'});
    p?.line(values(65,t=>Math.exp(-((t/2.5)**2)),-10),teal);p?.line(values(65,t=>Math.exp(-(((t-data.delay*1e9)/2.5)**2)),-10),orange);
    p?.marker(data.delay*1e9*progress, '#91a39a','观察');
    title('plot-two-title','单程距离与往返延迟');title('plot-two-label','距离加倍，往返延迟也加倍');
    const q=chart(second,{xmax:8,ymin:0,ymax:60,xlabel:'单程距离 (m)',ylabel:'往返延迟 (ns)'});
    q?.line([[0,0],[8,2*8/3e8*1e9]],teal);q?.dots([[state.distance,data.delay*1e9]],orange);
  } else if(view==='chirp') {
    title('plot-one-title','发射斜坡与延迟回波');title('plot-one-label','青：发射 · 橙：回波；使用真实比例，两线可能几乎重合');
    const end=state.chirp, delayUs=data.delay*1e6;
    const p=chart(first,{xmax:end,ymin:0,ymax:state.bandwidth*1.05,xlabel:'时间 (μs)',ylabel:'相对起频 (MHz)'});
    p?.line([[0,0],[end,state.bandwidth]],teal);p?.line([[delayUs,0],[end,state.bandwidth*(end-delayUs)/end]],orange,[4,3]);p?.marker(end*(.1+.8*progress),'#92a69b','观察');
    title('plot-two-title','观察时刻附近，放大看频率差');title('plot-two-label','局部放大：横轴改用 ns，纵轴改用 kHz；没有改变计算关系');
    const span=data.delay*1e9*3, fb=f/1000;
    const q=chart(second,{xmin:-span,xmax:span,ymin:-fb*4,ymax:fb*3.5,xlabel:'相对观察时刻 (ns)',ylabel:'相对发射频率 (kHz)'});
    q?.line(values(span,t=>data.slope*t*1e-12,-span),teal);q?.line(values(span,t=>data.slope*t*1e-12-fb,-span),orange);q?.marker(0,'#9bad9c','同一时刻');
  } else if(view==='beat') {
    title('plot-one-title','理想混频与低通后的差频信号');title('plot-one-label','固定时间轴：越远或斜率越陡，振动越快');
    const p=chart(first,{xmax:100,ymin:-1.2,ymax:1.2,xlabel:'时间 (μs)',ylabel:'相对幅度'});p?.line(values(100,t=>a*Math.cos(TAU*f*t*1e-6)),teal);
    title('plot-two-title','当前扫频配置下，频率怎样对应距离');title('plot-two-label','橙色点是当前目标；更改斜率后整条关系线会变化');
    const maximum=beatFrequency(8,state.bandwidth,state.chirp)/1000;
    const q=chart(second,{xmax:8,ymin:0,ymax:maximum*1.05,xlabel:'距离 (m)',ylabel:'差频 (kHz)'});q?.line([[0,0],[8,maximum]],teal);q?.dots([[state.distance,f/1000]],orange);
  } else if(['samples','alias','quantize'].includes(view)) {
    title('plot-one-title',view==='alias'?'同一组点，可以落在两条波上':view==='quantize'?'采样值怎样落到有限刻度':'连续波形与离散采样时刻');
    title('plot-one-label',view==='alias'?'青：真实差频 · 橙虚线：折叠频率 · 圆点：采样':view==='quantize'?'青：理想波与样本 · 橙：量化样本':'青：连续差频 · 橙：采样点');
    const end=state.chirp, samples=sampleSignal(state,false,view==='quantize');
    const p=chart(first,{xmax:end,ymin:-1.2,ymax:1.2,xlabel:'时间 (μs)',ylabel:'相对幅度'});
    p?.line(values(end,t=>a*Math.cos(TAU*f*t*1e-6)),teal);
    if(view==='alias')p?.line(values(end,t=>a*Math.cos(TAU*data.alias*t*1e-6)),orange,[5,4]);
    if(view==='quantize')p?.dots(Array.from(data.samples,(v,i)=>[i/data.fs*1e6,v]),teal);
    p?.dots(Array.from(samples.samples,(v,i)=>[i/data.fs*1e6,v]),orange);
    title('plot-two-title',view==='quantize'?'每个样本的量化误差':'计算机实际拿到的采样序列');title('plot-two-label',view==='quantize'?'橙：量化值 − 理想值；固定纵轴，直接比较误差大小':'每根竖线对应一个真实样本；没有补零');
    const errorLimit=view==='quantize'?.36:1.2;
    const q=chart(second,{xmax:Math.max(data.count-1,1),ymin:-errorLimit,ymax:errorLimit,xlabel:'样本编号 n',ylabel:view==='quantize'?'量化误差':'相对幅度'});
    q?.dots(Array.from(samples.samples,(v,i)=>[i,view==='quantize'?v-data.samples[i]:v]),orange,true);
  } else {
    const end=Math.max(data.observed*1e6,1);
    title('plot-one-title',view==='components'?'两个差频分量，相加成一段信号':'本次 FFT 使用的真实采样序列');title('plot-one-label',view==='components'?'青：目标 A · 橙：目标 B · 紫：合成信号':'青：差频采样；调整参数后实时重新计算 FFT');
    const p=chart(first,{xmax:end,ymin:-1.6,ymax:1.6,xlabel:'时间 (μs)',ylabel:'相对幅度'});
    if(view==='components') {
      const componentA=t=>a*Math.cos(TAU*f*t*1e-6),componentB=t=>state.secondAmplitude*Math.cos(TAU*data.second*t*1e-6+.7);
      p?.line(values(end,componentA),teal);p?.line(values(end,componentB),orange);p?.line(values(end,t=>componentA(t)+componentB(t)),purple);
    } else {const points=Array.from(data.samples,(v,i)=>[i/data.fs*1e6,v]);p?.line(points,teal);p?.dots(points,teal);}
    const maxDistance=Math.min(data.fs*3e8/(4*data.slope),Math.max(8,state.distance+state.separation+data.resolution*3));
    const useFrequency=view==='components',maximum=useFrequency?beatFrequency(maxDistance,state.bandwidth,state.chirp)/1000:maxDistance;
    title('plot-two-title',useFrequency?'先看频率，再换成距离':'由当前采样计算出的距离频谱');title('plot-two-label',`${state.window==='hann'?'Hann 窗':'矩形窗'} · ${data.count} 个真实样本 → ${data.fftLength} 点 FFT · 虚线为设定目标`);
    const q=chart(second,{xmax:Math.max(maximum,.001),ymin:-60,ymax:6,xlabel:useFrequency?'频率 (kHz)':'距离 (m)',ylabel:'相对幅度 (dB)'});
    q?.line(data.bins.filter(b=>b.distance<=maxDistance).map(b=>[useFrequency?b.hz/1000:b.distance,b.db]),teal);
    q?.marker(useFrequency?f/1000:state.distance,'#7d9482','A');
    if(data.two)q?.marker(useFrequency?data.second/1000:state.distance+state.separation,orange,'B');
  }
  for(const [canvas,id]of[[first,'plot-one-title'],[second,'plot-two-title']])canvas.setAttribute('aria-label',document.getElementById(id).textContent+'。'+document.getElementById('plot-summary').textContent);
}
