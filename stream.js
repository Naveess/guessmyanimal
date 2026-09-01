(function () {
  'use strict';

  const el = (id) => document.getElementById(id);
  const BLANK = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

  const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9 ]/g, '').trim();
  const slugify = (s) => norm(String(s || '').replace(/-/g, ' ')).replace(/ /g, '-');
  const wikiTitle = (a) => a.w || a.n.replace(/ /g, '_');

  const BY_SLUG = new Map(ANIMALS.map((a) => [slugify(a.n), a]));
  const { answers } = RenderData;

  const key = new URL(location.href).searchParams.get('key') || '';
  let currentSlug = null;

  function renderAnswers(a) {
    const box = el('answers');
    box.innerHTML = '';
    answers(a).forEach(([k, v, state], i) => {
      if (i === 4) {
        const gap = document.createElement('div');
        gap.className = 'ans-gap';
        box.appendChild(gap);
      }
      const row = document.createElement('div');
      row.className = 'row';
      row.style.setProperty('--i', i);
      const kk = document.createElement('span');
      kk.className = 'k';
      kk.textContent = k;
      const vv = document.createElement('span');
      vv.className = 'pill' + (state ? ' ' + state : '');
      vv.textContent = v;
      row.append(kk, vv);
      box.appendChild(row);
    });
  }

  function showAnimal(a) {
    el('empty').hidden = true;
    el('hero').hidden = false;
    el('answersCard').hidden = false;

    el('name').textContent = a.n;
    el('emoji').textContent = a.e || '';
    el('kicker').textContent = a.c + ' · ' + a.r[0];
    renderAnswers(a);

    const hero = el('hero');
    hero.classList.remove('has-photo', 'anim-deal');
    hero.classList.add('is-loading');
    el('photoFallbackEmoji').textContent = a.e || '🐾';
    el('photoFallbackNote').textContent = '';
    el('photo').alt = '';
    el('photo').src = BLANK;
    el('photoBg').src = BLANK;
    void hero.offsetWidth;
    hero.classList.add('anim-deal');

    fetch('https://en.wikipedia.org/api/rest_v1/page/summary/' + encodeURIComponent(wikiTitle(a)))
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null)
      .then((data) => {
        hero.classList.remove('is-loading');
        if (data && data.thumbnail && data.thumbnail.source) {
          const img = el('photo');
          img.alt = a.n;
          img.src = data.thumbnail.source;
          el('photoBg').src = data.thumbnail.source;
          hero.classList.add('has-photo');
        } else {
          el('photoFallbackNote').textContent = 'No photo on file';
        }
      });
  }

  // Poll rather than a live push connection - a 1.2s worst-case delay
  // between typing an animal and it appearing on stream is imperceptible
  // in practice, and needs no persistent connection, no Durable Object,
  // nothing that can silently drop and leave the overlay stuck.
  async function poll() {
    if (!key) return;
    try {
      const res = await fetch('/api/stream?key=' + encodeURIComponent(key));
      const data = await res.json();
      if (data.slug && data.slug !== currentSlug) {
        const a = BY_SLUG.get(data.slug);
        if (a) {
          currentSlug = data.slug;
          showAnimal(a);
        }
      }
    } catch (err) { /* offline for a beat - next poll picks it back up */ }
  }

  poll();
  setInterval(poll, 1200);
})();
