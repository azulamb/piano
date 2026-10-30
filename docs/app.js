'use strict';

const $ = (id) => document.getElementById(id);
const names = ['ド', 'ド♯', 'レ', 'レ♯', 'ミ', 'ファ', 'ファ♯', 'ソ', 'ソ♯', 'ラ', 'ラ♯', 'シ', 'ド'];
const codes = ['KeyA', 'KeyW', 'KeyS', 'KeyE', 'KeyD', 'KeyF', 'KeyT', 'KeyG', 'KeyY', 'KeyH', 'KeyU', 'KeyJ', 'KeyK'];
const whites = [0, 2, 4, 5, 7, 9, 11, 12];
const blackPositions = { 1: 1, 3: 2, 6: 4, 8: 5, 10: 6 };
const active = new Map();
const pending = new Map();
const pointers = new Map();
let octave = 4, context, master, recording, timer, recordingUrl;
let startingRecording = false;
const status = (message) => { $('status').textContent = message; };

for (const key of document.querySelectorAll('.key')) {
  const offset = Number(key.dataset.offset);
  // Synthesized clicks from assistive technology have no pointer/key down event.
  key.addEventListener('click', (event) => {
    if (event.detail === 0 && !active.has(`focus:${offset}`) && !pending.has(`focus:${offset}`)) {
      const id = `accessible:${offset}`;
      startNote(id, offset);
      setTimeout(() => endNote(id), 180);
    }
  });
}
const keys = [...document.querySelectorAll('.key')];
function labels() {
  $('octave').value = `C${octave}–C${octave + 1}`;
  $('octave-down').disabled = octave <= 1;
  $('octave-up').disabled = octave >= 6;
  keys.forEach((key, i) => key.setAttribute('aria-label', `${names[i]}、オクターブ${octave + (i === 12 ? 1 : 0)}、${codes[i].slice(3)}キー`));
}
function paint() {
  keys.forEach((key, offset) => {
    const pressed = [...active.values()].some((voice) => voice.offset === offset);
    key.classList.toggle('active', pressed);
    key.setAttribute('aria-pressed', String(pressed));
  });
  $('note-display').textContent = active.size ? [...new Set([...active.values()].map((v) => names[v.offset]))].join(' · ') : 'READY TO PLAY';
}
async function audioReady() {
  if (!context) {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) throw new Error('このブラウザーは音声生成に対応していません。');
    context = new AudioContext({ latencyHint: 'interactive' });
    master = context.createGain();
    master.gain.value = Number($('volume').value) / 100;
    master.connect(context.destination);
  }
  if (context.state !== 'running') await context.resume();
}
async function startNote(id, offset) {
  if (pending.has(id) || active.has(id)) return;
  const token = {};
  pending.set(id, token);
  const midi = (octave + 1) * 12 + offset;
  const tone = $('tone').value;
  try {
    await audioReady();
    if (pending.get(id) !== token) return;
    pending.delete(id);
    // Different inputs may share a key; cap total voices for predictable headroom.
    if (active.size >= 13) return;
    const voice = createVoice(context, master, midi, tone);
    let event;
    if (recording) {
      event = { midi, tone, start: context.currentTime - recording.start, end: null };
      recording.notes.push(event);
    }
    active.set(id, { voice, offset, event });
    paint();
  } catch (error) { pending.delete(id); status(`音を開始できませんでした。${error.message}`); }
}
function endNote(id) {
  pending.delete(id);
  const entry = active.get(id);
  if (!entry) return;
  entry.voice.stop();
  if (entry.event && recording) entry.event.end = context.currentTime - recording.start;
  active.delete(id);
  paint();
}
function allOff() {
  pending.clear();
  for (const id of active.keys()) endNote(id);
  pointers.clear();
}
function shiftOctave(delta) {
  allOff();
  octave = Math.max(1, Math.min(6, octave + delta));
  labels();
}
$('octave-down').onclick = () => shiftOctave(-1);
$('octave-up').onclick = () => shiftOctave(1);
$('tone').onchange = () => {
  allOff();
  $('tone-display').textContent = $('tone').selectedOptions[0].textContent.split(' · ')[0];
};
$('open-settings').onclick = () => { allOff(); $('settings').showModal(); };
$('close-settings').onclick = () => $('settings').close();
$('settings').addEventListener('click', (event) => {
  if (event.target !== $('settings')) return;
  const bounds = $('settings').getBoundingClientRect();
  if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) $('settings').close();
});
$('volume').oninput = () => {
  const value = Number($('volume').value) / 100;
  $('volume-value').value = `${$('volume').value}%`;
  if (master) master.gain.setValueAtTime(value, context.currentTime);
  if (recording) recording.volumes.push({ at: context.currentTime - recording.start, value });
};
function keyAt(x, y) { return document.elementFromPoint(x, y)?.closest('.key'); }
$('keyboard').addEventListener('pointerdown', (event) => {
  if (event.pointerType === 'mouse' && event.button !== 0) return;
  const key = event.target.closest('.key');
  if (!key) return;
  event.preventDefault();
  $('keyboard').setPointerCapture(event.pointerId);
  pointers.set(event.pointerId, Number(key.dataset.offset));
  startNote(`pointer:${event.pointerId}`, Number(key.dataset.offset));
});
$('keyboard').addEventListener('pointermove', (event) => {
  if (!pointers.has(event.pointerId)) return;
  const key = keyAt(event.clientX, event.clientY);
  const offset = key ? Number(key.dataset.offset) : null;
  if (pointers.get(event.pointerId) === offset) return;
  endNote(`pointer:${event.pointerId}`);
  pointers.set(event.pointerId, offset);
  if (offset !== null) startNote(`pointer:${event.pointerId}`, offset);
});
for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
  $('keyboard').addEventListener(type, (event) => {
    endNote(`pointer:${event.pointerId}`);
    pointers.delete(event.pointerId);
  });
}
$('keyboard').addEventListener('contextmenu', (event) => event.preventDefault());
document.addEventListener('keydown', (event) => {
  if ($('settings').open || event.isComposing || event.ctrlKey || event.metaKey || event.altKey || event.target.matches('input, select, textarea, [contenteditable="true"]')) return;
  const offset = codes.indexOf(event.code);
  const focusKey = event.target.closest('.key');
  if (focusKey && ['Space', 'Enter'].includes(event.code)) {
    event.preventDefault();
    if (!event.repeat) startNote(`focus:${focusKey.dataset.offset}`, Number(focusKey.dataset.offset));
  } else if (offset !== -1) {
    event.preventDefault();
    if (!event.repeat) startNote(event.code, offset);
  } else if (['KeyZ', 'KeyX', 'ArrowDown', 'ArrowUp'].includes(event.code)) {
    event.preventDefault();
    if (!event.repeat) shiftOctave(['KeyZ', 'ArrowDown'].includes(event.code) ? -1 : 1);
  }
});
document.addEventListener('keyup', (event) => {
  endNote(event.code);
  if (['Space', 'Enter'].includes(event.code) && event.target.closest('.key')) {
    event.preventDefault();
    endNote(`focus:${event.target.dataset.offset}`);
  }
});
document.addEventListener('focusout', (event) => {
  if (event.target.matches('.key')) endNote(`focus:${event.target.dataset.offset}`);
});
function interrupted() {
  allOff();
  if (recording) finishRecording();
}
window.addEventListener('blur', interrupted);
document.addEventListener('visibilitychange', () => { if (document.hidden) interrupted(); });

