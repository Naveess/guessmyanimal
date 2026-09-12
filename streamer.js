/* Twitch stream mode: one streamer, a whole chat guessing.
 *
 * Deliberately not local Party Mode with a Twitch field bolted on. One
 * host plus hundreds of anonymous chat viewers is a different problem
 * from six people in a room with their own phones: nobody here has a
 * tab to heartbeat from, nobody picked an emoji, and nobody can be
 * asked to fix a clashing name. So there's no presence, no rename, no
 * join roster and no icon picker - just a round on screen and a
 * leaderboard sized to be read off a compressed video feed.
 *
 * Chat is read the same way it always was: Twitch's IRC accepts
 * anonymous read-only connections (justinfanNNNNN, JOIN, PRIVMSG), no
 * token and no CAP negotiation needed, which is why it can live in an
 * ordinary browser tab. Cloudflare Pages Functions can't hold a
 * persistent connection, so this tab *is* the reader - closing it stops
 * chat play, by design rather than by oversight.
 *
 * The Twitch login (functions/api/twitch/*.js) is unrelated to reading
 * chat and isn't needed for it. It exists only so the channel name
 * fills itself in and is certain to be the streamer's own.
 *
 * Guesses are decided by the server, not here: chatMatches() below is a
 * volume filter so a busy chat doesn't POST every line to D1, and
 * guess.js re-checks everything that does arrive. See its header.
 */
