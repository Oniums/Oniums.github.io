import { defaults, parameters, rangeFromFrequency } from './physics.mjs';
import { chapters, lessons, taskPassed } from './course.mjs';
import { makePlotData, drawPlots } from './plots.mjs';
const el=id=>document.getElementById(id),put=(id,text)=>{el(id).textContent=text;};
let state={...defaults},index=0,data,progress=0,playing=false,frame=0,lastTime=0;
const completed=new Set(),answers=new Map(),reduceMotion=matchMedia('(prefers-reduced-motion: reduce)');
const controls={
  distance:['目标 A 距离',.5,8,.05,'m'],amplitude:['相对振幅',.1,1,.05,''],carrier:['载频',24,60,12,'GHz'],phase:['相位偏移',0,360,5,'°'],
  bandwidth:['扫频带宽',50,1000,50,'MHz'],chirp:['Chirp 时长',50,200,25,'μs'],
  sampleRate:['采样率',[[20,'20 kS/s'],[32,'32 kS/s'],[40,'40 kS/s'],[80,'80 kS/s'],[160,'160 kS/s'],[320,'320 kS/s'],[640,'640 kS/s'],[1280,'1280 kS/s'],[2560,'2560 kS/s']]],
  bits:['量化位数',[[2,'2 位 / 4 级'],[3,'3 位 / 8 级'],[4,'4 位 / 16 级'],[8,'8 位 / 256 级'],[12,'12 位 / 4096 级']]],
  fraction:['有效采样窗',[[.25,'四分之一 Chirp'],[.5,'半个 Chirp'],[1,'完整 Chirp']]],
  separation:['目标间距',.05,2,.05,'m'],secondAmplitude:['目标 B 相对幅度',.02,1,.01,''],
  window:['窗函数',[['rect','矩形窗'],['hann','Hann 窗']]],padding:['FFT 补零倍率',[[1,'1×'],[2,'2×'],[4,'4×'],[8,'8×']]]
};
const readable=(n,digits=2)=>Number.isFinite(n)?n.toLocaleString('zh-CN',{maximumFractionDigits:digits}):'—';
const controlValue=key=>`${readable(state[key])}${controls[key][4]?' '+controls[key][4]:''}`;
function buildControls(){
  el('controls').replaceChildren();
  for(const key of lessons[index].controls){
    // Distance always remains directly below the shared room scene.
    if(key==='distance')continue;
    const definition=controls[key],box=document.createElement('div');box.className='parameter';
    const label=document.createElement('label');label.htmlFor=`control-${key}`;label.textContent=definition[0];
    let input;
    if(Array.isArray(definition[1])){
      input=document.createElement('select');
      for(const[value,text]of definition[1]){const option=document.createElement('option');option.value=value;option.textContent=text;input.append(option);}
    }else{
      const output=document.createElement('output');output.id=`value-${key}`;output.textContent=controlValue(key);label.append(output);
      input=document.createElement('input');input.type='range';input.min=definition[1];input.max=definition[2];input.step=definition[3];
    }
    input.id=`control-${key}`;input.value=state[key];input.addEventListener('input',()=>{state[key]=key==='window'?input.value:Number(input.value);update();});
    box.append(label,input);el('controls').append(box);
  }
  if(!el('controls').children.length){const note=document.createElement('p');note.className='helper';note.textContent='直接拖动房间里的目标，或使用距离滑块。';el('controls').append(note);}
}
function syncControls(){
  for(const key of lessons[index].controls){const input=el(`control-${key}`);if(input)input.value=state[key];if(el(`value-${key}`))put(`value-${key}`,controlValue(key));}
  el('scene-distance').value=state.distance;put('scene-distance-value',`${state.distance.toFixed(2)} m`);
}
function addMetric(label,value){const box=document.createElement('div'),dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=label;dd.textContent=value;box.append(dt,dd);el('metrics').append(box);}
function renderMetrics(){
  el('metrics').replaceChildren();const chapter=Math.floor(index/4),view=lessons[index].view;
  if(chapter===0){
    addMetric('单程距离',`${readable(state.distance)} m`);addMetric('往返延迟',`${readable(data.delay*1e9)} ns`);
    if(view==='echo')addMetric('电波往返路程',`${readable(2*state.distance)} m`);
    else{addMetric('真实波长',`${readable(data.wavelength*1000)} mm`);addMetric('一个周期',`${readable(1000/state.carrier)} ps`);}
  }else{
    addMetric('目标 A 的理想差频',`${readable(data.frequency/1000)} kHz`);
    if(chapter===1){addMetric('扫频斜率',`${readable(state.bandwidth/state.chirp)} MHz/μs`);addMetric('往返延迟',`${readable(data.delay*1e9)} ns`);addMetric('按当前斜率换算',`${readable(rangeFromFrequency(data.frequency,state.bandwidth,state.chirp))} m`);}
    else{
      addMetric('采样率 / Nyquist 边界',`${readable(state.sampleRate)} kS/s / ${readable(state.sampleRate/2)} kHz`);
      addMetric('真实样本 / 观测时长',`${data.count} 点 / ${readable(data.observed*1e6)} μs`);
      if(view==='alias')addMetric('采样后折叠频率',`${readable(data.alias/1000)} kHz`);
      if(view==='quantize')addMetric('本模型量化步长',readable(2/(2**state.bits-1),6));
      if(chapter===3){addMetric('有效扫频带宽',`${readable(data.bandwidthObserved/1e6)} MHz`);addMetric('矩形窗理想分辨尺度',`${readable(data.resolution,3)} m`);addMetric('FFT 距离格点间隔',`${readable(rangeFromFrequency(data.fs/data.fftLength,state.bandwidth,state.chirp),4)} m`);}
    }
  }
  let notice='';
  if(chapter>=2){
    const highest=data.two?Math.max(data.frequency,data.second):data.frequency;
    if(data.count<2)notice='当前有效采样窗不足 2 个点，无法据此判断频率。请增加采样率或观测时长。';
    else if(highest>=data.fs/2)notice=`至少一个目标差频达到或超过 fs/2（${readable(data.fs/2000)} kHz）。当前样本存在混叠或边界歧义，频谱不能直接当作真实距离。可回到第 3.2 节观察。`;
  }
  put('model-notice',notice);el('model-notice').hidden=!notice;
  const summary=chapter===0?`目标位于 ${readable(state.distance)} m，往返延迟 ${readable(data.delay*1e9)} ns；载频 ${state.carrier} GHz，波长 ${readable(data.wavelength*1000)} mm。`
    :`目标 A 位于 ${readable(state.distance)} m，理想差频 ${readable(data.frequency/1000)} kHz。${chapter>=2?`当前 ${data.count} 个真实样本，观测 ${readable(data.observed*1e6)} μs。`:''}${data.two?`目标 B 位于 ${readable(state.distance+state.separation)} m。`:''}${notice}`;
  put('plot-summary',summary);
}
function renderScene(){
  const x=68+state.distance*55.6,x2=68+(state.distance+state.separation)*55.6;
  put('room-hint',data.two?'':'拖动目标 A，或使用距离滑块');
  el('target-b-label').setAttribute('y', '-48');
  el('target-a').setAttribute('transform',`translate(${x} 102)`);el('target-a').setAttribute('aria-valuenow',state.distance);el('target-a').setAttribute('aria-valuetext',`${state.distance.toFixed(2)} 米`);put('target-a-label',`A · ${state.distance.toFixed(2)} m`);
  el('target-b').toggleAttribute('hidden',!data.two);el('target-b').setAttribute('transform',`translate(${x2} 80)`);el('target-b').setAttribute('aria-valuenow',state.separation);el('target-b').setAttribute('aria-valuetext',`与 A 间距 ${state.separation.toFixed(2)} 米`);put('target-b-label',`B · ${(state.distance+state.separation).toFixed(2)} m`);
  el('outgoing').setAttribute('d',`M 90 116 H ${x}`);el('returning').setAttribute('d',`M ${x} 130 H 90`);
  const returning=progress>.5,p=returning?2*(1-progress):2*progress;
  el('packet').setAttribute('cx',68+(x-68)*p);el('packet').setAttribute('cy',returning?130:116);el('packet').setAttribute('fill',returning?'#bd7438':'#087f72');
  put('travel-state',progress===0?'发射':progress===1?'返回雷达':returning?'回程':'去程');el('animation-progress').value=Math.round(progress*100);
}
function update(){
  syncControls();data=makePlotData(state,lessons[index]);renderMetrics();renderScene();drawPlots(state,lessons[index],progress,data);put('task-feedback','');
}
function renderNavigation(){
  el('chapter-nav').replaceChildren();
  chapters.forEach((chapter,i)=>{
    const button=document.createElement('button');button.type='button';button.className='chapter-button';button.setAttribute('aria-current',String(Math.floor(index/4)===i));
    const num=document.createElement('b');num.textContent=String(i+1).padStart(2,'0');const sub=document.createElement('small');sub.textContent=chapter.subtitle;
    button.append(num,document.createTextNode(chapter.title),sub);button.addEventListener('click',()=>navigate(i*4));el('chapter-nav').append(button);
  });
  el('lesson-tabs').replaceChildren();const start=Math.floor(index/4)*4;
  for(let i=start;i<start+4;i++){
    const button=document.createElement('button');button.type='button';button.textContent=(completed.has(i)?'✓ ':'')+lessons[i].title;button.setAttribute('aria-current',i===index?'step':'false');button.addEventListener('click',()=>navigate(i));el('lesson-tabs').append(button);
  }
  put('completed-count',`${completed.size} / 16`);el('course-progress').value=completed.size;
}
function showLesson(){
  pause();progress=0;const lesson=lessons[index],chapter=Math.floor(index/4);
  document.title=`${lesson.title} · 雷达交互课堂 · Oniums Lab`;
  el('lesson').dataset.lesson=lesson.id;
  put('lesson-kicker',`CHAPTER ${String(chapter+1).padStart(2,'0')} / ${chapters[chapter].title}`);put('lesson-title',lesson.title);put('lesson-question',lesson.question);
  put('prediction-title',lesson.quiz[0]);el('quiz-options').replaceChildren();put('quiz-feedback','');
  lesson.quiz[1].forEach((choice,i)=>{
    const button=document.createElement('button');button.type='button';button.textContent=choice;
    const answer=()=>{answers.set(index,i);el('quiz-options').querySelectorAll('button').forEach(b=>b.removeAttribute('data-correct'));button.dataset.correct=String(i===lesson.quiz[2]);put('quiz-feedback',`${i===lesson.quiz[2]?'判断正确。':'再想一步。'}${lesson.quiz[3]}`);};
    button.addEventListener('click',answer);el('quiz-options').append(button);if(answers.get(index)===i)answer();
  });
  put('experiment-title',lesson.observe);el('explanation-cards').replaceChildren();
  lesson.text.forEach((text,i)=>{const p=document.createElement('p'),b=document.createElement('b');b.textContent=String(i+1).padStart(2,'0');p.append(b,document.createTextNode(text));el('explanation-cards').append(p);});
  put('formula',lesson.formula);put('formula-terms',lesson.terms);put('handoff',lesson.handoff);put('task-prompt',lesson.task.prompt);
  put('lesson-position',`${index+1} / 16`);el('previous').disabled=index===0;el('next').disabled=index===15;el('completion').hidden=index!==15;
  renderNavigation();buildControls();update();
}
function navigate(destination){
  if(destination<0||destination>=lessons.length)return;
  const hash=`#lesson=${lessons[destination].id}`;
  if(location.hash===hash)return;
  location.hash=hash;
}
function readHash(focus=false){
  const id=new URLSearchParams(location.hash.slice(1)).get('lesson'),found=lessons.findIndex(l=>l.id===id);index=found<0?0:found;showLesson();
  if(focus){el('lesson-title').tabIndex=-1;el('lesson-title').focus({preventScroll:true});el('lesson').scrollIntoView({block:'start'});}
}
function playLabel(){
  el('play').disabled=reduceMotion.matches;el('play').setAttribute('aria-pressed',String(playing));put('play',reduceMotion.matches?'减少动态：可逐步查看':playing?'Ⅱ 暂停':'▶ 播放慢动作');
}
function pause(){playing=false;cancelAnimationFrame(frame);playLabel();}
function tick(time){
  if(!playing)return;
  if(lastTime)progress=(progress+Math.min(time-lastTime,100)/8000)%1;lastTime=time;
  renderScene();if(Math.floor(index/4)<=1)drawPlots(state,lessons[index],progress,data);frame=requestAnimationFrame(tick);
}
el('play').addEventListener('click',()=>{if(playing){pause();return;}playing=true;lastTime=0;playLabel();frame=requestAnimationFrame(tick);});
el('step-animation').addEventListener('click',()=>{pause();progress=Math.round(((progress+.1)>1.001?0:progress+.1)*100)/100;renderScene();drawPlots(state,lessons[index],progress,data);});
el('animation-progress').addEventListener('input',event=>{pause();progress=Number(event.target.value)/100;renderScene();drawPlots(state,lessons[index],progress,data);});
el('scene-distance').addEventListener('input',event=>{state.distance=Number(event.target.value);update();});
el('load-example').addEventListener('click',()=>{pause();progress=0;state={...defaults,...lessons[index].preset};update();});
el('previous').addEventListener('click',()=>navigate(index-1));el('next').addEventListener('click',()=>navigate(index+1));
el('check-task').addEventListener('click',()=>{
  const passed=taskPassed(lessons[index].task.key,state);
  put('task-feedback',passed?'这一步已完成。对照曲线与数值，再用自己的话解释一次变化。':'还没有达到本节设置。可以先载入本节实验，再按照题目调整参数。');
  if(passed){completed.add(index);renderNavigation();}
});
for(const[id,key,min,max]of[['target-a','distance',.5,8],['target-b','separation',.05,2]]){
  const target=el(id);let dragging=null;
  const set=value=>{state[key]=Math.max(min,Math.min(max,Math.round(value/.05)*.05));state[key]=Number(state[key].toFixed(2));update();};
  target.addEventListener('pointerdown',event=>{if(event.button!==0)return;dragging=event.pointerId;target.setPointerCapture(event.pointerId);target.focus();event.preventDefault();});
  target.addEventListener('pointermove',event=>{if(dragging!==event.pointerId)return;const point=new DOMPoint(event.clientX,event.clientY).matrixTransform(el('room').getScreenCTM().inverse());set((point.x-68)/55.6-(key==='separation'?state.distance:0));});
  for(const event of ['pointerup','pointercancel','lostpointercapture'])target.addEventListener(event,()=>{dragging=null;});
  target.addEventListener('keydown',event=>{
    let value=state[key];const delta=event.shiftKey?.5:.05;
    if(['ArrowRight','ArrowUp'].includes(event.key))value+=delta;else if(['ArrowLeft','ArrowDown'].includes(event.key))value-=delta;else if(event.key==='Home')value=min;else if(event.key==='End')value=max;else return;
    event.preventDefault();set(value);
  });
}
window.addEventListener('hashchange',()=>readHash(true));window.addEventListener('pagehide',pause);document.addEventListener('visibilitychange',()=>{if(document.hidden)pause();});reduceMotion.addEventListener('change',pause);
let resizeFrame;new ResizeObserver(()=>{cancelAnimationFrame(resizeFrame);resizeFrame=requestAnimationFrame(()=>{if(data)drawPlots(state,lessons[index],progress,data);});}).observe(el('lesson'));
readHash();
