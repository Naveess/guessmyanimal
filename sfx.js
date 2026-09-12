(function () {
  'use strict';

  /* -- Sound -----------------------------------------------------------
     Synthesised, not sampled: five short envelopes off one oscillator
     voice weigh nothing, need no request, work offline like the rest of
     the site, and can't arrive half-loaded at the moment they're meant
     to land. It also keeps them a family - one timbre bent into five
     shapes - rather than five stock clips that merely coexist.

     Was app.js, loaded only by index.html - so about/browse/privacy/
     streamer had the #soundToggle button and the menu-click convention
     but no engine at all behind either. Standalone now so every page
     loads it (see the <script> tag order below menu.js relies on it),
     and every page's menu click actually plays something.

     Off is remembered; on is the default, since a site that goes quiet
     by default has to be discovered to be heard. */
  const SOUND_KEY = 'gma-mystery-sound';
  let soundOn = (() => { try { return localStorage.getItem(SOUND_KEY) !== 'off'; } catch (e) { return true; } })();
  let audioCtx = null;

  // Built lazily and only ever from inside a gesture handler - a context
  // created before any gesture starts life suspended, and browsers are
  // right to do that.
  function audio() {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    if (!audioCtx) { try { audioCtx = new AC(); } catch (e) { return null; } }
    return audioCtx;
  }

  // A hair of lookahead on every tone, not just the ones that had to wait
  // on a suspended context below - currentTime keeps advancing between
  // "read it" and "schedule against it", and a tone scheduled exactly at
  // an already-past instant is dropped rather than played immediately.
  const LOOKAHEAD = 0.01;

  // One voice. Exponential ramps rather than linear ones because a
  // linear fade to zero on a sine reads as a click at the tail.
  function tone(c, freq, startAt, dur, peak, type) {
    const t0 = c.currentTime + LOOKAHEAD + startAt;
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(freq, t0);
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(peak, t0 + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(gain);
    gain.connect(c.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  // Deliberately quiet (peaks well under 0.1) - this plays over whatever
  // else is going on, and on a stream it sits under a voice. `tap` is
  // the quietest of the lot because it is the one that fires all day.
  const SOUNDS = {
    tap: (c) => tone(c, 520, 0, 0.07, 0.04),
    hint: (c) => { tone(c, 587.33, 0, 0.1, 0.06); tone(c, 880, 0.055, 0.13, 0.045); },
    wrong: (c) => tone(c, 196, 0, 0.17, 0.075, 'triangle'),
    win: (c) => [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(c, f, i * 0.075, 0.2, 0.06)),
    lose: (c) => { tone(c, 329.63, 0, 0.2, 0.06, 'triangle'); tone(c, 220, 0.13, 0.34, 0.055, 'triangle'); },
  };

  function sfx(name) {
    if (!soundOn || !SOUNDS[name]) return;
    const c = audio();
    if (!c) return;
    const play = () => { try { SOUNDS[name](c); } catch (e) {} };
    // A context created (or left) suspended has a frozen currentTime, so
    // scheduling against it immediately and firing resume() alongside
    // was scheduling into the past - the note got dropped, silently,
    // most often on the very first click of a fresh page load. Waiting
    // for resume() to actually settle before reading currentTime again
    // is what fixes that, not just calling it.
    if (c.state === 'suspended') c.resume().then(play, () => {});
    else play();
  }

  // One delegated listener rather than a call in every handler: every
  // control on the site is a <button> or a real link, so this covers the
  // lot - including anything added later - and can't drift out of sync
  // with the markup. Anything that owns a more specific sound opts out
  // with data-sfx="off" and plays its own, so nothing ever doubles up.
  //
  // pointerdown, not click: a real <a href> tears the document down on
  // its default action, and a tone scheduled from a click handler was
  // racing that teardown - audible on a slow/cold navigation, silently
  // cut off on a fast one, which is exactly the "sometimes plays"
  // inconsistency this was reported as. Firing on the press instead of
  // the release buys the tone a head start before navigation can begin.
  document.addEventListener('pointerdown', (e) => {
    const hit = e.target.closest('button, a[href], [role="button"]');
    if (!hit || hit.closest('[data-sfx="off"]')) return;
    sfx('tap');
  });

  window.GMA_SFX = {
    sfx,
    isSoundOn: () => soundOn,
    setSoundOn(v) {
      soundOn = !!v;
      try { localStorage.setItem(SOUND_KEY, soundOn ? 'on' : 'off'); } catch (err) { /* private mode: it just will not persist */ }
    },
  };
})();
