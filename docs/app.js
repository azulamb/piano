'use strict';

const $ = (id) => document.getElementById(id);
const names = ['ド', 'ド♯', 'レ', 'レ♯', 'ミ', 'ファ', 'ファ♯', 'ソ', 'ソ♯', 'ラ', 'ラ♯', 'シ', 'ド'];
const codes = ['KeyA', 'KeyW', 'KeyS', 'KeyE', 'KeyD', 'KeyF', 'KeyT', 'KeyG', 'KeyY', 'KeyH', 'KeyU', 'KeyJ', 'KeyK'];
const whiteNotes = [0, 2, 4, 5, 7, 9, 11];
const noteLetters = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
let whiteCount = 8, startNoteClass = 0;
let keys = [];
const active = new Map();
const pending = new Map();
const pointers = new Map();
let octave = 4, context, master, recording, timer, recordingUrl;
let startingRecording = false;
const status = (message) => { $('status').textContent = message; };

function keyboardLayout(start, count) {
  const layout = [];
  let offset = start, whiteIndex = 0;
  while (whiteIndex < count) {
    const white = whiteNotes.includes(offset % 12);
    layout.push({ offset, white, position: whiteIndex });
    if (white) whiteIndex++;
    offset++;
  }
  return layout;
}
function noteLabel(offset) {
  return noteLetters[offset % 12] + (octave + Math.floor(offset / 12));
}
function saveKeyboard() {
  try { localStorage.setItem('pocket-chip-keyboard', JSON.stringify({ whiteCount, startNoteClass, octave })); } catch { /* Storage is optional. */ }
}
function renderKeyboard() {
  allOff();
  const fragment = document.createDocumentFragment();
  for (const { offset, white, position } of keyboardLayout(startNoteClass, whiteCount)) {
    const key = document.createElement('button');
    key.type = 'button';
    key.className = 'key ' + (white ? 'white' : 'black');
    key.dataset.offset = offset;
    key.style.setProperty('--position', position);
    key.setAttribute('aria-pressed', 'false');
    const name = document.createElement('span');
    name.textContent = names[offset % 12];
    const shortcut = document.createElement('small');
    shortcut.textContent = codes[offset]?.slice(3) || noteLabel(offset);
    key.append(name, shortcut);
    key.addEventListener('click', (event) => {
      if (event.detail === 0 && !active.has('focus:' + offset) && !pending.has('focus:' + offset)) {
        const id = 'accessible:' + offset;
        startNote(id, offset);
        setTimeout(() => endNote(id), 180);
      }
    });
    fragment.append(key);
  }
  $('keyboard').replaceChildren(fragment);
  $('keyboard').style.setProperty('--white-count', whiteCount);
  keys = [...$('keyboard').querySelectorAll('.key')];
  labels();
}
function labels() {
  const layout = keyboardLayout(startNoteClass, whiteCount);
  $('octave').value = noteLabel(startNoteClass) + '–' + noteLabel(layout.at(-1).offset);
  $('octave-down').disabled = octave <= 1;
  $('octave-up').disabled = octave >= 6;
  $('start-octave').value = octave;
  keys.forEach((key) => {
    const offset = Number(key.dataset.offset);
    key.setAttribute('aria-label', names[offset % 12] + '、' + noteLabel(offset) + (codes[offset] ? '、' + codes[offset].slice(3) + 'キー' : ''));
    key.querySelector('small').textContent = codes[offset]?.slice(3) || noteLabel(offset);
  });
}
try {
  const saved = JSON.parse(localStorage.getItem('pocket-chip-keyboard'));
  if (saved && Number.isInteger(saved.whiteCount) && saved.whiteCount >= 1 && saved.whiteCount <= 21) whiteCount = saved.whiteCount;
  if (saved && whiteNotes.includes(saved.startNoteClass)) startNoteClass = saved.startNoteClass;
  if (saved && Number.isInteger(saved.octave) && saved.octave >= 1 && saved.octave <= 6) octave = saved.octave;
} catch { /* Use defaults for unavailable or invalid storage. */ }
$('white-count').value = whiteCount;
$('start-note').value = startNoteClass;
$('white-count').onchange = () => {
  const value = Number($('white-count').value);
  if (!Number.isInteger(value) || value < 1 || value > 21) return;
  whiteCount = value;
  renderKeyboard(); saveKeyboard();
};
$('start-note').onchange = () => {
  const value = Number($('start-note').value);
  if (!whiteNotes.includes(value)) return;
  startNoteClass = value;
  renderKeyboard(); saveKeyboard();
};
$('start-octave').onchange = () => {
  const value = Number($('start-octave').value);
  if (!Number.isInteger(value) || value < 1 || value > 6) return;
  shiftOctave(value - octave);
};
function paint() {
  keys.forEach((key) => {
    const offset = Number(key.dataset.offset);
    const pressed = [...active.values()].some((voice) => voice.offset === offset);
    key.classList.toggle('active', pressed);
    key.setAttribute('aria-pressed', String(pressed));
  });
  $('note-display').textContent = active.size ? [...new Set([...active.values()].map((v) => names[v.offset % 12]))].join(' · ') : 'READY TO PLAY';
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
  if (!keys.some(key => Number(key.dataset.offset) === offset) || pending.has(id) || active.has(id)) return;
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
  saveKeyboard();
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
renderKeyboard();
if ('serviceWorker' in navigator && ['http:', 'https:'].includes(location.protocol)) {
  navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' }).catch(() => status('オフライン準備に失敗しました。オンラインでは演奏できます。'));
}

function waitForWorker(worker, states) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => finish(new Error('更新がタイムアウトしました。もう一度お試しください。')), 30000);
    function finish(error) {
      clearTimeout(timeout);
      worker.removeEventListener('statechange', check);
      if (error) reject(error); else resolve();
    }
    function check() {
      if (states.includes(worker.state)) finish();
      else if (worker.state === 'redundant') finish(new Error('更新ファイルを準備できませんでした。通信状態を確認して再度お試しください。'));
    }
    worker.addEventListener('statechange', check);
    check();
  });
}
$('update-app').onclick = async () => {
  const button = $('update-app');
  const report = (text) => { $('update-status').textContent = text; };
  if (button.disabled) return;
  if (recording || startingRecording || $('record').disabled) {
    report('録音・WAV作成が終わってから更新してください。');
    return;
  }
  if (!('serviceWorker' in navigator) || !['http:', 'https:'].includes(location.protocol)) {
    report('PWAの更新は、公開されたHTTPSのアプリで利用できます。');
    return;
  }
  button.disabled = true;
  $('record').disabled = true;
  try {
    report('最新版を確認しています…');
    const registration = await navigator.serviceWorker.getRegistration();
    if (!registration) throw new Error('PWAの準備が完了していません。オンラインでページを開き直してください。');
    await registration.update();
    if (registration.installing) {
      report('更新ファイルを準備しています…');
      await waitForWorker(registration.installing, ['installed', 'activated']);
    }
    const worker = registration.waiting;
    if (!worker) {
      report('現在のアプリは最新版です。');
      return;
    }
    if (recordingUrl && !window.confirm('更新すると現在の録音は消えます。必要な録音はWAVで保存してください。更新しますか？')) {
      report('更新を中止しました。録音を保存してから、もう一度更新できます。');
      return;
    }
    allOff();
    report('更新を適用しています…');
    const activated = waitForWorker(worker, ['activated']);
    worker.postMessage({ type: 'SKIP_WAITING' });
    await activated;
    // Activation completes after cache cleanup and clients.claim().
    location.reload();
  } catch (error) {
    report(`更新できませんでした。${error.message}`);
  } finally { button.disabled = false; $('record').disabled = false; }
};
