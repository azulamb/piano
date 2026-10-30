const RELEASE = 0.035;
function createVoice(context, destination, midi, tone, at = context.currentTime) {
  const frequency = 440 * 2 ** ((midi - 69) / 12);
  const envelope = context.createGain();
  let source;
  if (tone === 'noise') {
    const buffer = context.createBuffer(1, 32767, context.sampleRate);
    const data = buffer.getChannelData(0);
    let register = 1;
    for (let i = 0; i < data.length; i++) {
      const feedback = (register ^ (register >> 1)) & 1;
      register = (register >> 1) | (feedback << 14);
      data[i] = (register & 1) ? 1 : -1;
    }
    source = context.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    source.playbackRate.value = frequency / 1308;
  } else {
    source = context.createOscillator();
    source.frequency.value = frequency;
    if (tone === 'triangle') source.type = 'triangle';
    else {
      const duty = { pulse50: 0.5, pulse25: 0.25, pulse12: 0.125 }[tone] ?? 0.5;
      const real = new Float32Array(128);
      const imag = new Float32Array(128);
      for (let n = 1; n < real.length; n++) {
        real[n] = 2 * Math.sin(2 * Math.PI * n * duty) / (Math.PI * n);
        imag[n] = 2 * (1 - Math.cos(2 * Math.PI * n * duty)) / (Math.PI * n);
      }
      source.setPeriodicWave(context.createPeriodicWave(real, imag));
    }
  }
  // Fixed headroom keeps all 13 keys safe from clipping, including release tails.
  const level = tone === 'noise' ? 0.035 : 0.055;
  envelope.gain.setValueAtTime(0, at);
  envelope.gain.linearRampToValueAtTime(level, at + 0.004);
  source.connect(envelope).connect(destination);
  source.start(at);
  source.onended = () => { source.disconnect(); envelope.disconnect(); };
  return {
    stop(time = context.currentTime) {
      const end = Math.max(at, time);
      envelope.gain.cancelScheduledValues(end);
      envelope.gain.setValueAtTime(level * Math.min(1, Math.max(0, end - at) / 0.004), end);
      envelope.gain.linearRampToValueAtTime(0, end + RELEASE);
      source.stop(end + RELEASE);
    }
  };
}

function encodeWav(samples, sampleRate) {
  const bytes = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(bytes);
  const word = (offset, value) => [...value].forEach((c, i) => view.setUint8(offset + i, c.charCodeAt(0)));
  word(0, 'RIFF'); view.setUint32(4, 36 + samples.length * 2, true);
  word(8, 'WAVE'); word(12, 'fmt '); view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true); view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true); view.setUint16(34, 16, true);
  word(36, 'data'); view.setUint32(40, samples.length * 2, true);
  samples.forEach((sample, i) => {
    const value = Math.max(-1, Math.min(1, sample));
    view.setInt16(44 + i * 2, Math.round(value * (value < 0 ? 32768 : 32767)), true);
  });
  return new Blob([bytes], { type: 'audio/wav' });
}
