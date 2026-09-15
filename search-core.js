/* Typo-tolerant animal-name search, shared by any page that needs to
 * find an animal by name without loading the whole lookup UI (app.js
 * keeps its own copy of this same matching for the home page's search
 * box - see the note there; this file exists so the nav's own quick-
 * search on the standalone pages doesn't have to re-derive it). Pure
 * data-in, data-out - no DOM, same shape as game-core.js/render-data.js.
 * Depends on ANIMALS (animals.js) already being loaded first.
 */
(function (root) {
  const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9 ]/g, '').trim();
  // Hyphens become spaces first, or the normaliser strips them and
  // "snow-leopard" from a shared URL turns into "snowleopard", which
  // matches no entry.
  const slugify = (s) => norm(String(s || '').replace(/-/g, ' ')).replace(/ /g, '-');

  const ANIMALS_LIST = typeof ANIMALS !== 'undefined' ? ANIMALS : [];
  const INDEX = ANIMALS_LIST.map((a, i) => ({
    a,
    i,
    slug: slugify(a.n),
    hay: [norm(a.n)].concat((a.a || []).map(norm)),
  }));

  function score(entry, q) {
    let best = 0;
    for (let k = 0; k < entry.hay.length; k++) {
      const h = entry.hay[k];
      const isName = k === 0;
      if (h === q) best = Math.max(best, isName ? 100 : 90);
      else if (h.startsWith(q)) best = Math.max(best, isName ? 80 : 70);
      else if (h.includes(q)) best = Math.max(best, isName ? 55 : 45);
      else if (q.length >= 4 && near(h, q)) best = Math.max(best, 30);
    }
    return best;
  }

  // Cheap edit-distance check, capped at one edit.
  function near(h, q) {
    if (Math.abs(h.length - q.length) > 1) return false;
    let i = 0, j = 0, edits = 0;
    while (i < h.length && j < q.length) {
      if (h[i] === q[j]) { i++; j++; continue; }
      if (++edits > 1) return false;
      if (h.length > q.length) i++;
      else if (h.length < q.length) j++;
      else { i++; j++; }
    }
    return edits + (h.length - i) + (q.length - j) <= 1;
  }

  const IRREGULAR = {
    mice: 'mouse', geese: 'goose', feet: 'foot', teeth: 'tooth',
    children: 'child', men: 'man', women: 'woman', oxen: 'ox',
    lice: 'louse', people: 'person', wolves: 'wolf', calves: 'calf',
    halves: 'half', leaves: 'leaf', knives: 'knife', lives: 'life',
    elves: 'elf', loaves: 'loaf', thieves: 'thief', dwarves: 'dwarf',
  };

  function singular(q) {
    if (IRREGULAR[q]) return IRREGULAR[q];
    if (/[^aeiou]ies$/.test(q)) return q.slice(0, -3) + 'y';
    if (/ves$/.test(q)) return q.slice(0, -3) + 'f';
    if (/(ses|xes|zes|ches|shes)$/.test(q)) return q.slice(0, -2);
    if (/oes$/.test(q)) return q.slice(0, -2);
    if (/[^s]s$/.test(q)) return q.slice(0, -1);
    return null;
  }

  function search(raw, limit) {
    const q = norm(raw);
    if (!q) return [];

    const forms = [q];
    const one = singular(q);
    if (one && one.length >= 3 && one !== q) forms.push(one);

    return INDEX
      .map((e) => ({ e, s: Math.max.apply(null, forms.map((f, i) => score(e, f) - (i ? 1 : 0))) }))
      .filter((r) => r.s > 0)
      .sort((x, y) => y.s - x.s || x.e.a.n.length - y.e.a.n.length)
      .slice(0, limit || 8)
      .map((r) => r.e);
  }

  const SearchCore = { search, norm, slugify, count: ANIMALS_LIST.length };
  if (typeof module !== 'undefined' && module.exports) module.exports = SearchCore;
  if (typeof root !== 'undefined') root.SearchCore = SearchCore;
})(typeof window !== 'undefined' ? window : globalThis);
