// Ideal stationary, monostatic FMCW model. c is rounded for readable examples.
export const C = 3e8;
export const TAU = 2 * Math.PI;
export const defaults = Object.freeze({ distance: 3, amplitude: 0.8, carrier: 24, phase: 0, bandwidth: 100, chirp: 100, sampleRate: 1280, bits: 8, fraction: 1, separation: 0.4, secondAmplitude: 0.65, window: 'rect', padding: 4 });
export const wavelength = carrierGHz => C / (carrierGHz * 1e9);
export const roundTrip = distance => 2 * distance / C;
export const slope = (bandwidthMHz, chirpUs) => bandwidthMHz * 1e6 / (chirpUs * 1e-6);
export const beatFrequency = (distance, bandwidthMHz, chirpUs) => slope(bandwidthMHz, chirpUs) * roundTrip(distance);
export const rangeFromFrequency = (hz, bandwidthMHz, chirpUs) => C * hz / (2 * slope(bandwidthMHz, chirpUs));
export function aliasFrequency(hz, sampleRateHz) {
  const folded = ((hz % sampleRateHz) + sampleRateHz) % sampleRateHz;
  return Math.min(folded, sampleRateHz - folded);
}
// Symmetric ideal quantizer: 2^bits equally spaced codes spanning [-1, 1].
export function quantize(value, bits) {
  const levels = 2 ** bits - 1;
  return Math.round((Math.max(-1, Math.min(1, value)) + 1) * levels / 2) * 2 / levels - 1;
}
export function parameters(state) {
  const fs = state.sampleRate * 1000, frequency = beatFrequency(state.distance, state.bandwidth, state.chirp);
  const count = Math.floor(fs * state.chirp * 1e-6 * state.fraction + 1e-9);
  const observed = count / fs;
  return { fs, frequency, count, observed, delay: roundTrip(state.distance), wavelength: wavelength(state.carrier), slope: slope(state.bandwidth, state.chirp), alias: aliasFrequency(frequency, fs), resolution: observed > 0 ? C / (2 * slope(state.bandwidth, state.chirp) * observed) : Infinity, bandwidthObserved: slope(state.bandwidth, state.chirp) * observed };
}
export function sampleSignal(state, twoTargets = false, digitize = false) {
  const p = parameters(state), second = beatFrequency(state.distance + state.separation, state.bandwidth, state.chirp);
  const samples = Float64Array.from({ length: p.count }, (_, n) => {
    const value = state.amplitude * Math.cos(TAU * p.frequency * n / p.fs) + (twoTargets ? state.secondAmplitude * Math.cos(TAU * second * n / p.fs + 0.7) : 0);
    return digitize ? quantize(value, state.bits) : value;
  });
  return { ...p, second, samples };
}
export function windowWeights(length, name = 'rect') {
  return Float64Array.from({ length }, (_, n) => name === 'hann' && length > 1 ? 0.5 - 0.5 * Math.cos(TAU * n / length) : 1);
}
// Iterative radix-2 FFT; zero-padding changes the evaluation grid, not the data record.
export function fft(input, length) {
  if (!Number.isInteger(length) || length < 1 || (length & (length - 1)) || length < input.length) throw new Error('FFT length must be a power of two covering the samples.');
  const real = new Float64Array(length), imag = new Float64Array(length); real.set(input);
  for (let i = 1, j = 0; i < length; i++) {
    let bit = length >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) [real[i], real[j]] = [real[j], real[i]];
  }
  for (let size = 2; size <= length; size *= 2) {
    const half = size / 2;
    for (let base = 0; base < length; base += size) for (let j = 0; j < half; j++) {
      const angle = -TAU * j / size, cos = Math.cos(angle), sin = Math.sin(angle), right = base + j + half, left = base + j;
      const re = real[right] * cos - imag[right] * sin, im = real[right] * sin + imag[right] * cos;
      real[right] = real[left] - re; imag[right] = imag[left] - im; real[left] += re; imag[left] += im;
    }
  }
  return { real, imag };
}
export function spectrum(state, twoTargets = false) {
  const signal = sampleSignal(state, twoTargets), n = signal.count;
  if (!n) return { ...signal, bins: [], fftLength: 0 };
  const weights = windowWeights(n, state.window), gain = weights.reduce((sum, w) => sum + w, 0);
  const length = 2 ** Math.ceil(Math.log2(n)) * state.padding;
  const transformed = fft(signal.samples.map((v, i) => v * weights[i]), length);
  const bins = Array.from({ length: length / 2 + 1 }, (_, k) => {
    const scale = k === 0 || k === length / 2 ? 1 : 2;
    const amplitude = scale * Math.hypot(transformed.real[k], transformed.imag[k]) / gain;
    const hz = k * signal.fs / length;
    return { hz, distance: rangeFromFrequency(hz, state.bandwidth, state.chirp), amplitude, db: 20 * Math.log10(Math.max(amplitude, 1e-5)) };
  });
  return { ...signal, bins, fftLength: length };
}
