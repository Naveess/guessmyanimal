/* Party mode: one page, both roles.
 *
 * Hosting and playing render the same round (the same blurred photo,
 * the same hints, the same scoreboard) - only the controls at the
 * bottom differ, toggled by which role opened the page. There's no
 * separate OBS overlay any more: the host's own tab reads Twitch chat
 * directly (the same anonymous-IRC-over-WebSocket technique the old
 * overlay page used), so whatever's on screen here is what's on
 * screen, full stop. See TODO.md for the design history.
 *
 * Both roles poll /api/party/session on the same 1.2s loop stream.js
 * pioneered, and both check guesses client-side (GameCore's matches())
 * before ever POSTing - the API decides who won a round, not whether a
 * guess was right.
 */
(function () {
  'use strict';

  const el = (id) => document.getElementById(id);
  const { hintsFor, matches, norm, MAX_HINTS, CATEGORY_BUCKETS, slugify, pixelStepFor, thumbAtWidth } = GameCore;
  const BY_SLUG = new Map(ANIMALS.map((a) => [slugify(a.n), a]));
  const BLANK = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

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
  let photoFullSrc = null; // the real thumbnail URL for the current target, once fetched
  let photoForSlug = null; // which target the fetched photo belongs to, so a stale fetch can't paint it late

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

  function targetAnimal() {
    return state ? BY_SLUG.get(state.targetSlug) || null : null;
  }

  /* -- Polling ---------------------------------------------------------
     Self-healing rather than trusting every exit path to tell it to
     stop: the back button leaves through app.js's own routing, which
     knows nothing about this loop. */

  async function poll() {
    if (surface && el('partyview').hidden) { leave(); return; }
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

  function leave() {
    surface = null;
    stopPolling();
    disconnectChat();
  }

  function applyState(data) {
    const roundChanged = data.roundNo !== lastRound;
    const justResolved = data.resolved && !lastResolved && data.roundNo === lastRound;
    const newHint = !roundChanged && data.shown > lastShown;

    state = data;
    if (roundChanged) {
      lastRound = data.roundNo;
      guessedThisRound = false;
      photoFullSrc = null;
      photoForSlug = null;
      loadPhoto();
    }
    lastResolved = data.resolved;
    lastShown = data.shown;

    if (newHint) sfx('hint');
    renderRound({ justResolved, roundChanged });
    if (surface === 'host') ensureChat();
  }

  function onSessionGone() {
    if (surface === 'host') {
      clearStore(HOST_STORE);
      code = null; hostKey = null; state = null;
      disconnectChat();
      showSetup();
    } else if (surface === 'player') {
      el('partyPlayerMsg').textContent = 'That party has finished, or the code was wrong.';
      el('partyPlayerMsg').hidden = false;
      el('partyActive').hidden = true;
      stopPolling();
    }
  }

  /* -- Photo: same real-tiny-thumbnail pixelation Mystery Animal uses,
     never a CSS filter - see game-core.js's pixelStepFor/thumbAtWidth
     for why. ------------------------------------------------------- */

  function setPhotoSrc(src) {
    const img = el('partyPhotoImg');
    const hero = el('partyHero');
    img.onerror = () => hero.classList.remove('has-photo');
    img.onload = () => hero.classList.add('has-photo');
    img.src = src;
    el('partyPhotoBg').src = src;
  }

  function applyPixelation() {
    if (!photoFullSrc || !state) return;
    const hero = el('partyHero');
    if (state.resolved) { setPhotoSrc(photoFullSrc); return; }
    const step = pixelStepFor(state.shown);
    const tiny = step === 0 ? photoFullSrc : thumbAtWidth(photoFullSrc, step);
    if (!tiny) { hero.classList.remove('has-photo'); return; }
    setPhotoSrc(tiny);
  }

  function resetHero() {
    const hero = el('partyHero');
    hero.classList.remove('has-photo', 'revealed');
    hero.classList.add('is-loading');
    const img = el('partyPhotoImg');
    img.onerror = null; img.onload = null; img.alt = '';
    img.src = BLANK;
    el('partyPhotoBg').src = BLANK;
    el('partyPhotoName').textContent = '';
    el('partyPhotoEmoji').textContent = '';
    el('partyPhotoSub').textContent = '';
  }

  function loadPhoto() {
    resetHero();
    const a = targetAnimal();
    if (!a || !window.GMA || typeof GMA.loadSummary !== 'function') {
      el('partyHero').classList.remove('is-loading');
      return;
    }
    const wantSlug = state.targetSlug;
    GMA.loadSummary(a).then((data) => {
      if (wantSlug !== (state && state.targetSlug)) return; // a newer round already started
      el('partyHero').classList.remove('is-loading');
      const src = data && data.thumbnail && data.thumbnail.source;
      if (!src) return;
      photoFullSrc = src;
      photoForSlug = wantSlug;
      applyPixelation();
    });
  }

  function revealHero() {
    const a = targetAnimal();
    el('partyPhotoImg').alt = a ? a.n : '';
    el('partyPhotoName').textContent = a ? a.n : '';
    el('partyPhotoEmoji').textContent = a ? (a.e || '') : '';
    el('partyPhotoSub').textContent = a ? (a.c + ' · ' + a.r[0]) : '';
    el('partyHero').classList.add('revealed');
  }

  /* -- Shared round rendering ------------------------------------------ */

  function renderHintList() {
    const box = el('partyHints');
    box.innerHTML = '';
    const a = targetAnimal();
    if (!a || !state) return;
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

  function renderScores() {
    const box = el('partyScores');
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

  function renderRound(opts) {
    if (!state) return;

    if (opts && opts.roundChanged) {
      el('partyGuess').value = '';
      el('partyFeedback').textContent = '';
    }

    applyPixelation();
    renderHintList();
    renderScores();

    el('partyRoundLabel').textContent = surface === 'host'
      ? 'Round ' + state.roundNo + ' · Hint ' + Math.min(state.shown, MAX_HINTS) + ' of ' + MAX_HINTS
      : 'Round ' + state.roundNo;

    const done = state.resolved;
    const a = targetAnimal();

    if (done) revealHero();

    if (surface === 'host') {
      el('partyHint').disabled = done || state.shown >= MAX_HINTS;
      el('partyHint').hidden = done;
      el('partyNext').hidden = !done;
    } else if (surface === 'player') {
      el('partyGuessForm').hidden = done;
    }

    el('partyResult').hidden = !done;
    if (done) {
      if (surface === 'player') {
        const mine = state.lastWinner && playerName && state.lastWinner === playerName;
        el('partyResult').textContent = mine
          ? 'You got it — ' + (a ? a.n : '') + '!'
          : (state.lastWinner ? state.lastWinner + ' got it — ' + (a ? a.n : '') + '.' : 'Round over — ' + (a ? a.n : '') + '.');
        el('partyResult').classList.toggle('is-mine', !!mine);
      } else {
        el('partyResult').textContent = state.lastWinner
          ? state.lastWinner + ' got it — ' + (a ? a.n : '') + '.'
          : 'Round over — ' + (a ? a.n : '') + '.';
        el('partyResult').classList.remove('is-mine');
      }
    }

    if (opts && opts.justResolved) {
      sfx(surface === 'player' && state.lastWinner === playerName ? 'win' : (surface === 'host' ? 'win' : 'hint'));
    }
  }

  /* -- Entry / navigation ------------------------------------------------ */

  function enterPage() {
    document.body.className = 'view-mystery';
    el('home').hidden = true;
    el('animalview').hidden = true;
    el('mysteryview').hidden = true;
    el('partyview').hidden = false;
    if (window.GMA && typeof GMA.setMenu === 'function') GMA.setMenu(false);
    // #searchunit is a shared node app.js re-parents into whichever view
    // is showing - without this, a direct load here (every join link and
    // QR scan) leaves it stranded over this view's own topbar.
    if (window.GMA && typeof GMA.dock === 'function') GMA.dock('home');
    window.scrollTo(0, 0);
  }

  function showSetup() {
    el('partyTitleText').textContent = 'Party Mode';
    el('partySetup').hidden = false;
    el('partyNameForm').hidden = true;
    el('partyActive').hidden = true;
    el('partyPlayerMsg').hidden = true;
  }

  function showActiveRound() {
    el('partyTitleText').textContent = 'Party ' + code;
    el('partySetup').hidden = true;
    el('partyNameForm').hidden = true;
    el('partyActive').hidden = false;
    el('partyPlayerMsg').hidden = true;

    const isHost = surface === 'host';
    el('partyInvite').hidden = !isHost;
    el('partyHint').hidden = !isHost;
    el('partyEnd').hidden = !isHost;
    el('partyYouLabel').hidden = isHost || !playerName;
    el('partyGuessForm').hidden = isHost;

    if (isHost) {
      const joinUrl = location.origin + '/?party=' + code;
      el('partyJoinUrl').value = joinUrl;
      el('partyCode').textContent = code;
      renderQr(joinUrl);
    } else {
      el('partyPlayerNameLabel').textContent = playerName || '';
    }
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

  /* -- Host -------------------------------------------------------------- */

  function openPartyHost(opts) {
    surface = 'host';
    enterPage();
    if (!(opts && opts.noPush) && window.GMA && typeof GMA.push === 'function') GMA.push('?party=1');

    const saved = getHostSession();
    if (saved && saved.code && saved.hostKey) {
      code = saved.code;
      hostKey = saved.hostKey;
      lastRound = 0; lastResolved = false; lastShown = 0;
      showActiveRound();
      startPolling();
    } else {
      showSetup();
    }
  }

  el('partyOpen').addEventListener('click', () => openPartyHost());

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
      lastRound = 0; lastResolved = false; lastShown = 0;
      setStore(HOST_STORE, JSON.stringify({ code, hostKey }));
      showActiveRound();
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
      renderRound({});
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
    lastRound = 0; lastResolved = false; lastShown = 0;
    stopPolling();
    disconnectChat();
    showSetup();
  });

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

  /* -- Twitch chat, read directly in this tab ---------------------------
     Twitch's chat IRC accepts anonymous read-only connections: connect
     as justinfanNNNNN, JOIN a channel, every message arrives as a
     PRIVMSG. No OAuth, no Twitch developer app - which is why this can
     live in an ordinary browser tab instead of needing a server that
     can hold a persistent connection (Cloudflare Pages Functions can't).
     Ported from the OBS overlay this replaced. --------------------- */

  let chat = null;
  let joinedChannel = null;
  let reconnectDelay = 1000;
  let reconnectTimer = null;
  let sendingGuess = false; // one guess POST in flight at a time

  function ensureChat() {
    const want = state && state.twitchChannel ? state.twitchChannel : null;
    if (!want) { disconnectChat(); return; }
    if (joinedChannel === want && chat && chat.readyState <= 1) return;
    connectChat(want);
  }

  function disconnectChat() {
    joinedChannel = null;
    if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
    if (chat) { try { chat.close(); } catch (e) {} chat = null; }
    el('partyChatStatus').hidden = true;
  }

  function setChatStatus(text, cls) {
    const node = el('partyChatStatus');
    node.hidden = false;
    node.textContent = text;
    node.className = 'party-chat' + (cls ? ' ' + cls : '');
  }

  function connectChat(channel) {
    joinedChannel = channel;
    setChatStatus('Connecting to ' + channel + "'s chat…");

    let ws;
    try { ws = new WebSocket('wss://irc-ws.chat.twitch.tv:443'); }
    catch (err) { scheduleReconnect(channel); return; }
    chat = ws;

    ws.addEventListener('open', () => {
      reconnectDelay = 1000;
      // Anonymous read-only: any justinfan* nick is accepted without a
      // token. No CAP request - plain PRIVMSG lines are all this needs.
      ws.send('NICK justinfan' + Math.floor(Math.random() * 90000 + 10000));
      ws.send('JOIN #' + channel);
      setChatStatus('Reading ' + channel + "'s chat", 'is-live');
    });

    ws.addEventListener('message', (e) => {
      String(e.data).split('\r\n').forEach((line) => {
        if (!line) return;
        if (line.indexOf('PING') === 0) { ws.send('PONG :tmi.twitch.tv'); return; }
        const m = line.match(/^:([^!]+)![^ ]+ PRIVMSG #[^ ]+ :(.*)$/);
        if (m) handleChatLine(m[1], m[2]);
      });
    });

    ws.addEventListener('close', () => {
      if (chat === ws && joinedChannel === channel) setChatStatus('Chat disconnected — reconnecting…', 'is-down');
      scheduleReconnect(channel);
    });
    ws.addEventListener('error', () => { try { ws.close(); } catch (err) {} });
  }

  function scheduleReconnect(channel) {
    if (joinedChannel !== channel) return; // ensureChat() already moved on
    reconnectTimer = setTimeout(() => { if (joinedChannel === channel) connectChat(channel); }, reconnectDelay);
    reconnectDelay = Math.min(reconnectDelay * 2, 30000);
  }

  // A public chat is much noisier than a solo guess box, and every
  // message here would otherwise reach the fuzzy matcher - which is
  // tolerant by design ("gorila" should count) and so is exactly the
  // wrong thing to point at general conversation. Filtered first, cost
  // nothing:
  const MAX_GUESS_LEN = 40;
  function looksLikeAGuess(text) {
    const t = text.trim();
    if (!t || t.length > MAX_GUESS_LEN) return false;
    if (t[0] === '!' || t[0] === '/') return false;      // bot commands
    if (/https?:\/\//i.test(t)) return false;             // links
    if (/^@/.test(t)) return false;                        // replies to other chatters
    return true;
  }

  // Chat doesn't answer the way a guess box does. "leopard" is a guess
  // and so is "is it a leopard?", and refusing the second one makes the
  // game feel broken to everyone watching. So a bare message still gets
  // GameCore's normal typo tolerance, and a longer one is additionally
  // scanned for the animal's name as a complete run of words.
  //
  // Deliberately exact inside a sentence, never fuzzy: the pool has
  // animals called Swift, Crane, Seal and Ray, and fuzzy-matching those
  // against ordinary conversation would end rounds nobody was guessing
  // in - a much worse failure than a missed phrasing, since first
  // correct answer takes the round outright.
  function chatMatches(text, a) {
    if (matches(text, a)) return true;
    const words = norm(text).split(' ').filter(Boolean);
    const names = [a.n].concat(a.a || []).map(norm);
    for (const name of names) {
      const nw = name.split(' ').filter(Boolean);
      if (!nw.length || nw.length > words.length) continue;
      for (let i = 0; i + nw.length <= words.length; i++) {
        if (nw.every((w, j) => w === words[i + j])) return true;
      }
    }
    return false;
  }

  async function handleChatLine(username, text) {
    if (!state || state.resolved || sendingGuess) return;
    if (!looksLikeAGuess(text)) return;

    const a = targetAnimal();
    if (!a || !chatMatches(text, a)) return;

    const roundNo = state.roundNo;
    const hintsShown = state.shown;
    sendingGuess = true;
    try {
      await fetch('api/party/guess', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ code, playerName: username, hintsShown, roundNo, source: 'twitch' }),
      });
      poll();
    } catch (err) { /* the round just stays open - chat will say it again */ }
    finally { sendingGuess = false; }
  }

  /* -- Player (?party=CODE) ----------------------------------------------- */

  function openPartyPlayer(joinCode, opts) {
    surface = 'player';
    code = String(joinCode || '').toUpperCase();
    state = null;
    lastRound = 0; lastResolved = false; lastShown = 0;
    guessedThisRound = false;

    enterPage();
    if (!(opts && opts.noPush) && window.GMA && typeof GMA.push === 'function') GMA.push('?party=' + code);

    el('partyTitleText').textContent = 'Party ' + code;
    el('partySetup').hidden = true;
    el('partyActive').hidden = true;
    el('partyPlayerMsg').hidden = true;

    playerName = getStore(NAME_STORE);
    if (playerName) {
      el('partyNameForm').hidden = true;
      showActiveRound();
      startPolling();
    } else {
      el('partyNameForm').hidden = false;
    }
  }

  el('partyNameForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const name = el('partyName').value.trim().slice(0, 24);
    if (!name) return;
    playerName = name;
    setStore(NAME_STORE, name);
    el('partyNameForm').hidden = true;
    showActiveRound();
    startPolling();
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
    leave();
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

  window.openPartyHost = openPartyHost;
  window.openPartyPlayer = openPartyPlayer;
})();
