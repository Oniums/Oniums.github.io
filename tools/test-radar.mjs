import test from 'node:test';
import assert from 'node:assert/strict';
import { C, TAU, defaults, wavelength, roundTrip, slope, beatFrequency, rangeFromFrequency, aliasFrequency, quantize, parameters, sampleSignal, windowWeights, fft, spectrum } from '../source/playground/radar/physics.mjs';
import { lessons, chapters, taskPassed } from '../source/playground/radar/course.mjs';
const near=(a,b,tol=1e-9)=>assert(Math.abs(a-b)<=tol,`${a} != ${b}`);
test('Wave and FMCW: readable physical vectors and reversible range mapping',()=>{
  near(wavelength(24),.0125);near(wavelength(60),.005);near(roundTrip(3),20e-9);near(roundTrip(6),40e-9);
  near(slope(100,100),1e12,.001);near(beatFrequency(3,100,100),20000,1e-8);near(beatFrequency(3,100,200),10000,1e-8);
  for(const distance of [.5,3,3.13,6,8])for(const b of [50,100,500,1000])for(const t of [50,100,200])near(rangeFromFrequency(beatFrequency(distance,b,t),b,t),distance);
});
test('Aliasing: same cosine samples at true and folded frequencies',()=>{
  near(aliasFrequency(20000,32000),12000);near(aliasFrequency(20000,40000),20000);near(aliasFrequency(96000,32000),0);
  for(const fs of [20000,32000,40000,80000])for(const f of [0,12000,20000,100000,530123])for(let n=0;n<32;n++)near(Math.cos(TAU*f*n/fs),Math.cos(TAU*aliasFrequency(f,fs)*n/fs),1e-10);
});
test('Quantization: bounded codes, clipping, and half-step error',()=>{
  for(const bits of [2,3,4,8,12]){
    const step=2/(2**bits-1);near(quantize(-2,bits),-1);near(quantize(2,bits),1);
    for(let i=0;i<501;i++){const x=-1+2*i/500;assert(Math.abs(quantize(x,bits)-x)<=step/2+1e-12);near((quantize(x,bits)+1)/step,Math.round((quantize(x,bits)+1)/step),1e-9);}
  }
});
test('Observation and effective bandwidth follow actual sample count',()=>{
  const full=parameters(defaults),half=parameters({...defaults,fraction:.5});assert.equal(full.count,128);assert.equal(half.count,64);near(full.observed,100e-6);near(half.observed,50e-6);near(full.resolution,1.5);near(half.resolution,3);
  near(parameters({...defaults,bandwidth:1000}).resolution,.15);assert.equal(parameters({...defaults,sampleRate:20,chirp:50,fraction:.25}).count,0);
  const odd=parameters({...defaults,sampleRate:32});assert.equal(odd.count,3);near(odd.observed,3/32000);
});
test('FFT complex output agrees with an independent direct DFT',()=>{
  for(const n of [1,2,4,8,16,32]){
    const input=Float64Array.from({length:Math.max(1,n-3)},(_,i)=>Math.sin(i*1.7)+i*.03);
    const {real,imag}=fft(input,n);
    for(let k=0;k<n;k++){
      let r=0,im=0;input.forEach((v,i)=>{r+=v*Math.cos(-TAU*k*i/n);im+=v*Math.sin(-TAU*k*i/n);});near(real[k],r,1e-10);near(imag[k],im,1e-10);
    }
  }
  assert.throws(()=>fft([1,2],3));assert.throws(()=>fft([1,2],1));
});
test('FFT scaling: coherent tone amplitude, DC and Nyquist endpoints',()=>{
  const base={...defaults,bandwidth:300,distance:3,sampleRate:1280,padding:1,window:'rect'};
  for(const window of ['rect','hann']){
    const r=spectrum({...base,window});const peak=r.bins.reduce((a,b)=>a.amplitude>b.amplitude?a:b);near(peak.distance,3);near(peak.amplitude,base.amplitude,1e-10);
  }
  const dc=spectrum({...base,distance:0});near(dc.bins[0].amplitude,base.amplitude);
  const nyquist=spectrum({...base,distance:rangeFromFrequency(640000,300,100)});near(nyquist.bins.at(-1).amplitude,base.amplitude,1e-9);
});
test('Zero padding refines grid without adding samples or changing resolution',()=>{
  const a=spectrum({...defaults,padding:1}),b=spectrum({...defaults,padding:8});assert.equal(a.count,b.count);near(a.resolution,b.resolution);assert.equal(b.fftLength,a.fftLength*8);
  a.bins.forEach((bin,i)=>near(bin.amplitude,b.bins[i*8].amplitude,1e-10));
  const empty=spectrum({...defaults,sampleRate:20,chirp:50,fraction:.25});assert.equal(empty.bins.length,0);
});
test('Two-target spectra are computed from the summed sample sequence',()=>{
  const s={...defaults,bandwidth:1000,separation:.4},r=spectrum(s,true);
  const direct=sampleSignal(s,true);assert.deepEqual(r.samples,direct.samples);
  const peaks=r.bins.filter((b,i,all)=>i>0&&i<all.length-1&&b.amplitude>all[i-1].amplitude&&b.amplitude>all[i+1].amplitude).sort((a,b)=>b.amplitude-a.amplitude).slice(0,2).sort((a,b)=>a.distance-b.distance);
  near(peaks[0].distance,3,.08);near(peaks[1].distance,3.4,.08);
  const window=windowWeights(128,'hann');near(window[0],0);near(window[64],1);near(window.reduce((a,b)=>a+b,0),64);
});
test('All 16 lessons have complete teaching and exercises; expected settings pass',()=>{
  assert.equal(taskPassed('resolution',{...defaults,bandwidth:1000,sampleRate:20}),false);
  assert.equal(taskPassed('range-peak',{...defaults,distance:5,sampleRate:20}),false);
  assert.equal(chapters.length,4);assert.equal(lessons.length,16);assert.equal(new Set(lessons.map(l=>l.id)).size,16);
  const solutions={amplitude:{amplitude:.4},frequency:{carrier:60},phase:{phase:180},distance:{distance:6},delay:{distance:6,bandwidth:100,chirp:100},slope:{bandwidth:500,chirp:100},beat:{distance:4.5,bandwidth:100,chirp:100},chirp:{distance:3,chirp:200},samples:{sampleRate:320,chirp:100,fraction:1},'no-alias':{distance:3,sampleRate:80,bandwidth:100,chirp:100},bits:{bits:8},record:{sampleRate:1280,chirp:100,fraction:.5},'two-targets':{separation:1},'range-peak':{distance:5},resolution:{bandwidth:1000,separation:.4},padding:{padding:8,window:'hann'}};
  for(const l of lessons){assert.equal(l.text.length,3);assert(l.question&&l.observe&&l.formula&&l.terms&&l.handoff&&l.task.prompt);assert(l.quiz[1][l.quiz[2]]);assert(taskPassed(l.task.key,{...defaults,...l.preset,...solutions[l.task.key]}));}
});