$('record').onclick = async () => {
  if (recording || startingRecording) return;
  startingRecording = true;
  $('record').disabled = true;
  try {
    await audioReady();
    allOff();
    $('playback').pause();
    if (recordingUrl) { URL.revokeObjectURL(recordingUrl); recordingUrl = null; }
    $('playback').removeAttribute('src');
    $('recording-result').hidden = true;
    recording = { start: context.currentTime, notes: [], volumes: [{ at: 0, value: master.gain.value }] };
    $('stop').disabled = false;
    $('quick-stop').hidden = false;
    $('settings').close();
    $('record-dot').classList.add('recording');
    $('record-label').textContent = '録音中';
    $('timer').value = '00:00';
    status('録音中です。最長3分で自動停止します。');
    timer = setInterval(() => {
      const seconds = Math.floor(context.currentTime - recording.start);
      $('timer').value = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
      if (seconds >= 180) finishRecording();
    }, 200);
  } catch (error) { status(`録音を開始できませんでした。${error.message}`); $('record').disabled = false; }
  finally { startingRecording = false; }
};
async function finishRecording() {
  if (!recording) return;
  allOff();
  const take = recording;
  const duration = Math.min(180, Math.max(0.01, context.currentTime - take.start));
  recording = null;
  clearInterval(timer);
  $('stop').disabled = true;
  $('quick-stop').hidden = true;
  $('record-dot').classList.remove('recording');
  $('record-label').textContent = 'WAVを作成中…';
  status('演奏をWAVファイルに変換しています。');
  try {
    const rate = 44100;
    const offline = new OfflineAudioContext(1, Math.ceil((duration + RELEASE + 0.02) * rate), rate);
    const gain = offline.createGain();
    gain.connect(offline.destination);
    for (const change of take.volumes) gain.gain.setValueAtTime(change.value, Math.min(duration, change.at));
    for (const note of take.notes) {
      if (note.start >= duration) continue;
      const voice = createVoice(offline, gain, note.midi, note.tone, note.start);
      voice.stop(Math.min(duration, note.end ?? duration));
    }
    const buffer = await offline.startRendering();
    recordingUrl = URL.createObjectURL(encodeWav(buffer.getChannelData(0), rate));
    $('playback').src = recordingUrl;
    $('download').href = recordingUrl;
    const now = new Date();
    const stamp = [now.getFullYear(), now.getMonth() + 1, now.getDate(), now.getHours(), now.getMinutes(), now.getSeconds()].map(n => String(n).padStart(2, '0')).join('-');
    $('download').download = `pocket-chip-${stamp}.wav`;
    $('recording-result').hidden = false;
    if (!document.hidden && !$('settings').open) $('settings').showModal();
    $('record-label').textContent = '録音できました';
    status(take.notes.length ? '再生して確認し、「WAVを保存」でダウンロードできます。' : '鍵盤の演奏がなかったため、無音の録音になりました。');
  } catch (error) {
    $('record-label').textContent = '変換できませんでした';
    status(`録音の変換に失敗しました。短い録音で再度お試しください。${error.message}`);
  } finally { $('record').disabled = false; }
}
$('stop').onclick = finishRecording;
$('quick-stop').onclick = finishRecording;
labels();
if ('serviceWorker' in navigator && ['http:', 'https:'].includes(location.protocol)) {
  navigator.serviceWorker.register('./sw.js').catch(() => status('オフライン準備に失敗しました。オンラインでは演奏できます。'));
}
