/* "You might also like": which animals to link from an animal page.
 *
 * Same dual-export shape as render-data.js and the same reason for it -
 * app.js needs this live for a visitor, tools/build-seo.js needs the
 * identical result baked into the static page for a crawler, and this is
 * the one function that decides it rather than two copies drifting apart.
 * Loaded as a plain <script> before app.js (browser global), and via
 * require() from Node.
 *
 * Deliberately not "same category" alone - 208 of the 438 animals are
 * mammals, so that alone would put a shrew next to a blue whale. Scored
 * instead: category matters most, then region (the actual thing that
 * makes two animals feel like they belong together - a "you might also
 * like" for a Fennec fox should smell of the Sahara, not just of being a
 * mammal), diet and size break remaining ties. No randomness - the same
 * animal always surfaces the same six, so a returning visitor, a cached
 * crawl and a shared link all see the same page.
 */
(function (root) {
  function scoreOf(a, b) {
    let s = 0;
    if (a.c === b.c) s += 3;
    if (a.r.some((x) => b.r.includes(x))) s += 2;
    if (a.d === b.d) s += 1;
    if (a.sz === b.sz) s += 1;
    return s;
  }

  function relatedFor(a, all, limit) {
    limit = limit || 6;
    return all
      .filter((b) => b.n !== a.n)
      .map((b) => ({ b: b, score: scoreOf(a, b) }))
      // Tie-break alphabetically, not by array order - array order is
      // animals.js's own edit history, which is not a signal of anything.
      .sort((x, y) => y.score - x.score || x.b.n.localeCompare(y.b.n))
      .slice(0, limit)
      .map((x) => x.b);
  }

  const Related = { relatedFor };
  if (typeof module !== 'undefined' && module.exports) module.exports = Related;
  if (typeof root !== 'undefined') root.Related = Related;
})(typeof window !== 'undefined' ? window : globalThis);
