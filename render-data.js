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
  function answers(a) {
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
      ['Carnivore?', diet[0], diet[1]],
      ['Dangerous?',
        a.dg === 'yes' ? 'Yes' : a.dg === 'some' ? 'Can be' : 'No',
        a.dg === 'yes' ? BAD : a.dg === 'some' ? WARN : FLAT],
      ['Domesticated?'].concat(yn(a.dm)),
      ['Awake when?',
        a.ac === 'night' ? 'Night' : a.ac === 'day' ? 'Daytime' : 'Day & night', FLAT],
      ['Hibernates?'].concat(yn(a.h)),
      ['Kept as a pet?',
        a.p === 'common' ? 'Commonly' : a.p === 'some' ? 'Sometimes' : 'No',
        a.p === 'common' ? GOOD : a.p === 'some' ? WARN : FLAT],
      ['Do people eat it?',
        a.et === 'yes' ? 'Yes' : a.et === 'some' ? 'In places' : 'No',
        a.et === 'yes' ? GOOD : a.et === 'some' ? WARN : FLAT],
    ];
  }

  // What it looks like and where you'd find it, then what it actually
  // does - a well-attributed animal can run to ten chips, and one flat
  // wrapped block of them reads as a second answer list. Splitting by
  // what the fact IS, the way Quick Answers splits identity from
  // behaviour, keeps it reading as a glance instead of a second read.
  function glanceGroups(a) {
    const appearance = [
      ['globe', 'Found in', a.r.join(', ')],
      ['drop',  'Colours', a.co.map(cap).join(', ')],
      ['ruler', 'Size', cap(a.sz)],
      ['leg',   'Legs', a.lg === 0 ? 'None' : String(a.lg)],
    ];
    if (a.cv && a.cv !== 'None') appearance.push(['coat', 'Covered in', a.cv]);

    const behaviour = [
      // "Lives in Solitary" is not a sentence, so that one gets its own.
      a.so === 'Solitary' ? ['group', null, 'Lives alone'] : ['group', 'Lives in', a.so.toLowerCase()],
      ['clock', 'Lives for', a.lf],
    ];
    if (a.fl) behaviour.push(['wing', null, 'Can fly']);
    if (a.sw) behaviour.push(['wave', null, 'Can swim']);
    if (a.eg) behaviour.push(['egg',  null, 'Lays eggs']);

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
  };

  const RenderData = { answers, glanceGroups, cap, ICONS, GOOD, WARN, BAD, FLAT };
  if (typeof module !== 'undefined' && module.exports) module.exports = RenderData;
  if (typeof root !== 'undefined') root.RenderData = RenderData;
})(typeof window !== 'undefined' ? window : globalThis);