(function () {
  'use strict';

  const el = (id) => document.getElementById(id);
  const { hintsFor, MAX_HINTS, CATEGORY_BUCKETS, skipCategoryFor, slugify, pixelStepFor, thumbAtWidth,
          chatMatches, looksLikeAGuess } = GameCore;
  const BY_SLUG = new Map(ANIMALS.map((a) => [slugify(a.n), a]));
  const BLANK = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

  // Its own key, not party.js's - a host can legitimately have a local
  // party and a stream session going on the same device, and resuming
  // one must never resume the other.
  const HOST_STORE = 'gma-streamer-host';  // {code, hostKey}
  const CHAT_ICON = '💬';                   // a chat guesser never picked one - see _lib.js
  const POLL_MS = 1200;
  const JOIN_TIMEOUT_MS = 8000;
  const BOARD_TOP_N = 8;

  let code = null;
  let hostKey = null;
  let connectedLogin = null; // from ?tw_login=, only until the session is created
  let state = null;          // latest /api/party/session payload
  let pollTimer = null;
  let lastRound = 0;
  let lastResolved = false;
  let lastShown = 0;
  let photoFullSrc = null;
  let renderedHints = { round: 0, count: 0 };
  let clockOffsetMs = 0;     // serverNow - Date.now(), so the local tick corrects for a wrong viewer clock
  let frozenTimerMs = null;  // remaining time at the instant the round finished, so the stat freezes instead of drifting negative

  function getStore(key) { try { return localStorage.getItem(key) || ''; } catch (e) { return ''; } }
  function setStore(key, v) { try { localStorage.setItem(key, v); } catch (e) {} }
  function clearStore(key) { try { localStorage.removeItem(key); } catch (e) {} }
  function getHostSession() {
    try { return JSON.parse(getStore(HOST_STORE) || 'null'); } catch (e) { return null; }
  }

  // Unlike party.js/mystery.js (views inside index.html, routed through
  // app.js's window.GMA.sfx), this is a standalone page that loads
  // sfx.js itself - straight to window.GMA_SFX, no app.js in between.
  function sfx(name) {
    if (window.GMA_SFX) GMA_SFX.sfx(name);
  }

  async function api(path, body) {
    const res = await fetch('api/party/' + path, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) console.error('api/' + path + ': ' + res.status + ' —', data && data.error);
    return data;
  }

  function targetAnimal() {
    return state ? BY_SLUG.get(state.targetSlug) || null : null;
  }

  /* -- Wikipedia summary: same endpoint and cache shape app.js uses,
     repeated here rather than shared because this page deliberately
     doesn't load app.js (no search, no routing, nothing else it owns). */

  const summaryCache = new Map();
  function wikiTitle(a) { return a.w || a.n.replace(/ /g, '_'); }
  function loadSummary(a) {
    const title = wikiTitle(a);
    if (summaryCache.has(title)) return summaryCache.get(title);
    const p = fetch('https://en.wikipedia.org/api/rest_v1/page/summary/' + encodeURIComponent(title))
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null);
    summaryCache.set(title, p);
    return p;
  }

  /* -- Screens ---------------------------------------------------------- */

  // .streamer-feed's width is a plain JS-toggled class, not a CSS :has()
  // condition on #streamerDashboard's own hidden state - :has() covering
  // this exact "widen only in one sub-state" job is what local Party
  // Mode's .partyview rule does, but it clearly isn't reliable enough
  // here to hang a load-bearing layout decision on. An explicit class
  // set right alongside the same hidden toggles below is trivial to
  // reason about and can't silently fail the way a selector can.
  const feedEl = document.querySelector('.streamer-feed');
  function setWide(wide) { if (feedEl) feedEl.classList.toggle('is-wide', wide); }

  function showConnect(msg) {
    el('streamerConnect').hidden = false;
    el('streamerGoLive').hidden = true;
    el('streamerDashboard').hidden = true;
    el('streamerRecap').hidden = true;
    setWide(false);
    el('streamerConnectMsg').textContent = msg || '';
  }

  function showGoLive(login) {
    el('streamerConnect').hidden = true;
    el('streamerGoLive').hidden = false;
    el('streamerDashboard').hidden = true;
    el('streamerRecap').hidden = true;
    setWide(false);
    el('streamerConnectedAs').textContent = login;
  }

  function showDashboard() {
    el('streamerConnect').hidden = true;
    el('streamerGoLive').hidden = true;
    el('streamerDashboard').hidden = false;
    el('streamerRecap').hidden = true;
    setWide(true);
  }

  function showRecap(finalScores) {
    el('streamerConnect').hidden = true;
    el('streamerGoLive').hidden = true;
    el('streamerDashboard').hidden = true;
    el('streamerRecap').hidden = false;
    setWide(false);
    renderBoardInto(el('streamerRecapBoard'), (finalScores || []).slice().sort((a, b) => b.score - a.score), true);
  }

  /* -- Polling ---------------------------------------------------------- */

  async function poll() {
    if (!code) return;
    try {
      const res = await fetch('api/party/session?code=' + encodeURIComponent(code));
      if (res.status === 404) { onSessionGone(); return; }
      const data = await res.json();
      if (data.error) return;
      applyState(data);
    } catch (err) { /* offline for a beat - the next poll picks it back up */ }
  }

  let timerTick = null;

  function startPolling() {
    stopPolling();
    poll();
    pollTimer = setInterval(poll, POLL_MS);
    timerTick = setInterval(renderTimer, 250);
  }

  function stopPolling() {
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = null;
    if (timerTick) clearInterval(timerTick);
    timerTick = null;
  }

  function applyState(data) {
    const roundChanged = data.roundNo !== lastRound;
    const justResolved = data.resolved && !lastResolved && data.roundNo === lastRound;
    const newHint = !roundChanged && data.shown > lastShown;

    state = data;
    if (typeof data.serverNow === 'number') clockOffsetMs = data.serverNow - Date.now();
    if (roundChanged) {
      lastRound = data.roundNo;
      photoFullSrc = null;
      frozenTimerMs = null;
      loadPhoto();
    }
    lastResolved = data.resolved;
    lastShown = data.shown;

    if (newHint) sfx('hint');
    renderRound({ justResolved, roundChanged });
    ensureChat();
  }

  function onSessionGone() {
    clearStore(HOST_STORE);
    code = null; hostKey = null; state = null;
    stopPolling();
    disconnectChat();
    showConnect('That stream session has finished — connect again to start a new one.');
  }

  /* -- Photo: the same real-tiny-thumbnail pixelation every other mode
     uses, never a CSS filter (which would still ship the sharp image to
     the browser) - see game-core.js's pixelStepFor/thumbAtWidth. ---- */

  function setPhotoSrc(src) {
    const img = el('streamerPhotoImg');
    const hero = el('streamerHero');
    img.onerror = () => hero.classList.remove('has-photo');
    img.onload = () => hero.classList.add('has-photo');
    img.src = src;
    el('streamerPhotoBg').src = src;
  }

  function applyPixelation() {
    if (!photoFullSrc || !state) return;
    const hero = el('streamerHero');
    if (state.resolved || state.expired) { setPhotoSrc(photoFullSrc); return; }
    const step = pixelStepFor(state.shown);
    const tiny = step === 0 ? photoFullSrc : thumbAtWidth(photoFullSrc, step);
    if (!tiny) { hero.classList.remove('has-photo'); return; }
    setPhotoSrc(tiny);
  }

  function resetHero() {
    const hero = el('streamerHero');
    hero.classList.remove('has-photo', 'revealed');
    hero.classList.add('is-loading');
    const img = el('streamerPhotoImg');
    img.onerror = null; img.onload = null; img.alt = '';
    img.src = BLANK;
    el('streamerPhotoBg').src = BLANK;
    el('streamerPhotoName').textContent = '';
    el('streamerPhotoEmoji').textContent = '';
    el('streamerPhotoSub').textContent = '';
  }

  function loadPhoto() {
    resetHero();
    const a = targetAnimal();
    if (!a) { el('streamerHero').classList.remove('is-loading'); return; }
    const wantSlug = state.targetSlug;
    loadSummary(a).then((data) => {
      if (wantSlug !== (state && state.targetSlug)) return; // a newer round already started
      el('streamerHero').classList.remove('is-loading');
      const src = data && data.thumbnail && data.thumbnail.source;
      if (!src) return;
      photoFullSrc = src;
      applyPixelation();
    });
  }

  function revealHero() {
    const a = targetAnimal();
    el('streamerPhotoImg').alt = a ? a.n : '';
    el('streamerPhotoName').textContent = a ? a.n : '';
    el('streamerPhotoEmoji').textContent = a ? (a.e || '') : '';
    el('streamerPhotoSub').textContent = a ? (a.c + ' · ' + a.r[0]) : '';
    el('streamerHero').classList.add('revealed');
  }

  /* -- Round rendering --------------------------------------------------- */

  // Append-only for the same reason party.js's is: rebuilding the list
  // every 1.2s poll replays the entrance animation on every row and
  // reads as the whole panel flickering.
  function renderHintList() {
    const box = el('streamerHints');
    const a = targetAnimal();
    if (!a || !state) return;
    const all = hintsFor(a, skipCategoryFor(state.category));
    const want = Math.min(state.shown, all.length);

    if (state.roundNo !== renderedHints.round) {
      box.innerHTML = '';
      renderedHints = { round: state.roundNo, count: 0 };
    }
    if (want <= renderedHints.count) return;

    for (let i = renderedHints.count; i < want; i++) {
      if (!all[i]) continue;
      const row = document.createElement('p');
      row.className = 'party-hint';
      row.style.setProperty('--i', i - renderedHints.count);
      const n = document.createElement('span');
      n.className = 'party-hint-n';
      n.textContent = String(i + 1);
      const t = document.createElement('span');
      t.textContent = all[i];
      row.append(n, t);
      box.appendChild(row);
    }
    renderedHints.count = want;
  }

  function crownEl() {
    const span = document.createElement('span');
    span.className = 'streamer-board-crown';
    span.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="m2 4 3 12h14l3-12-6 7-4-7-4 7Z"/></svg>';
    return span;
  }

  /* -- The chat leaderboard.
     Not .party-score: that row answers "who else is here and which one
     am I", which is meaningless with an anonymous chat of hundreds. This
     one answers "who is winning, readable from across a room" - top few
     only, no presence, no self-marker, and the round's winner called out
     above the standing order. Same underlying design language (crown,
     Sun-deep recolour, tint never fill), its own component. --------- */

  function renderBoardInto(box, scores, isFinal) {
    box.innerHTML = '';
    if (!scores.length) {
      const empty = document.createElement('p');
      empty.className = 'streamer-board-empty';
      empty.textContent = isFinal ? 'Nobody got one this time.' : 'No correct guesses yet — type the animal to get on the board.';
      box.appendChild(empty);
      return;
    }
    scores.slice(0, BOARD_TOP_N).forEach((s, i) => {
      const row = document.createElement('div');
      row.className = 'streamer-board-row';
      if (i === 0 && s.score > 0) row.classList.add('is-leader');
      if (!isFinal && state && state.resolved && state.lastWinner && s.playerName === state.lastWinner) {
        row.classList.add('is-winner');
      }
      // The streamer plays under their own channel name (see the
      // #streamerForm handler), so this is the same "which row is mine"
      // signal .party-score.is-mine gives a local player.
      if (state && state.twitchChannel && s.playerName === state.twitchChannel) row.classList.add('is-mine');
      const rank = document.createElement('span');
      rank.className = 'streamer-board-rank';
      rank.textContent = String(i + 1);
      const icon = document.createElement('span');
      icon.className = 'streamer-board-icon';
      icon.setAttribute('aria-hidden', 'true');
      icon.textContent = s.icon || CHAT_ICON;
      const name = document.createElement('span');
      name.className = 'streamer-board-name';
      name.textContent = s.playerName;
      const pts = document.createElement('b');
      pts.className = 'streamer-board-pts';
      pts.textContent = String(s.score);
      row.append(crownEl(), rank, icon, name, pts);
      box.appendChild(row);
    });
  }

  function renderBoard() {
    renderBoardInto(el('streamerBoard'), (state && state.scores) || [], false);
    const label = el('streamerBoardLabel');
    const total = (state && state.scores) ? state.scores.length : 0;
    label.textContent = total > BOARD_TOP_N
      ? 'Chat leaderboard · top ' + BOARD_TOP_N + ' of ' + total
      : 'Chat leaderboard';
  }

  // Server-authoritative countdown: state.roundEndsAt is a deadline set by
  // create.js/next.js, never by this tab, so a reload or a wrong system
  // clock can't desync it - clockOffsetMs (set from each poll's serverNow)
  // is the only correction applied to the viewer's own Date.now(). Ticks
  // locally at 250ms between the 1.2s polls purely for a smooth display;
  // it never decides anything, session.js's own lazy-expiry check does.
  function renderTimer() {
    const box = el('streamerStatTimerBox');
    const numEl = el('streamerStatTimer');
    const labelEl = el('streamerStatTimerLabel');
    if (!state || !state.roundEndsAt || !state.roundStartedAt) {
      box.classList.remove('is-warn', 'is-bad');
      numEl.textContent = '–';
      labelEl.textContent = 'Time left';
      return;
    }

    const done = state.resolved || state.expired;
    const nowCorrected = Date.now() + clockOffsetMs;
    let remainingMs;
    if (done) {
      if (frozenTimerMs === null) frozenTimerMs = Math.max(0, state.roundEndsAt - nowCorrected);
      remainingMs = frozenTimerMs;
    } else {
      remainingMs = Math.max(0, state.roundEndsAt - nowCorrected);
    }

    const totalMs = state.roundEndsAt - state.roundStartedAt;
    const frac = totalMs > 0 ? remainingMs / totalMs : 0;
    const secs = Math.ceil(remainingMs / 1000);
    numEl.textContent = Math.floor(secs / 60) + ':' + String(secs % 60).padStart(2, '0');

    box.classList.remove('is-warn', 'is-bad');
    if (done) {
      labelEl.textContent = 'Round over';
    } else if (frac <= 0.10) {
      box.classList.add('is-bad');
      labelEl.textContent = 'Almost up!';
    } else if (frac <= 0.30) {
      box.classList.add('is-warn');
      labelEl.textContent = 'Hurry!';
    } else {
      labelEl.textContent = 'Time left';
    }
  }

  function renderRound(opts) {
    if (!state) return;

    if (opts && opts.roundChanged) {
      el('streamerGuess').value = '';
      el('streamerFeedback').textContent = '';
      el('streamerResultCelebrate').innerHTML = '';
    }

    applyPixelation();
    renderHintList();
    renderBoard();
    renderTimer();

    el('streamerStatRound').textContent = String(state.roundNo);
    el('streamerStatHint').textContent = Math.min(state.shown, MAX_HINTS) + '/' + MAX_HINTS;

    const done = state.resolved || state.expired;
    const a = targetAnimal();
    if (done) revealHero();

    el('streamerHint').disabled = done || state.shown >= MAX_HINTS;
    el('streamerHint').hidden = done;
    // .disabled is NOT reset here, unlike streamerHint above - this ran
    // on every ~1.2s poll tick regardless of a next() call already in
    // flight, so a double-click could fire a second next() before the
    // first resolved. party.js's own #partyNext never sets .disabled
    // from renderRound either, for the same reason - the click handler
    // alone owns it, re-enabling only once its own request settles.
    el('streamerNext').hidden = !done;
    el('streamerForm').hidden = done;

    el('streamerResult').hidden = !done;
    if (done) {
      const won = state.lastWinner && state.lastWinner === state.twitchChannel;
      el('streamerResultCard').classList.toggle('is-mine', !!won);
      el('streamerResultEmoji').textContent = a ? (a.e || '🐾') : '🐾';
      el('streamerResultName').textContent = a ? a.n : '';
      el('streamerResultNote').textContent = won
        ? 'You got it!'
        : state.lastWinner ? state.lastWinner + ' got it!'
        : state.expired ? 'Time’s up — nobody got it.'
        : 'Round over.';
    }

    if (opts && opts.justResolved) {
      if (state.lastWinner) celebrate(); else el('streamerResultCelebrate').innerHTML = '';
    }
  }

  // Same particle recipe as Mystery Animal's and local Party Mode's -
  // the target's own emoji plus the paw mark and a sparkle, so the burst
  // reads as "this animal", not stock confetti. Fires for whoever in
  // chat won it; there's no "was it me" question on this surface.
  const CELEBRATE_PARTICLES = [
    { x: '8%', ty: '-64px', r: '-24deg', d: '0s' },
    { x: '28%', ty: '-82px', r: '18deg', d: '.12s' },
    { x: '50%', ty: '-56px', r: '-10deg', d: '.24s' },
    { x: '72%', ty: '-80px', r: '22deg', d: '.12s' },
    { x: '92%', ty: '-62px', r: '-18deg', d: '0s' },
  ];
  function celebrate() {
    const box = el('streamerResultCelebrate');
    box.innerHTML = '';
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const a = targetAnimal();
    const e = (a && a.e) || '🐾';
    const glyphs = [e, '🐾', e, '✨', e];
    for (let i = 0; i < CELEBRATE_PARTICLES.length; i++) {
      const p = CELEBRATE_PARTICLES[i];
      const s = document.createElement('span');
      s.textContent = glyphs[i];
      s.style.setProperty('--x', p.x);
      s.style.setProperty('--ty', p.ty);
      s.style.setProperty('--r', p.r);
      s.style.setProperty('--d', p.d);
      box.appendChild(s);
    }
  }

  /* -- Twitch chat ------------------------------------------------------
     The original build flipped a green "live" dot the moment JOIN was
     sent, which is not the same thing as having joined: a typo'd channel
     sat there looking connected and silently receiving nothing, the
     single likeliest way for a streamer to conclude this feature is
     broken. Status now waits for 366 (end of /NAMES, i.e. the join
     actually landed), surfaces NOTICE instead of dropping it, and treats
     a server-sent RECONNECT as the routine event it is. ------------- */

  let chat = null;
  let joinedChannel = null;
  let reconnectDelay = 1000;
  let reconnectTimer = null;
  let joinTimeoutTimer = null;
  let sendingSelfGuess = false;  // the streamer's own #streamerForm: one submit in flight at a time - a single person, so a UI-level throttle is the right call here
  // Bumped on every new attempt so a superseded socket's own close
  // handler can tell it's stale and not schedule a second reconnect
  // racing the live one.
  let chatGen = 0;

  function ensureChat() {
    const want = state && state.twitchChannel ? state.twitchChannel : null;
    if (!want) { disconnectChat(); return; }
    if (joinedChannel === want && chat && chat.readyState <= 1) return;
    connectChat(want);
  }

  function disconnectChat() {
    joinedChannel = null;
    chatGen++;
    clearJoinTimeout();
    if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
    if (chat) { try { chat.close(); } catch (e) {} chat = null; }
    el('streamerChatStatus').hidden = true;
  }

  function setChatStatus(text, cls) {
    const node = el('streamerChatStatus');
    node.hidden = false;
    node.textContent = text;
    node.className = 'streamer-chatstatus' + (cls ? ' ' + cls : '');
  }

  function clearJoinTimeout() {
    if (joinTimeoutTimer) { clearTimeout(joinTimeoutTimer); joinTimeoutTimer = null; }
  }

  function connectChat(channel) {
    joinedChannel = channel;
    const myGen = ++chatGen;
    setChatStatus('Connecting to ' + channel + '’s chat…', 'is-waiting');

    let ws;
    try { ws = new WebSocket('wss://irc-ws.chat.twitch.tv:443'); }
    catch (err) { scheduleReconnect(channel); return; }
    chat = ws;

    ws.addEventListener('open', () => {
      reconnectDelay = 1000;
      // Anonymous read-only: any justinfan* nick is accepted without a
      // token, and plain PRIVMSG lines are all this needs, so no CAP
      // request either.
      ws.send('NICK justinfan' + Math.floor(Math.random() * 90000 + 10000));
      ws.send('JOIN #' + channel);
      setChatStatus('Joining ' + channel + '’s chat…', 'is-waiting');
      clearJoinTimeout();
      joinTimeoutTimer = setTimeout(() => {
        if (myGen === chatGen) {
          setChatStatus('Couldn’t confirm ' + channel + '’s chat — check the channel name.', 'is-down');
        }
      }, JOIN_TIMEOUT_MS);
    });

    ws.addEventListener('message', (e) => {
      String(e.data).split('\r\n').forEach((line) => {
        if (!line) return;
        if (line.indexOf('PING') === 0) { ws.send('PONG :tmi.twitch.tv'); return; }

        // Twitch asking us to move: expected maintenance, not a failure,
        // so reconnect at once and don't spend the backoff on it.
        if (/^(:tmi\.twitch\.tv )?RECONNECT/.test(line)) {
          setChatStatus('Twitch moved the connection — reconnecting…', 'is-waiting');
          reconnectDelay = 1000;
          try { ws.close(); } catch (err) {}
          connectChat(channel);
          return;
        }

        // 366 = end of /NAMES, the first proof the JOIN actually landed.
        if (/ 366 [^ ]+ #/.test(line)) {
          clearJoinTimeout();
          setChatStatus('Reading ' + channel + '’s chat', 'is-live');
          return;
        }

        // NOTICE is how Twitch explains a refusal (suspended channel and
        // friends). Without CAP tags there's no msg-id to switch on, so
        // its own words are shown rather than guessed at or swallowed.
        const notice = line.match(/^:tmi\.twitch\.tv NOTICE [^ ]+ :(.*)$/);
        if (notice) {
          clearJoinTimeout();
          setChatStatus('Twitch says: ' + notice[1], 'is-down');
          return;
        }

        const m = line.match(/^:([^!]+)![^ ]+ PRIVMSG #[^ ]+ :(.*)$/);
        if (m) handleChatLine(m[1], m[2]);
      });
    });

    ws.addEventListener('close', () => {
      clearJoinTimeout();
      if (myGen !== chatGen) return; // a newer attempt already replaced this socket
      if (joinedChannel === channel) setChatStatus('Chat disconnected — reconnecting…', 'is-down');
      scheduleReconnect(channel);
    });
    ws.addEventListener('error', () => { try { ws.close(); } catch (err) {} });
  }

  function scheduleReconnect(channel) {
    if (joinedChannel !== channel) return; // ensureChat() already moved on
    reconnectTimer = setTimeout(() => { if (joinedChannel === channel) connectChat(channel); }, reconnectDelay);
    reconnectDelay = Math.min(reconnectDelay * 2, 30000);
  }

  // The filters here decide what's worth a round-trip, nothing more.
  // guess.js runs the same two checks itself and its answer is the one
  // that counts - see its header comment.
  //
  // Deliberately NOT single-flighted the way the streamer's own form is
  // (see sendingSelfGuess) - an earlier version gated every chat guess
  // behind one shared in-flight flag, so during exactly the moment this
  // page exists for (a hint lands and a crowd answers at once), every
  // guess but the first arriving while that one POST was still pending
  // got silently dropped - never sent, never retried, gone. A hundred
  // correct answers racing is the normal case for a real chat, not an
  // edge case to throttle away; the server's own round-lock (guess.js's
  // atomic UPDATE) is what decides a winner among them, same as it
  // always has, so nothing here needs to serialize them first. The
  // browser's own per-origin connection limits are the only cap left,
  // which is exactly where that job belongs.
  async function handleChatLine(username, text) {
    if (!state || state.resolved) return;
    if (!looksLikeAGuess(text)) return;

    const a = targetAnimal();
    if (!a || !chatMatches(text, a)) return;

    const roundNo = state.roundNo;
    try {
      await api('guess', { code, playerName: username, text, roundNo, source: 'twitch' });
      poll();
    } catch (err) { /* the round just stays open - chat will say it again */ }
  }

  /* -- Controls ---------------------------------------------------------- */

  // The streamer's own guess. Posted as source:'twitch' under their own
  // channel name (state.twitchChannel) rather than a separate identity,
  // so it lands on the same leaderboard as chat and goes through the
  // exact same server-side matcher (guess.js's chatMatches branch) - a
  // deliberate answer with no chat-sentence noise to filter still passes
  // it, since matches() runs first inside chatMatches() either way.
  el('streamerForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const raw = el('streamerGuess').value.trim();
    if (!raw || !state || state.resolved || !state.twitchChannel || sendingSelfGuess) return;

    sendingSelfGuess = true;
    el('streamerGuess').value = '';
    el('streamerFeedback').textContent = 'Checking…';

    const data = await api('guess', {
      code, playerName: state.twitchChannel, text: raw, roundNo: state.roundNo, source: 'twitch',
    }).catch(() => null);
    sendingSelfGuess = false;

    if (!data || data.error) {
      el('streamerFeedback').textContent = "Couldn't reach the server — try again.";
    } else if (data.won) {
      el('streamerFeedback').textContent = 'You got it, +' + data.points + '.';
      sfx('win');
    } else if (data.correct) {
      el('streamerFeedback').textContent = 'Right answer — chat just beat you to it.';
    } else {
      el('streamerFeedback').textContent = 'Not that one — keep going.';
      sfx('wrong');
    }
    poll();
  });

  el('streamerGoLiveBtn').addEventListener('click', async () => {
    if (!connectedLogin) { showConnect('Connect with Twitch first.'); return; }
    const btn = el('streamerGoLiveBtn');
    btn.disabled = true;
    el('streamerGoLiveMsg').textContent = '';
    try {
      const data = await api('create', {
        category: el('streamerCategory').value,
        twitchChannel: connectedLogin,
      });
      if (data.error) {
        el('streamerGoLiveMsg').textContent = 'Could not start the session. Try again in a moment.';
        return;
      }
      code = data.code;
      hostKey = data.hostKey;
      lastRound = 0; lastResolved = false; lastShown = 0;
      renderedHints = { round: 0, count: 0 };
      el('streamerHints').innerHTML = '';
      setStore(HOST_STORE, JSON.stringify({ code, hostKey }));
      showDashboard();
      startPolling();
    } catch (err) {
      el('streamerGoLiveMsg').textContent = 'Could not reach the server. Check your connection and try again.';
    } finally {
      btn.disabled = false;
    }
  });

  el('streamerHint').addEventListener('click', async () => {
    if (!code || !hostKey) return;
    el('streamerHint').disabled = true;
    const data = await api('hint', { code, hostKey }).catch(() => null);
    if (data && !data.error && state) {
      state.shown = data.shown;
      renderRound({});
    }
    poll();
  });

  el('streamerNext').addEventListener('click', async () => {
    if (!code || !hostKey) return;
    el('streamerNext').disabled = true;
    await api('next', { code, hostKey }).catch(() => null);
    el('streamerNext').disabled = false;
    poll();
  });

  el('streamerEnd').addEventListener('click', () => {
    if (!window.confirm('End the stream session? Chat can’t keep guessing after this.')) return;
    const finalScores = state && state.scores;
    clearStore(HOST_STORE);
    code = null; hostKey = null; state = null;
    lastRound = 0; lastResolved = false; lastShown = 0;
    renderedHints = { round: 0, count: 0 };
    el('streamerHints').innerHTML = '';
    stopPolling();
    disconnectChat();
    showRecap(finalScores);
  });

  el('streamerRecapDone').addEventListener('click', () => showConnect(''));

  /* -- Category options -------------------------------------------------- */

  const catSelect = el('streamerCategory');
  CATEGORY_BUCKETS.forEach((b) => {
    const opt = document.createElement('option');
    opt.value = b.key;
    opt.textContent = b.label;
    catSelect.appendChild(opt);
  });

  /* -- Platforms (landing screen, C.8) -----------------------------------
     One array drives both the live Connect button and the inert Coming
     Soon rows, so adding a real platform later is one entry here plus a
     functions/api/<key>/{login,callback}.js pair - never a redesign of
     this screen. A 'soon' entry needs no backend at all. */
  const PLATFORMS = [
    {
      key: 'twitch', name: 'Twitch', status: 'live', href: 'api/twitch/login',
      icon: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0 1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714z"/></svg>',
    },
    { key: 'youtube', name: 'YouTube', status: 'soon' },
    { key: 'kick', name: 'Kick', status: 'soon' },
  ];

  (function renderPlatforms() {
    const box = el('streamerPlatforms');
    PLATFORMS.forEach((p) => {
      if (p.status === 'live') {
        const note = document.createElement('p');
        note.className = 'dlg-note';
        note.textContent = 'Connect your ' + p.name + ' account so your channel fills in ' +
          'automatically — no typing a name, no risk of the wrong room. This only confirms ' +
          'which channel is yours; chat itself is still read anonymously, the same way it ' +
          'always was, and nothing about this login is stored once your channel’s confirmed.';
        box.appendChild(note);
        const a = document.createElement('a');
        a.className = 'btn btn-solid streamer-connectbtn';
        a.href = p.href;
        a.setAttribute('data-sfx', 'off');
        a.innerHTML = p.icon + 'Connect with ' + p.name;
        box.appendChild(a);
      } else {
        const row = document.createElement('div');
        row.className = 'streamer-platform-soon';
        row.innerHTML = '<b>' + p.name + '</b><span class="pill">Coming soon</span>';
        box.appendChild(row);
      }
    });
  })();

  /* -- Entry -------------------------------------------------------------
     Three ways in: already hosting (resume), just came back from Twitch
     (?tw_login), or cold. The login never survives a reload on purpose -
     nothing about it is stored, so a refresh before going live means
     connecting again, which costs one click. ------------------------- */

  const ERRORS = {
    state: 'That login didn’t come back cleanly — please connect again.',
    token: 'Twitch couldn’t confirm that login — please try again.',
    config: 'Twitch login isn’t set up on this deploy yet.',
  };

  (function start() {
    const url = new URL(location.href);
    const twLogin = url.searchParams.get('tw_login');
    const twError = url.searchParams.get('twitcherror');
    if (twLogin || twError) {
      url.searchParams.delete('tw_login');
      url.searchParams.delete('twitcherror');
      history.replaceState(null, '', url.pathname + url.search + url.hash);
    }

    const saved = getHostSession();
    if (saved && saved.code && saved.hostKey) {
      code = saved.code;
      hostKey = saved.hostKey;
      showDashboard();
      startPolling();
      return;
    }
    if (twLogin) {
      connectedLogin = twLogin;
      showGoLive(twLogin);
      return;
    }
    showConnect(twError ? (ERRORS[twError] || 'Something went wrong connecting to Twitch.') : '');
  })();
})();
