/* Party mode, both ends of it that live on the main site:
 *
 *  - the HOST controls (a dialog off the corner menu) - start a party,
 *    reveal hints, move to the next round, watch the scoreboard, and
 *    hand out the join QR code and the OBS overlay link.
 *  - the PLAYER view (?party=CODE) - the QR code's destination. Name
 *    yourself once, then see the same hints and type guesses.
 *
 * The third surface, the OBS overlay that reads Twitch chat, is its own
 * page (party-overlay.html) because OBS's Browser Source is a separate
 * browser process - the same reason Stream Mode has stream.html.
 *
 * Both surfaces here poll /api/party/session on the same 1.2s loop
 * stream.js already uses, and both check guesses client-side (GameCore's
 * matches()) before ever POSTing - the API decides who won a round, not
 * whether a guess was right.
 */
(function () {
  'use strict';

  const el = (id) => document.getElementById(id);
  const { hintsFor, matches, MAX_HINTS, CATEGORY_BUCKETS, slugify } = GameCore;
  const BY_SLUG = new Map(ANIMALS.map((a) => [slugify(a.n), a]));

  const HOST_STORE = 'gma-party-host';  // {code, hostKey} - so a host refresh resumes rather than orphaning the party
  const NAME_STORE = 'gma-party-name';

  const POLL_MS = 1200;

  let surface = null;      // 'host' | 'player' | null - which one is on screen, and so whether to poll
  let code = null;
  let hostKey = null;
  let playerName = null;
  let state = null;        // latest /api/party/session payload
  let pollTimer = null;
  let lastRound = 0;
  let lastResolved = false;
  let lastShown = 0;
  let guessedThisRound = false;

  function getStore(key) { try { return localStorage.getItem(key) || ''; } catch (e) { return ''; } }
  function setStore(key, v) { try { localStorage.setItem(key, v); } catch (e) {} }
  function clearStore(key) { try { localStorage.removeItem(key); } catch (e) {} }

  function getHostSession() {
    try { return JSON.parse(getStore(HOST_STORE) || 'null'); } catch (e) { return null; }
  }

  function sfx(name) {
    if (window.GMA && typeof GMA.sfx === 'function') GMA.sfx(name);
  }

  async function api(path, body) {
    const res = await fetch('api/party/' + path, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    return res.json();
  }

  /* -- Polling ------------------------------------------------------- */

  async function poll() {
    // Self-healing rather than trusting every exit to tell us: the back
    // button leaves the player view through app.js's own routing, which
    // knows nothing about this poll loop. If the view isn't on screen
    // any more, there's nothing to poll for.
    if (surface === 'player' && el('partyview').hidden) { surface = null; stopPolling(); return; }
    if (!surface || !code) return;
    try {
      const res = await fetch('api/party/session?code=' + encodeURIComponent(code));
      if (res.status === 404) { onSessionGone(); return; }
      const data = await res.json();
      if (data.error) return;
      applyState(data);
    } catch (err) { /* offline for a beat - the next poll picks it back up */ }
  }

  function startPolling() {
    stopPolling();
    poll();
    pollTimer = setInterval(poll, POLL_MS);
  }

  function stopPolling() {
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = null;
  }

  function applyState(data) {
    const roundChanged = data.roundNo !== lastRound;
    const justResolved = data.resolved && !lastResolved && data.roundNo === lastRound;
    const newHint = !roundChanged && data.shown > lastShown;

    state = data;
    if (roundChanged) {
      lastRound = data.roundNo;
      guessedThisRound = false;
    }
    lastResolved = data.resolved;
    lastShown = data.shown;

    if (newHint) sfx('hint');
    if (surface === 'host') renderHost({ justResolved, roundChanged });
    else if (surface === 'player') renderPlayer({ justResolved, roundChanged });
  }

  function onSessionGone() {
    if (surface === 'host') {
      clearStore(HOST_STORE);
      code = null; hostKey = null; state = null;
      showHostSetup();
    } else if (surface === 'player') {
      el('partyPlayerMsg').textContent = "That party has finished, or the code was wrong.";
      el('partyPlayerMsg').hidden = false;
      stopPolling();
    }
  }

  function targetAnimal() {
    return state ? BY_SLUG.get(state.targetSlug) || null : null;
  }

  /* -- Shared rendering ---------------------------------------------- */

  // The hint list, as far as it's been revealed. Same content and order
  // as Mystery Animal's own, so a player who knows one knows the other.
  function renderHintList(box) {
    box.innerHTML = '';
    const a = targetAnimal();
    if (!a) return;
    const all = hintsFor(a);
    for (let i = 0; i < Math.min(state.shown, all.length); i++) {
      if (!all[i]) continue;
      const row = document.createElement('p');
      row.className = 'party-hint';
      row.style.setProperty('--i', i);
      const n = document.createElement('span');
      n.className = 'party-hint-n';
      n.textContent = String(i + 1);
      const t = document.createElement('span');
      t.textContent = all[i];
      row.append(n, t);
      box.appendChild(row);
    }
  }

  function renderScores(box) {
    box.innerHTML = '';
    if (!state || !state.scores.length) {
      const empty = document.createElement('p');
      empty.className = 'party-scores-empty';
      empty.textContent = 'No one on the board yet.';
      box.appendChild(empty);
      return;
    }
    state.scores.forEach((s, i) => {
      const row = document.createElement('div');
      row.className = 'party-score';
      if (state.lastWinner && s.playerName === state.lastWinner && state.resolved) row.classList.add('is-winner');
      const rank = document.createElement('span');
      rank.className = 'party-score-rank';
      rank.textContent = String(i + 1);
      const name = document.createElement('span');
      name.className = 'party-score-name';
      name.textContent = s.playerName;
      if (s.source === 'twitch') name.classList.add('is-twitch');
      const pts = document.createElement('b');
      pts.className = 'party-score-pts';
      pts.textContent = String(s.score);
      row.append(rank, name, pts);
      box.appendChild(row);
    });
  }

  /* -- Host ---------------------------------------------------------- */

  const partyDlg = el('partyDlg');

  function openParty() {
    if (window.GMA && typeof GMA.setMenu === 'function') GMA.setMenu(false);
    surface = 'host';

    const saved = getHostSession();
    if (saved && saved.code && saved.hostKey) {
      code = saved.code;
      hostKey = saved.hostKey;
      showHostActive();
      startPolling();
    } else {
      showHostSetup();
    }

    if (typeof partyDlg.showModal === 'function') partyDlg.showModal();
    else partyDlg.setAttribute('open', '');
  }

  function closeParty() {
    surface = null;
    stopPolling();
    partyDlg.close();
  }

  function showHostSetup() {
    el('partySetup').hidden = false;
    el('partyActive').hidden = true;
  }

  function showHostActive() {
    el('partySetup').hidden = true;
    el('partyActive').hidden = false;
    el('partyCode').textContent = code;

    const joinUrl = location.origin + '/?party=' + code;
    const overlayUrl = location.origin + '/party-overlay?code=' + code;
    el('partyJoinUrl').value = joinUrl;
    el('partyOverlayUrl').value = overlayUrl;
    renderQr(joinUrl);
  }

  function renderQr(text) {
    const box = el('partyQr');
    try {
      const qr = qrcode(0, 'M');
      qr.addData(text);
      qr.make();
      box.innerHTML = qr.createSvgTag({ cellSize: 4, margin: 2, scalable: true });
    } catch (err) {
      // A QR code failing is not a reason to lose the party - the code
      // and the link right next to it do the same job.
      box.innerHTML = '';
    }
  }

  function renderHost(opts) {
    if (!state) return;
    renderHintList(el('partyHostHints'));
    renderScores(el('partyHostScores'));

    el('partyRound').textContent = 'Round ' + state.roundNo;
    el('partyHintCount').textContent = Math.min(state.shown, MAX_HINTS) + ' of ' + MAX_HINTS;

    const a = targetAnimal();
    el('partyAnswer').textContent = a ? a.n : '';

    const done = state.resolved;
    el('partyHint').disabled = done || state.shown >= MAX_HINTS;
    el('partyNext').hidden = !done;
    el('partyResult').hidden = !done;
    if (done) {
      el('partyResult').textContent = state.lastWinner
        ? state.lastWinner + ' got it — ' + (a ? a.n : '') + '.'
        : 'Round over — ' + (a ? a.n : '') + '.';
    }

    if (opts && opts.justResolved) sfx('win');
  }

  el('partyStart').addEventListener('click', async () => {
    const btn = el('partyStart');
    btn.disabled = true;
    el('partySetupMsg').textContent = '';
    try {
      const data = await api('create', {
        category: el('partyCategory').value,
        twitchChannel: el('partyTwitch').value.trim(),
      });
      if (data.error) {
        el('partySetupMsg').textContent =
          data.error === 'bad twitch channel'
            ? "That doesn't look like a Twitch channel name — letters, numbers and underscores only."
            : 'Could not start the party. Try again in a moment.';
        return;
      }
      code = data.code;
      hostKey = data.hostKey;
      lastRound = 0;
      lastResolved = false;
      setStore(HOST_STORE, JSON.stringify({ code, hostKey }));
      showHostActive();
      startPolling();
    } catch (err) {
      el('partySetupMsg').textContent = 'Could not reach the server. Check your connection and try again.';
    } finally {
      btn.disabled = false;
    }
  });

  el('partyHint').addEventListener('click', async () => {
    if (!code || !hostKey) return;
    el('partyHint').disabled = true;
    const data = await api('hint', { code, hostKey }).catch(() => null);
    if (data && !data.error && state) {
      state.shown = data.shown;
      renderHost({});
    }
    poll();
  });

  el('partyNext').addEventListener('click', async () => {
    if (!code || !hostKey) return;
    el('partyNext').disabled = true;
    await api('next', { code, hostKey }).catch(() => null);
    el('partyNext').disabled = false;
    poll();
  });

  el('partyEnd').addEventListener('click', () => {
    // The session just goes stale on the server - there's nothing to
    // close, and nothing stored anywhere that a next party would trip
    // over. This is only "forget it on this device".
    clearStore(HOST_STORE);
    code = null; hostKey = null; state = null;
    lastRound = 0; lastResolved = false;
    stopPolling();
    showHostSetup();
  });

  el('partyOpen').addEventListener('click', openParty);
  el('partyClose').addEventListener('click', closeParty);
  el('partyDone').addEventListener('click', closeParty);
  // A host closing this dialog with Escape or the backdrop is leaving
  // the party running, not ending it - the code and hostKey stay in
  // localStorage, and reopening resumes exactly where it was.
  partyDlg.addEventListener('close', () => { surface = null; stopPolling(); });

  function copyFrom(inputId, statusId) {
    return async () => {
      const input = el(inputId);
      try {
        await navigator.clipboard.writeText(input.value);
        el(statusId).textContent = 'Copied.';
      } catch (err) {
        input.select();
        el(statusId).textContent = "Couldn't copy — selected it instead, copy with Ctrl/Cmd+C.";
      }
    };
  }
  el('partyJoinCopy').addEventListener('click', copyFrom('partyJoinUrl', 'partyCopyStatus'));
  el('partyOverlayCopy').addEventListener('click', copyFrom('partyOverlayUrl', 'partyCopyStatus'));

  /* -- Player (?party=CODE) ------------------------------------------ */

  function openPartyPlayer(joinCode, opts) {
    surface = 'player';
    code = String(joinCode || '').toUpperCase();
    state = null;
    lastRound = 0;
    lastResolved = false;
    guessedThisRound = false;

    // Same body class as Mystery Animal: everything that isn't the
    // yellow splash wants the plain paper ground, and view-mystery
    // already means exactly that.
    document.body.className = 'view-mystery';
    el('home').hidden = true;
    el('animalview').hidden = true;
    el('mysteryview').hidden = true;
    el('partyview').hidden = false;
    if (window.GMA && typeof GMA.setMenu === 'function') GMA.setMenu(false);
    // #searchunit is one shared node app.js re-parents into whichever
    // view is showing. Without this, a direct ?party=CODE load - which
    // is every QR code scan and every join link, so the normal way in
    // here - leaves it stranded at its raw DOM position, floating over
    // this view's topbar. Same trap mystery.js documents.
    if (window.GMA && typeof GMA.dock === 'function') GMA.dock('home');
    if (!(opts && opts.noPush) && window.GMA && typeof GMA.push === 'function') GMA.push('?party=' + code);

    playerName = getStore(NAME_STORE);
    el('partyPlayerMsg').hidden = true;
    if (playerName) {
      el('partyNameForm').hidden = true;
      el('partyPlay').hidden = false;
      el('partyPlayerName').textContent = playerName;
    } else {
      el('partyNameForm').hidden = false;
      el('partyPlay').hidden = true;
    }

    el('partyJoinCode').textContent = code;
    startPolling();
  }

  function renderPlayer(opts) {
    if (!state) return;
    renderHintList(el('partyPlayerHints'));
    renderScores(el('partyPlayerScores'));
    el('partyPlayerRound').textContent = 'Round ' + state.roundNo;

    const a = targetAnimal();
    const done = state.resolved;
    el('partyGuessForm').hidden = done;
    el('partyPlayerResult').hidden = !done;
    if (done) {
      const mine = state.lastWinner && playerName && state.lastWinner === playerName;
      el('partyPlayerResult').textContent = mine
        ? 'You got it — ' + (a ? a.n : '') + '!'
        : (state.lastWinner ? state.lastWinner + ' got it — ' + (a ? a.n : '') + '.' : 'Round over — ' + (a ? a.n : '') + '.');
      el('partyPlayerResult').classList.toggle('is-mine', !!mine);
    }

    if (opts && opts.roundChanged) {
      el('partyGuess').value = '';
      el('partyFeedback').textContent = '';
    }
    if (opts && opts.justResolved) sfx(state.lastWinner === playerName ? 'win' : 'hint');
  }

  el('partyNameForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const name = el('partyName').value.trim().slice(0, 24);
    if (!name) return;
    playerName = name;
    setStore(NAME_STORE, name);
    el('partyNameForm').hidden = true;
    el('partyPlay').hidden = false;
    el('partyPlayerName').textContent = name;
    el('partyGuess').focus();
  });

  el('partyGuessForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const raw = el('partyGuess').value.trim();
    if (!raw || !state || state.resolved || guessedThisRound) return;

    const a = targetAnimal();
    if (!a) return;

    if (!matches(raw, a)) {
      el('partyFeedback').textContent = 'Not that one — keep going.';
      el('partyGuess').select();
      sfx('wrong');
      return;
    }

    // Right as far as this device is concerned - the API still decides
    // whether it got here first.
    guessedThisRound = true;
    el('partyGuess').value = '';
    el('partyFeedback').textContent = 'Correct! Checking who got there first…';

    const data = await api('guess', {
      code,
      playerName,
      hintsShown: state.shown,
      roundNo: state.roundNo,
      source: 'local',
    }).catch(() => null);

    if (data && data.won) {
      el('partyFeedback').textContent = 'You got it, +' + data.points + '.';
      sfx('win');
    } else {
      el('partyFeedback').textContent = 'Right answer — someone just beat you to it.';
      guessedThisRound = false;
    }
    poll();
  });

  el('partyLeave').addEventListener('click', () => {
    surface = null;
    stopPolling();
    if (window.GMA && typeof GMA.goHome === 'function') GMA.goHome();
  });

  /* -- Category options ---------------------------------------------- */

  const catSelect = el('partyCategory');
  CATEGORY_BUCKETS.forEach((b) => {
    const opt = document.createElement('option');
    opt.value = b.key;
    opt.textContent = b.label;
    catSelect.appendChild(opt);
  });

  window.openParty = openParty;
  window.openPartyPlayer = openPartyPlayer;
})();
