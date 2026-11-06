// Voice in and out, in the browser.
//
// The Worker is text in, text out, so dictation types into the box and reading
// aloud plays back what the report already says. Both use the engine built into
// the phone: nothing here sends the docket anywhere the audit did not already
// go, and the microphone is only open while the button says so.

const FATAL = new Set(['not-allowed', 'service-not-allowed', 'audio-capture', 'network', 'language-not-supported']);

function speechCtor() {
  if (typeof window === 'undefined') return null;
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

export function isDictationSupported() {
  return Boolean(speechCtor());
}

export function isSpeechSupported() {
  return (
    typeof window !== 'undefined' &&
    typeof window.speechSynthesis !== 'undefined' &&
    typeof window.SpeechSynthesisUtterance !== 'undefined'
  );
}

/**
 * Start dictating. Returns { stop() }.
 * onFinal receives each finished phrase; onInterim receives the phrase in flight.
 * Silence does not end the session: the browser stops on a pause and this starts
 * it again, until stop() is called.
 */
export function startDictation({ lang = 'en-US', onFinal, onInterim, onError, onEnd } = {}) {
  const Ctor = speechCtor();
  if (!Ctor) throw new Error('This browser cannot listen. Type or paste instead.');

  const recognition = new Ctor();
  recognition.lang = lang;
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.maxAlternatives = 1;

  let stopping = false;
  let fatal = false;
  let ended = false;
  let restarts = 0;

  const finish = () => {
    if (ended) return;
    ended = true;
    if (onEnd) onEnd();
  };

  recognition.onresult = (event) => {
    let interim = '';
    for (let i = event.resultIndex; i < event.results.length; i += 1) {
      const result = event.results[i];
      const said = (result[0] && result[0].transcript) || '';
      if (result.isFinal) {
        if (onFinal && said.trim()) onFinal(said);
      } else {
        interim += said;
      }
    }
    if (onInterim) onInterim(interim.trim());
  };

  recognition.onerror = (event) => {
    const code = (event && event.error) || 'speech_error';
    if (FATAL.has(code)) fatal = true;
    // Silence and the stop() call are not errors worth showing.
    if (code !== 'no-speech' && code !== 'aborted' && onError) onError(code);
  };

  recognition.onend = () => {
    if (stopping || fatal || restarts > 500) {
      finish();
      return;
    }
    // Every mobile browser ends the session at the first pause, even with
    // `continuous` set. Restart, but only after a beat so it cannot spin.
    restarts += 1;
    window.setTimeout(() => {
      if (stopping) {
        finish();
        return;
      }
      try {
        recognition.start();
      } catch (e) {
        finish();
      }
    }, 150);
  };

  try {
    recognition.start();
  } catch (e) {
    throw new Error('Dictation could not start. Close other apps using the microphone and try again.');
  }

  return {
    stop() {
      stopping = true;
      try {
        recognition.stop();
      } catch (e) {
        /* already stopped */
      }
    },
  };
}

// Markdown is for the eye. Speaking it aloud would read out asterisks and pipes.
function toSpeechText(md) {
  return String(md || '')
    .replace(/```[\s\S]*?```/g, (block) => block.replace(/```[a-z]*\n?/gi, ''))
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/^\s{0,3}#{1,6}\s*/gm, '')
    .replace(/^\s*[-*_]{3,}\s*$/gm, '')
    .replace(/^\s{0,3}>\s?/gm, '')
    .replace(/^\s*(?:[-*+]|\d{1,2}[.)])\s+/gm, '')
    .replace(/^\s*\|.*\|\s*$/gm, (row) => row.replace(/\|/g, ' '))
    .replace(/[*_~`]+/g, '')
    .replace(/-{3,}/g, ' ')
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// Speech engines cut off long utterances, so the report is spoken in pieces.
function toChunks(text, limit = 220) {
  const pieces = text.match(/[^.!?\n]+[.!?]*/g) || [text];
  const chunks = [];
  let current = '';

  const flush = () => {
    if (current.trim()) chunks.push(current.trim());
    current = '';
  };

  for (const piece of pieces) {
    let rest = piece.replace(/\s+/g, ' ').trim();
    while (rest.length > limit) {
      flush();
      let cut = rest.lastIndexOf(' ', limit);
      if (cut < limit * 0.5) cut = limit;
      chunks.push(rest.slice(0, cut).trim());
      rest = rest.slice(cut).trim();
    }
    if (!rest) continue;
    if (`${current} ${rest}`.trim().length > limit) flush();
    current = current ? `${current} ${rest}` : rest;
  }

  flush();
  return chunks;
}

function pickVoice(voices) {
  if (!voices || !voices.length) return null;
  const english = voices.filter((v) => /^en(-|$)/i.test(v.lang || ''));
  const pool = english.length ? english : voices;
  return (
    pool.find((v) => v.lang === 'en-US' && v.localService) ||
    pool.find((v) => v.localService) ||
    pool.find((v) => v.lang === 'en-US') ||
    pool[0]
  );
}

/**
 * Read text aloud. Returns { stop() }.
 */
export function speakText(text, { onEnd, onError, rate = 1 } = {}) {
  if (!isSpeechSupported()) throw new Error('This browser cannot read text aloud.');

  const chunks = toChunks(toSpeechText(text));
  if (!chunks.length) throw new Error('There is nothing to read yet.');

  const synth = window.speechSynthesis;
  try {
    synth.cancel();
  } catch (e) {
    /* nothing playing */
  }

  let stopped = false;
  let index = 0;

  const speakNext = () => {
    if (stopped) return;
    if (index >= chunks.length) {
      if (onEnd) onEnd();
      return;
    }

    const utterance = new window.SpeechSynthesisUtterance(chunks[index]);
    index += 1;

    const voice = pickVoice(synth.getVoices ? synth.getVoices() : null);
    if (voice) {
      utterance.voice = voice;
      utterance.lang = voice.lang;
    } else {
      utterance.lang = 'en-US';
    }
    utterance.rate = rate;

    utterance.onend = speakNext;
    utterance.onerror = (event) => {
      const code = (event && event.error) || 'speech_error';
      if (code === 'interrupted' || code === 'canceled') return;
      if (onError) onError(code);
    };

    synth.speak(utterance);
  };

  speakNext();

  return {
    stop() {
      stopped = true;
      try {
        synth.cancel();
      } catch (e) {
        /* nothing playing */
      }
    },
  };
}

export function stopSpeech() {
  if (!isSpeechSupported()) return;
  try {
    window.speechSynthesis.cancel();
  } catch (e) {
    /* nothing playing */
  }
}
