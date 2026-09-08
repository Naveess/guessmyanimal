/* The OBS Browser Source for Party Mode: shows the hints and the
 * scoreboard on stream, and - the part that only works here - reads the
 * streamer's Twitch chat directly.
 *
 * Twitch's chat IRC accepts anonymous read-only connections: connect as
 * justinfanNNNNN, JOIN a channel, and every message in it arrives as a
 * PRIVMSG. No OAuth token, no Twitch developer app, nothing for the
 * streamer to authorise - which is why this is a WebSocket the browser
 * holds open rather than anything server-side. Cloudflare Pages
 * Functions are request/response only and could not hold this
 * connection even if we wanted them to.
 *
 * Guess matching happens here, client-side, using the same GameCore
 * rules the players' phones and Mystery Animal itself use. The API is
 * only told about a message once it already matches - it decides who
 * got there first, not whether an answer was right.
 */
(function () {
  'use strict';

  const el = (id) => document.getElementById(id);
  const { hintsFor, matches, norm, slugify } = GameCore;
  const BY_SLUG = new Map(ANIMALS.map((a) => [slugify(a.n), a]));

  const code = (new URL(location.href).searchParams.get('code') || '').toUpperCase();

  let state = null;
  let lastRound = 0;
  let chat = null;          // the WebSocket, when there's a channel to listen to
  let joinedChannel = null;
  let reconnectDelay = 1000;
  let sending = false;      // one guess POST in flight at a time - see handleChatLine

  /* -- Session polling ------------------------------------------------ */

  async function poll() {
    if (!code) return;
    try {
      const res = await fetch('/api/party/session?code=' + encodeURIComponent(code));
      if (!res.ok) return;
      const data = await res.json();
      if (data.error) return;
      state = data;
      render();
      ensureChat();
    } catch (err) { /* offline for a beat - the next poll picks it back up */ }
  }

  /* -- Rendering ------------------------------------------------------ */

  function render() {
    if (!state) return;
    const a = BY_SLUG.get(state.targetSlug);

    el('poEmpty').hidden = true;
    el('poRound').textContent = 'Round ' + state.roundNo;
    el('poJoin').hidden = false;
    el('poCode').textContent = code;

    if (state.roundNo !== lastRound) lastRound = state.roundNo;

    const box = el('poHints');
    box.innerHTML = '';
    if (a) {
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

    const result = el('poResult');
    result.hidden = !state.resolved;
    if (state.resolved) {
      result.textContent = state.lastWinner
        ? state.lastWinner + ' got it — ' + (a ? a.n : '') + '!'
        : 'Round over — ' + (a ? a.n : '');
    }

    const scoreCard = el('poScoreCard');
    scoreCard.hidden = !state.scores.length;
    const scores = el('poScores');
    scores.innerHTML = '';
    state.scores.forEach((s, i) => {
      const row = document.createElement('div');
      row.className = 'party-score';
      if (state.resolved && state.lastWinner === s.playerName) row.classList.add('is-winner');
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
      scores.appendChild(row);
    });
  }

  function setChatStatus(text, cls) {
    const node = el('poChat');
    node.hidden = false;
    node.textContent = text;
    node.className = 'po-chat' + (cls ? ' ' + cls : '');
  }

  /* -- Twitch chat ---------------------------------------------------- */

  function ensureChat() {
    const want = state && state.twitchChannel ? state.twitchChannel : null;
    if (!want) return;                    // local/QR-only party, nothing to listen to
    if (joinedChannel === want && chat && chat.readyState <= 1) return;
    if (chat) { try { chat.close(); } catch (e) {} }
    connectChat(want);
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
        // Twitch pings periodically and drops connections that don't answer.
        if (line.indexOf('PING') === 0) { ws.send('PONG :tmi.twitch.tv'); return; }
        const m = line.match(/^:([^!]+)![^ ]+ PRIVMSG #[^ ]+ :(.*)$/);
        if (m) handleChatLine(m[1], m[2]);
      });
    });

    ws.addEventListener('close', () => {
      if (chat === ws) setChatStatus('Chat disconnected — reconnecting…', 'is-down');
      scheduleReconnect(channel);
    });
    ws.addEventListener('error', () => { try { ws.close(); } catch (err) {} });
  }

  function scheduleReconnect(channel) {
    // Backs off rather than hammering Twitch if something is properly
    // wrong (a channel that doesn't exist, no network at all).
    setTimeout(() => { if (joinedChannel === channel) connectChat(channel); }, reconnectDelay);
    reconnectDelay = Math.min(reconnectDelay * 2, 30000);
  }

  // A public chat is much noisier than a solo guess box, and every
  // message here would otherwise reach the fuzzy matcher - which is
  // tolerant by design ("gorila" should count) and so is exactly the
  // wrong thing to point at general conversation. These filters run
  // first, and cost nothing:
  const MAX_GUESS_LEN = 40;
  function looksLikeAGuess(text) {
    const t = text.trim();
    if (!t || t.length > MAX_GUESS_LEN) return false;
    if (t[0] === '!' || t[0] === '/') return false;      // bot commands
    if (/https?:\/\//i.test(t)) return false;            // links
    if (/^@/.test(t)) return false;                      // replies to other chatters
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
    if (!state || state.resolved || sending) return;
    if (!looksLikeAGuess(text)) return;

    const a = BY_SLUG.get(state.targetSlug);
    if (!a || !chatMatches(text, a)) return;

    // Snapshot the round this guess belongs to before awaiting anything:
    // the host could advance the round mid-flight, and the API rejects a
    // guess whose roundNo no longer matches rather than scoring it
    // against the wrong animal.
    const roundNo = state.roundNo;
    const hintsShown = state.shown;
    sending = true;
    try {
      await fetch('/api/party/guess', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ code, playerName: username, hintsShown, roundNo, source: 'twitch' }),
      });
      poll();
    } catch (err) { /* the round just stays open - chat will say it again */ }
    finally { sending = false; }
  }

  /* -- Boot ----------------------------------------------------------- */

  if (!code) {
    el('poEmpty').textContent = 'No party code in this link.';
  } else {
    poll();
    setInterval(poll, 1200);
  }
})();
