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
 * Both roles poll /api/party/session on the same 1.2s loop the removed
 * overlay page pioneered. Local/QR guesses are no longer client-decided:
 * every submission (right or wrong) goes to the server, which is now the
 * one place that knows the target - see guess.js. That's also what
 * makes the wrong-guess feed possible, since a client that already
 * knew it was wrong would have no reason to tell the server about it.
 * The Twitch chat path is untouched and still decides client-side
 * (chatMatches() below). It's unfinished, carries an on-screen warning
 * not to stream it, and is being rebuilt - see TWITCH-REBUILD.md.
 */
(function () {
  'use strict';

  const el = (id) => document.getElementById(id);
  const { hintsFor, matches, norm, MAX_HINTS, CATEGORY_BUCKETS, slugify, pixelStepFor, thumbAtWidth } = GameCore;
  const BY_SLUG = new Map(ANIMALS.map((a) => [slugify(a.n), a]));
  const BLANK = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

  const HOST_STORE = 'gma-party-host';  // {code, hostKey} - so a host refresh resumes rather than orphaning the party
  const NAME_STORE = 'gma-party-name';
  const ICON_STORE = 'gma-party-icon';

  const DEFAULT_ICON = '🐾';
  // A small, animal-flavoured set rather than a full emoji keyboard -
  // this is a "pick a look for the scoreboard" flourish, not a chat
  // input, so a fixed grid that fits on one screen beats a search box.
  const ICONS = ['🐾', '🦁', '🐯', '🐻', '🐼', '🦊', '🐺', '🐸', '🐙', '🦄', '🐢', '🐬', '🦉', '🐨', '🐧', '🦋', '🐳', '🦖', '🐝', '🦔'];

  const POLL_MS = 1200;
  // No presence table, no beacon-on-close - a closed tab just stops
  // calling join.js's heartbeat (see poll()), and updated_at ages out
  // on its own. HEARTBEAT_MS controls how often that touch happens;
  // ONLINE_WINDOW_MS is how stale updated_at can be before a row reads
  // as "gone" rather than "here" - wide enough to survive a couple of
  // missed heartbeats/polls without flickering someone offline and
  // back on a slow connection.
  const HEARTBEAT_MS = 12000;
  const ONLINE_WINDOW_MS = 20000;

  let surface = null;      // 'host' | 'player' | null - which one is on screen, and so whether to poll
  let code = null;
  let hostKey = null;
  let playerName = null;
  let selectedIcon = getStore(ICON_STORE) || DEFAULT_ICON;
  let editingIdentity = false; // the "change name" form is open, on top of an existing identity
  let state = null;        // latest /api/party/session payload
  let pollTimer = null;
  let lastRound = 0;
  let lastResolved = false;
  let lastShown = 0;
  let lastHeartbeat = 0;
  let guessSending = false; // one local guess POST in flight at a time
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

    // Piggybacked on the same loop rather than a second timer: while a
    // name is set, touch join.js's updated_at often enough that other
    // devices' "online" dot on the leaderboard stays accurate. join.js
    // only announces a *new* face to the feed, so this never spams it.
    const now = Date.now();
    if (playerName && now - lastHeartbeat > HEARTBEAT_MS) {
      lastHeartbeat = now;
      api('join', { code, playerName, icon: selectedIcon }).catch(() => {});
    }
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

  // Rebuilding this list from scratch every 1.2s poll - even when
  // nothing about it changed - replayed the .party-hint entrance
  // animation on every hint, every poll, which read as the whole list
  // "flickering"/refreshing constantly. Only touch the DOM when the
  // shown count has actually moved, and only append the new row(s)
  // rather than rebuilding the ones already on screen.
  let renderedHints = { round: 0, count: 0 };
  // Same append-only instinct as renderedHints above, keyed on the
  // event id session.js already sends (oldest-first, stable, never
  // reused) rather than a count - a chat log has no single "how many
  // so far" number the way a fixed-length hint list does.
  let renderedFeed = { lastId: 0 };

  function renderHintList() {
    const box = el('partyHints');
    const a = targetAnimal();
    if (!a || !state) return;
    const all = hintsFor(a);
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

  // "Online" here means "a local/QR device with this name touched
  // join.js within ONLINE_WINDOW_MS" - see the heartbeat in poll().
  // Twitch names never heartbeat (there's no tab to poll from on their
  // behalf), so they're never marked online here - the chat connection
  // status dot already covers "is the overlay actually listening".
  function renderScores() {
    const box = el('partyScores');
    box.innerHTML = '';
    const label = el('partyScoresLabel');
    if (!state || !state.scores.length) {
      const empty = document.createElement('p');
      empty.className = 'party-scores-empty';
      empty.textContent = 'No one on the board yet.';
      box.appendChild(empty);
      if (label) label.textContent = 'Leaderboard';
      return;
    }
    const now = Date.now();
    let onlineCount = 0;
    state.scores.forEach((s, i) => {
      const online = s.source !== 'twitch' && typeof s.updatedAt === 'number' && (now - s.updatedAt) < ONLINE_WINDOW_MS;
      if (online) onlineCount++;
      const row = document.createElement('div');
      row.className = 'party-score' + (online ? ' is-online' : '');
      if (state.lastWinner && s.playerName === state.lastWinner && state.resolved) row.classList.add('is-winner');
      if (playerName && s.playerName === playerName) row.classList.add('is-mine');
      const rank = document.createElement('span');
      rank.className = 'party-score-rank';
      rank.textContent = String(i + 1);
      const dot = document.createElement('span');
      dot.className = 'party-score-dot';
      dot.setAttribute('aria-hidden', 'true');
      dot.title = online ? 'In the party now' : 'Not currently active';
      const icon = document.createElement('span');
      icon.className = 'party-score-icon';
      icon.setAttribute('aria-hidden', 'true');
      icon.textContent = s.icon || (s.source === 'twitch' ? '' : DEFAULT_ICON);
      const name = document.createElement('span');
      name.className = 'party-score-name';
      name.textContent = s.playerName;
      if (s.source === 'twitch') name.classList.add('is-twitch');
      const pts = document.createElement('b');
      pts.className = 'party-score-pts';
      pts.textContent = String(s.score);
      row.append(rank, dot, icon, name, pts);
      box.appendChild(row);
    });
    if (label) label.textContent = 'Leaderboard' + (onlineCount ? ' · ' + onlineCount + ' in the party' : '');
  }

  /* -- Activity feed: joins + guesses (right and wrong), local/QR play
     only. A chat log, not a scoreboard. Same append-only instinct as
     renderHintList above, keyed on event id rather than a count -
     rebuilding this from scratch every 1.2s poll (the original
     approach) re-announced the entire log to aria-live="polite" screen
     readers nonstop during a live round, and snapped a sighted reader's
     scroll position back to the top even when they'd scrolled up to
     reread something. Scroll position is still only pinned to the
     bottom if the reader was already there, same as any chat UI. ---- */

  function renderFeed() {
    const box = el('partyFeed');
    if (!box || !state) return;
    const events = state.events || [];

    if (!events.length) {
      if (renderedFeed.lastId !== 0) {
        box.innerHTML = '';
        const empty = document.createElement('p');
        empty.className = 'party-feed-empty';
        empty.textContent = 'Nothing yet — invite a few people in.';
        box.appendChild(empty);
      }
      renderedFeed.lastId = 0;
      return;
    }

    const wasNearBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 48;
    // Server sends only the newest EVENT_LIMIT rows (session.js) - if
    // the oldest id in this payload is newer than what's already
    // rendered, older rows rolled off between polls and appending alone
    // would leave stale rows on screen the server no longer stands
    // behind. Rebuild in that case; append-only otherwise.
    const rolledOff = renderedFeed.lastId > 0 && events[0].id > renderedFeed.lastId + 1;
    if (renderedFeed.lastId === 0 || rolledOff) {
      box.innerHTML = '';
      events.forEach(appendFeedRow);
    } else {
      events.filter((ev) => ev.id > renderedFeed.lastId).forEach(appendFeedRow);
    }
    renderedFeed.lastId = events[events.length - 1].id;
    if (wasNearBottom) box.scrollTop = box.scrollHeight;

    function appendFeedRow(ev) {
      if (ev.kind === 'round') {
        const div = document.createElement('div');
        div.className = 'party-feed-divider';
        div.textContent = 'Round ' + ev.roundNo;
        box.appendChild(div);
        return;
      }
      const row = document.createElement('p');
      row.className = 'party-feed-row';
      const icon = document.createElement('span');
      icon.className = 'party-feed-icon';
      icon.setAttribute('aria-hidden', 'true');
      icon.textContent = ev.icon || DEFAULT_ICON;
      const body = document.createElement('span');
      body.className = 'party-feed-text';
      const b = document.createElement('b');
      b.textContent = ev.playerName;
      body.appendChild(b);
      if (ev.kind === 'join') {
        body.appendChild(document.createTextNode(' joined the party'));
      } else {
        body.appendChild(document.createTextNode(' guessed “' + ev.text + '”'));
        if (ev.correct) {
          row.classList.add('is-correct');
          body.appendChild(document.createTextNode(' — got it!'));
        } else {
          row.classList.add('is-wrong');
        }
      }
      row.append(icon, body);
      box.appendChild(row);
    }
  }

  function renderRound(opts) {
    if (!state) return;

    if (opts && opts.roundChanged) {
      el('partyGuess').value = '';
      el('partyFeedback').textContent = '';
      el('partyResultCelebrate').innerHTML = '';
    }

    applyPixelation();
    renderHintList();
    renderScores();
    renderFeed();

    el('partyStatRound').textContent = String(state.roundNo);
    el('partyStatHint').textContent = Math.min(state.shown, MAX_HINTS) + '/' + MAX_HINTS;
    el('partyStatScoreWrap').hidden = !playerName;
    if (playerName) {
      const mine = state.scores && state.scores.find((s) => s.playerName === playerName);
      el('partyStatScore').textContent = String(mine ? mine.score : 0);
    }

    const done = state.resolved;
    const a = targetAnimal();

    if (done) revealHero();

    if (surface === 'host') {
      el('partyHint').disabled = done || state.shown >= MAX_HINTS;
      el('partyHint').hidden = done;
      el('partyNext').hidden = !done;
      if (!editingIdentity) el('partyPlayToo').hidden = !!playerName;
    }
    // Guess form is shown to whoever has a name set, host included -
    // hosting a round doesn't stop you racing to guess it too. Left
    // alone while the name-change form is open, or the next poll would
    // just pop it back in front of the editor.
    if (!editingIdentity) el('partyGuessForm').hidden = done || !playerName;

    el('partyResult').hidden = !done;
    if (done) {
      const won = !!(state.lastWinner && playerName && state.lastWinner === playerName);
      el('partyResultEmoji').textContent = a ? (a.e || '🐾') : '🐾';
      el('partyResultName').textContent = a ? a.n : '';
      el('partyResultCard').classList.toggle('is-mine', won);
      el('partyResultNote').textContent = won
        ? 'You got it!'
        : (state.lastWinner ? state.lastWinner + ' got it.' : 'Round over.');
    }

    if (opts && opts.justResolved) {
      const won = playerName && state.lastWinner === playerName;
      if (won) celebrateWin(); else el('partyResultCelebrate').innerHTML = '';
      sfx(won ? 'win' : (surface === 'host' ? 'win' : 'hint'));
    }
  }

  // Same particle recipe as Mystery Animal's own celebrate() (mystery.js)
  // - the target's own emoji plus the site's paw mark and one sparkle,
  // not generic confetti shapes, so the burst reads as "you got *this*
  // animal" rather than a stock effect. Only ever called on a genuine,
  // just-happened win (see justResolved above) - a round ending some
  // other way shows the exact same card with this left empty.
  const CELEBRATE_PARTICLES = [
    { x: '8%', ty: '-64px', r: '-24deg', d: '0s' },
    { x: '28%', ty: '-82px', r: '18deg', d: '.12s' },
    { x: '50%', ty: '-56px', r: '-10deg', d: '.24s' },
    { x: '72%', ty: '-80px', r: '22deg', d: '.12s' },
    { x: '92%', ty: '-62px', r: '-18deg', d: '0s' },
  ];
  function celebrateWin() {
    const box = el('partyResultCelebrate');
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

  /* -- Icon picker: a small fixed emoji grid shared by the player join
     gate and the host's inline "play too" form - only one of the two is
     ever visible on a given tab, so one selectedIcon variable and one
     click handler cover both. -------------------------------------- */

  function renderIconPicker(box) {
    if (!box) return;
    box.innerHTML = '';
    ICONS.forEach((ic) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'icon-opt' + (ic === selectedIcon ? ' is-selected' : '');
      btn.setAttribute('role', 'radio');
      btn.setAttribute('aria-checked', String(ic === selectedIcon));
      btn.setAttribute('aria-label', 'Icon ' + ic);
      btn.textContent = ic;
      btn.addEventListener('click', () => setSelectedIcon(ic));
      box.appendChild(btn);
    });
  }

  function setSelectedIcon(ic) {
    selectedIcon = ic;
    [el('partyIconPicker'), el('partyPlayTooIconPicker')].forEach((box) => {
      if (!box) return;
      box.querySelectorAll('.icon-opt').forEach((btn) => {
        const on = btn.textContent === ic;
        btn.classList.toggle('is-selected', on);
        btn.setAttribute('aria-checked', String(on));
      });
    });
  }

  // A player's chosen name + icon, wherever it was entered - persists
  // across the whole site, not just this one party code, same as
  // NAME_STORE already did. previousName, when given, tells join.js
  // this is a rename of an existing row rather than a fresh identity -
  // see its own comment for why that matters.
  function setIdentity(name, icon, previousName) {
    playerName = name;
    setStore(NAME_STORE, name);
    setStore(ICON_STORE, icon);
    const body = { code, playerName: name, icon };
    if (previousName && previousName !== name) body.previousName = previousName;
    api('join', body).catch(() => {});
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
    el('partyRecap').hidden = true;
  }

  // A beat between "End party" and the blank setup form again - see
  // partyEnd's click handler below for why. Host-only: a participant's
  // own device currently learns the party's gone from a failed poll
  // (onSessionGone), not from this - giving remote players a synced
  // recap too would need the server to carry an "ended" signal, out of
  // scope for what a purely host-local confirm+recap can do.
  function showRecap(finalScores) {
    el('partyTitleText').textContent = 'Party Mode';
    el('partySetup').hidden = true;
    el('partyNameForm').hidden = true;
    el('partyActive').hidden = true;
    el('partyPlayerMsg').hidden = true;

    const box = el('partyRecapScores');
    box.innerHTML = '';
    const sorted = (finalScores || []).slice().sort((a, b) => b.score - a.score);
    if (!sorted.length) {
      const empty = document.createElement('p');
      empty.className = 'party-scores-empty';
      empty.textContent = 'No one scored this time.';
      box.appendChild(empty);
    } else {
      sorted.forEach((s, i) => {
        const row = document.createElement('div');
        row.className = 'party-score' + (i === 0 && s.score > 0 ? ' is-winner' : '')
          + (playerName && s.playerName === playerName ? ' is-mine' : '');
        const rank = document.createElement('span');
        rank.className = 'party-score-rank';
        rank.textContent = String(i + 1);
        const icon = document.createElement('span');
        icon.className = 'party-score-icon';
        icon.setAttribute('aria-hidden', 'true');
        icon.textContent = s.icon || (s.source === 'twitch' ? '' : DEFAULT_ICON);
        const name = document.createElement('span');
        name.className = 'party-score-name';
        name.textContent = s.playerName;
        if (s.source === 'twitch') name.classList.add('is-twitch');
        const pts = document.createElement('b');
        pts.className = 'party-score-pts';
        pts.textContent = String(s.score);
        row.append(rank, icon, name, pts);
        box.appendChild(row);
      });
    }
    el('partyRecap').hidden = false;
  }

  el('partyRecapDone').addEventListener('click', showSetup);

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
    editingIdentity = false;
    el('partyPlayTooCancel').hidden = true;
    el('partyPlayTooLabel').textContent = 'Want to play too, not just host?';
    el('partyPlayTooSubmit').textContent = 'Join in';
    el('partyPlayTooMsg').textContent = '';
    el('partyPlayToo').hidden = !isHost || !!playerName;
    el('partyYouLabel').hidden = !playerName;
    el('partyPlayerNameLabel').textContent = playerName || '';
    el('partyGuessForm').hidden = !playerName;

    if (isHost) {
      const joinUrl = location.origin + '/?party=' + code;
      el('partyJoinUrl').value = joinUrl;
      el('partyCode').textContent = code;
      renderQr(joinUrl);
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

    // A name picked up from any earlier party (host or player) on this
    // device carries over, same as the player join flow already does -
    // it's "your name on this site", not "your name for this one code".
    playerName = getStore(NAME_STORE) || null;

    const saved = getHostSession();
    if (saved && saved.code && saved.hostKey) {
      code = saved.code;
      hostKey = saved.hostKey;
      lastRound = 0; lastResolved = false; lastShown = 0; renderedHints = { round: 0, count: 0 };
      renderedFeed = { lastId: 0 };
      el('partyFeed').innerHTML = '';
      showActiveRound();
      startPolling();
      if (playerName) api('join', { code, playerName, icon: selectedIcon }).catch(() => {});
    } else {
      showSetup();
    }
  }

  el('partyOpen').addEventListener('click', () => openPartyHost());

  /* -- Home-screen "have a code?" entry: a typed alternative to the QR/
     link, since the invite panel's own copy has always said "join...
     with code" but nothing on the site accepted one typed in - only a
     ?party=CODE URL (QR scan or exact link) worked. -------------------- */
  el('partyCodeLink').addEventListener('click', () => {
    el('partyCodeLink').hidden = true;
    el('partyCodeForm').hidden = false;
    el('partyCodeInput').focus();
  });
  el('partyCodeForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const raw = el('partyCodeInput').value.trim().toUpperCase();
    if (!raw) {
      el('partyCodeMsg').textContent = 'Type the code first.';
      return;
    }
    if (!/^[A-Z0-9]{4,6}$/.test(raw)) {
      el('partyCodeMsg').textContent = "That doesn't look like a party code — check for typos.";
      return;
    }
    el('partyCodeMsg').textContent = '';
    openPartyPlayer(raw);
  });

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
      lastRound = 0; lastResolved = false; lastShown = 0; renderedHints = { round: 0, count: 0 };
      renderedFeed = { lastId: 0 };
      el('partyFeed').innerHTML = '';
      setStore(HOST_STORE, JSON.stringify({ code, hostKey }));
      showActiveRound();
      startPolling();
      if (playerName) api('join', { code, playerName, icon: selectedIcon }).catch(() => {});
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
    // One tap used to end the session for every participant outright,
    // with no way back and no closing moment - the flattest point in
    // the whole flow, right after the game's actual best one (the win
    // reveal). A confirm plus a final-standings beat (see showRecap)
    // fixes both at once.
    if (!window.confirm("End the party for everyone? This can't be undone.")) return;

    // Read before state is cleared below - showRecap needs one last
    // look at the board this session actually produced.
    const finalScores = state && state.scores;

    // The session just goes stale on the server - there's nothing to
    // close, and nothing stored anywhere that a next party would trip
    // over. This is only "forget it on this device".
    clearStore(HOST_STORE);
    code = null; hostKey = null; state = null;
    lastRound = 0; lastResolved = false; lastShown = 0; renderedHints = { round: 0, count: 0 };
    renderedFeed = { lastId: 0 };
    el('partyFeed').innerHTML = '';
    stopPolling();
    disconnectChat();
    showRecap(finalScores);
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
    lastRound = 0; lastResolved = false; lastShown = 0; renderedHints = { round: 0, count: 0 };
    renderedFeed = { lastId: 0 };
    el('partyFeed').innerHTML = '';

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
      api('join', { code, playerName, icon: selectedIcon }).catch(() => {}); // refresh presence on a reopen/refresh too
    } else {
      el('partyNameForm').hidden = false;
    }
  }

  // True if `name` already belongs to someone else's row on the current
  // leaderboard. `excludeName` is the identity being renamed (its own
  // previous name never counts as a collision against itself) - omit it
  // for a fresh join, where every existing row belongs to someone else.
  function nameCollides(name, scores, excludeName) {
    if (excludeName && name === excludeName) return false;
    return (scores || []).some((s) => s.playerName === name);
  }

  // The initial join gate fires before polling has ever run (state is
  // still null - see openPartyPlayer), so there's no leaderboard in
  // memory yet to check against. One-off fetch rather than waiting for
  // the first poll, so the very first name typed gets the same
  // protection a later rename already has via `state.scores`.
  async function nameTakenOnJoin(name) {
    try {
      const res = await fetch('api/party/session?code=' + encodeURIComponent(code));
      const data = await res.json();
      return nameCollides(name, data && data.scores);
    } catch (e) { return false; } // offline - let the server be the final word
  }

  el('partyNameForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = el('partyName').value.trim().slice(0, 24);
    if (!name) return;
    const btn = el('partyNameForm').querySelector('button[type=submit]');
    btn.disabled = true;
    const taken = await nameTakenOnJoin(name);
    btn.disabled = false;
    if (taken) {
      el('partyNameMsg').textContent = 'Someone here is already using that name — try another.';
      return;
    }
    el('partyNameMsg').textContent = '';
    setIdentity(name, selectedIcon);
    el('partyNameForm').hidden = true;
    showActiveRound();
    startPolling();
  });

  // Shown inline within an already-active round, not a blocking gate -
  // the host's first job is getting the code/QR on screen, not picking
  // a name, so this can't hold that up. Two triggers, one form: a host
  // with no name yet sees it automatically (see renderRound), and
  // either role can reopen it later via "change" next to the You label.
  el('partyPlayToo').addEventListener('submit', (e) => {
    e.preventDefault();
    const name = el('partyPlayTooName').value.trim().slice(0, 24);
    if (!name) return;
    const previous = editingIdentity ? playerName : null;
    // Polling is already running by the time this form can appear, so
    // state.scores is current enough to check synchronously - no need
    // for the join gate's one-off fetch.
    if (nameCollides(name, state && state.scores, previous)) {
      el('partyPlayTooMsg').textContent = 'Someone here is already using that name — try another.';
      return;
    }
    el('partyPlayTooMsg').textContent = '';
    setIdentity(name, selectedIcon, previous);
    editingIdentity = false;
    el('partyPlayToo').hidden = true;
    el('partyYouLabel').hidden = false;
    el('partyPlayerNameLabel').textContent = playerName;
    renderRound({});
  });

  el('partyEditName').addEventListener('click', () => {
    editingIdentity = true;
    el('partyPlayTooLabel').textContent = 'Change your name';
    el('partyPlayTooSubmit').textContent = 'Save';
    el('partyPlayTooMsg').textContent = '';
    el('partyPlayTooName').value = playerName || '';
    el('partyPlayTooCancel').hidden = false;
    el('partyYouLabel').hidden = true;
    el('partyGuessForm').hidden = true;
    el('partyPlayToo').hidden = false;
    // Belongs to the now-hidden guess form, not the name editor - left
    // alone, a stale "Not that one" from before "change" was clicked
    // sits here with nothing on screen for it to be feedback about.
    el('partyFeedback').textContent = '';
    el('partyPlayTooName').focus();
  });

  el('partyPlayTooCancel').addEventListener('click', () => {
    editingIdentity = false;
    el('partyPlayTooLabel').textContent = 'Want to play too, not just host?';
    el('partyPlayTooSubmit').textContent = 'Join in';
    el('partyPlayTooMsg').textContent = '';
    el('partyPlayTooCancel').hidden = true;
    el('partyPlayToo').hidden = true;
    el('partyYouLabel').hidden = !playerName;
    renderRound({});
  });

  // Shared by both roles - see the header comment on why this always
  // hits the server now instead of pre-filtering with matches() first.
  el('partyGuessForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const raw = el('partyGuess').value.trim();
    if (!raw || !state || state.resolved || !playerName || guessSending) return;

    guessSending = true;
    el('partyGuess').value = '';
    el('partyFeedback').textContent = 'Checking…';

    const data = await api('guess', {
      code,
      playerName,
      text: raw,
      roundNo: state.roundNo,
      source: 'local',
      icon: selectedIcon,
    }).catch(() => null);
    guessSending = false;

    if (!data || data.error) {
      el('partyFeedback').textContent = "Couldn't reach the server — try again.";
    } else if (data.won) {
      el('partyFeedback').textContent = 'You got it, +' + data.points + '.';
      sfx('win');
    } else if (data.correct) {
      el('partyFeedback').textContent = 'Right answer — someone just beat you to it.';
    } else {
      el('partyFeedback').textContent = 'Not that one — keep going.';
      sfx('wrong');
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

  renderIconPicker(el('partyIconPicker'));
  renderIconPicker(el('partyPlayTooIconPicker'));

  window.openPartyHost = openPartyHost;
  window.openPartyPlayer = openPartyPlayer;
})();
