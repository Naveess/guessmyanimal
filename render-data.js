/* Quick answers / At a glance: the shape, not the pixels.
 *
 * This decides WHAT the two grids on an animal page contain - which
 * eight questions, in what order, coloured which way; which appearance
 * and behaviour chips, with which icon. app.js turns that into DOM for a
 * live visitor. tools/build-seo.js turns the same data into an HTML
 * string baked into the page before any JS runs, so a crawler (or a
 * slow connection) sees the real content immediately instead of an
 * empty shell.
 *
 * One function deciding this, not two copies of the same logic in a
 * browser file and a build script that someone forgets to keep in step.
 * Loaded as a plain <script> before app.js (browser global), and via
 * require() from Node (tools/build-seo.js) - same dual-export shape
 * animals.js already uses.
 */
(function (root) {
  const GOOD = 'good', WARN = 'warn', BAD = 'bad', FLAT = '';
  const cap = (s) => String(s).charAt(0).toUpperCase() + String(s).slice(1);

  // Green means yes, plain means no, amber is the honest middle, and red
  // is spent on exactly one thing: this animal can hurt you. An earlier
  // version painted every "yes" red, which made "Lays eggs? Yes" look
  // like a warning and buried the one row that actually is one.
  //
  // `c` is the animal's reviewed editorial content (content/animals/
  // <slug>.json), or null. Its why-notes ride along as a fourth element
  // on the rows they explain - only the hedged or surprising ones have
  // one, so most rows still have none.
  function answers(a, c) {
    const why = (c && c.why) || {};
    const yn = (b) => [b ? 'Yes' : 'No', b ? GOOD : FLAT];

    const diet =
      a.d === 'Carnivore'   ? ['Yes', GOOD] :
      a.d === 'Omnivore'    ? ['Omnivore', WARN] :
      a.d === 'Insectivore' ? ['Insects only', WARN] :
                              ['No, herbivore', FLAT];

    // Split in two: what it is and whether it's a risk, then what living
    // with or near one is actually like. renderAnswers' dividing row
    // assumes exactly four rows land in the first half - keep it that
    // way if this list ever changes.
    return [
      ['What is it?', a.c, FLAT],
      ['Carnivore?', diet[0], diet[1], why.d],
      ['Dangerous?',
        a.dg === 'yes' ? 'Yes' : a.dg === 'some' ? 'Can be' : 'No',
        a.dg === 'yes' ? BAD : a.dg === 'some' ? WARN : FLAT, why.dg],
      ['Domesticated?'].concat(yn(a.dm), [why.dm]),
      ['Awake when?',
        a.ac === 'night' ? 'Night' : a.ac === 'day' ? 'Daytime' : 'Day & night', FLAT, why.ac],
      ['Hibernates?'].concat(yn(a.h), [why.h]),
      ['Kept as a pet?',
        a.p === 'common' ? 'Commonly' : a.p === 'some' ? 'Sometimes' : 'No',
        a.p === 'common' ? GOOD : a.p === 'some' ? WARN : FLAT, why.p],
      ['Do people eat it?',
        a.et === 'yes' ? 'Yes' : a.et === 'some' ? 'In places' : 'No',
        a.et === 'yes' ? GOOD : a.et === 'some' ? WARN : FLAT, why.et],
    ];
  }

  // The keys a why-note may explain - one per Quick Answers row except
  // "What is it?", which is a classification, not a judgement call.
  const WHY_KEYS = ['d', 'dg', 'dm', 'ac', 'h', 'p', 'et'];

  // Habitat chips. A short fixed list on purpose: these are for reading,
  // and a collection page per habitat later, so "temperate broadleaf
  // forest" and "woodland" must not become two different things.
  const HABITATS = {
    forest: 'Forest', rainforest: 'Rainforest', grassland: 'Grassland',
    scrub: 'Scrub', desert: 'Desert', mountain: 'Mountains',
    wetland: 'Wetland', freshwater: 'Rivers & lakes', coast: 'Coast',
    ocean: 'Open ocean', polar: 'Polar', farmland: 'Farmland', towns: 'Towns',
  };

  const IUCN = {
    LC: 'Least Concern', NT: 'Near Threatened', VU: 'Vulnerable',
    EN: 'Endangered', CR: 'Critically Endangered', EW: 'Extinct in the Wild',
    EX: 'Extinct', DD: 'Data Deficient',
  };

  // What it looks like and where you'd find it, then what it actually
  // does - a well-attributed animal can run to ten chips, and one flat
  // wrapped block of them reads as a second answer list. Splitting by
  // what the fact IS, the way Quick Answers splits identity from
  // behaviour, keeps it reading as a glance instead of a second read.
  function glanceGroups(a, c) {
    c = c || {};
    const appearance = [['globe', 'Found in', a.r.join(', ')]];
    if (c.hb && c.hb.length) appearance.push(['leaf', 'Habitat', c.hb.map((h) => HABITATS[h] || h).join(', ')]);
    appearance.push(
      ['drop',  'Colours', a.co.map(cap).join(', ')],
      ['ruler', 'Size', cap(a.sz)],
    );
    // The real measurements, next to the bucket they explain - "Large"
    // tells you nothing on its own about whether it's the size of a dog
    // or a car.
    if (c.len) appearance.push(['ruler', 'Length', c.len]);
    if (c.ht) appearance.push(['ruler', 'Height', c.ht]);
    if (c.wt) appearance.push(['weight', 'Weight', c.wt]);
    appearance.push(['leg', 'Legs', a.lg === 0 ? 'None' : String(a.lg)]);
    if (a.cv && a.cv !== 'None') appearance.push(['coat', 'Covered in', a.cv]);

    const behaviour = [
      // "Lives in Solitary" is not a sentence, so that one gets its own.
      a.so === 'Solitary' ? ['group', null, 'Lives alone'] : ['group', 'Lives in', a.so.toLowerCase()],
      ['clock', 'Lives for', a.lf],
    ];
    if (a.fl) behaviour.push(['wing', null, 'Can fly']);
    // sw is 'debated' where sources genuinely disagree (the hippo).
    if (a.sw === 'debated') behaviour.push(['wave', 'Swims', 'Debatable']);
    else if (a.sw) behaviour.push(['wave', null, 'Can swim']);
    // eg is 'some' for a group where only some species do (sharks).
    if (a.eg === 'some') behaviour.push(['egg', 'Lays eggs', 'Some species']);
    else if (a.eg) behaviour.push(['egg',  null, 'Lays eggs']);

    return { appearance, behaviour };
  }

  // Drawn, not emoji - see app.js for why. Kept here too since the
  // server-baked glance chips need the same paths.
  const ICONS = {
    globe: '<circle cx="12" cy="12" r="8.6"/><path d="M3.4 12h17.2"/><path d="M12 3.4c2.5 2.9 2.5 14.3 0 17.2M12 3.4c-2.5 2.9-2.5 14.3 0 17.2"/>',
    drop:  '<path d="M12 3.6c3.1 3.6 5.3 6.2 5.3 8.9a5.3 5.3 0 0 1-10.6 0c0-2.7 2.2-5.3 5.3-8.9Z"/>',
    ruler: '<path d="M3.4 12h17.2"/><path d="M6.4 8.6v6.8M17.6 8.6v6.8"/>',
    group: '<circle cx="9.2" cy="8.8" r="3.1"/><path d="M3.6 19a5.6 5.6 0 0 1 11.2 0"/><path d="M16.2 6.4a3 3 0 0 1 0 5.6M17.8 19a5.7 5.7 0 0 0-1.6-4"/>',
    clock: '<circle cx="12" cy="12" r="8.6"/><path d="M12 6.9v5.4l3.4 2"/>',
    leg:   '<path d="M8.2 3.8v6.4c0 1.4.5 2.2 1.6 3l4.3 3.1c1.1.8 1.7 1.6 1.7 3v.9"/><path d="M5.8 3.8h4.8M13.6 20.2h4.4"/>',
    coat:  '<path d="M3.6 9.2c2.4 0 2.4-2.9 4.8-2.9s2.4 2.9 4.8 2.9 2.4-2.9 4.8-2.9 2.4 2.9 3.4 2.9"/><path d="M3.6 15.6c2.4 0 2.4-2.9 4.8-2.9s2.4 2.9 4.8 2.9 2.4-2.9 4.8-2.9 2.4 2.9 3.4 2.9"/>',
    wing:  '<path d="M20.4 4.2c-9.3 0-15.6 4.8-15.6 11 0 2.6 1.5 4.2 3.8 4.2 5.6 0 10-5.9 11.8-15.2Z"/>',
    wave:  '<path d="M2.8 8.4c2.3 0 2.3 2.1 4.6 2.1s2.3-2.1 4.6-2.1 2.3 2.1 4.6 2.1 2.3-2.1 4.6-2.1"/><path d="M2.8 14.8c2.3 0 2.3 2.1 4.6 2.1s2.3-2.1 4.6-2.1 2.3 2.1 4.6 2.1 2.3-2.1 4.6-2.1"/>',
    egg:   '<path d="M12 3.4c3.2 0 5.6 5.1 5.6 9A5.6 5.6 0 0 1 12 20.6 5.6 5.6 0 0 1 6.4 12.4c0-3.9 2.4-9 5.6-9Z"/>',
    leaf:  '<path d="M19.6 4.4C10.4 4.4 4.4 8.9 4.4 14.8c0 2.9 1.9 4.8 4.8 4.8 5.9 0 10.4-6 10.4-15.2Z"/><path d="M4.4 19.6 13.4 10.6"/>',
    weight: '<path d="M7.2 9.2h9.6l2.4 11H4.8l2.4-11Z"/><circle cx="12" cy="6.2" r="2.4"/>',
  };

  const esc = (s) => String(s).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));

  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  // "2026-09-28" -> "28 September 2026". By hand rather than
  // toLocaleDateString so the build (Node) and the browser can't format
  // the same date two different ways.
  function longDate(iso) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
    return m ? `${+m[3]} ${MONTHS[+m[2] - 1]} ${m[1]}` : '';
  }

  /* The editorial sections - everything on an animal page that isn't the
     game data. Each is an HTML string, '' when there's nothing real to
     put in it, and the caller hides the section around an empty one: a
     page only has the sections it has content for, so pages differ in
     shape, not just in values. Strings rather than DOM so app.js and
     tools/build-seo.js set the exact same markup.

     `lookup(slug)` returns the animals.js entry for a slug (for names and
     emoji on links), or null. */
  function sections(c, lookup) {
    const out = { group: '', profile: '', confused: '', moreFacts: '', sources: '' };
    if (!c) return out;
    const link = (slug) => {
      const b = lookup(slug);
      return b ? `<a href="/animals/${esc(slug)}">${esc(b.n)}</a>` : '';
    };

    if (c.grp && c.grp.length) {
      const links = c.grp.map(link).filter(Boolean);
      out.group = 'This entry covers a whole group, so the answers describe a typical member.' +
        (links.length ? ` For a specific one, see ${links.join(', ')}.` : '');
    }

    const rows = [];
    if (c.rg) rows.push(['Where it lives', esc(c.rg)]);
    if (c.df) rows.push(['What it eats', esc(c.df)]);
    if (c.iu && IUCN[c.iu]) {
      const q = encodeURIComponent(c.sci || '');
      rows.push(['Conservation', `${esc(IUCN[c.iu])} <span class="prof-src">(<a href="https://www.iucnredlist.org/search?query=${q}&amp;searchType=species" target="_blank" rel="noopener">IUCN Red List</a>)</span>`]);
    }
    out.profile = rows.map(([k, v]) => `<div class="prof-row"><dt>${k}</dt><dd>${v}</dd></div>`).join('');

    if (c.cf && c.cf.length) {
      out.confused = c.cf.map((x) => {
        const b = lookup(x.slug);
        if (!b) return '';
        return `<li class="conf-item"><a class="conf-name" href="/animals/${esc(x.slug)}"><span class="r-emoji" aria-hidden="true">${b.e || '🐾'}</span>${esc(b.n)}</a><p class="conf-tip">${esc(x.tip)}</p></li>`;
      }).join('');
    }

    if (c.fx && c.fx.length) out.moreFacts = c.fx.map((f) => `<p>${esc(f)}</p>`).join('');

    if (c.src && c.src.length) {
      const items = c.src.map((s) => `<li><a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.title)}</a></li>`).join('');
      const when = longDate(c.rv);
      out.sources = `<ol class="src-list">${items}</ol>` +
        (when ? `<p class="src-reviewed">Last reviewed <time datetime="${esc(c.rv)}">${when}</time></p>` : '');
    }
    return out;
  }

  const RenderData = { answers, glanceGroups, sections, longDate, esc, cap, ICONS, WHY_KEYS, HABITATS, IUCN, GOOD, WARN, BAD, FLAT };
  if (typeof module !== 'undefined' && module.exports) module.exports = RenderData;
  if (typeof root !== 'undefined') root.RenderData = RenderData;
})(typeof window !== 'undefined' ? window : globalThis);
