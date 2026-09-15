/* Marks the letter you're currently reading in the A-Z rail.
 *
 * IntersectionObserver, not a scroll handler: the browser does the work
 * off the main thread and there's no rAF throttling to get wrong. The
 * rootMargin pins the "current" line near the top of the viewport, just
 * under the fixed nav - without it, the letter only activates once its
 * heading reaches the middle of the screen, which reads as the rail
 * lagging a scroll behind.
 *
 * Decoration only. Every anchor still works with this disabled, and
 * nothing here affects the links, the order or the markup.
 */
(function () {
  var rail = document.querySelector('.atoz-jump');
  if (!rail || !('IntersectionObserver' in window)) return;

  var links = {};
  rail.querySelectorAll('a').forEach(function (a) {
    links[a.getAttribute('href').slice(1)] = a;
  });

  var visible = new Set();
  var letters = Array.prototype.map.call(
    document.querySelectorAll('.atoz-letter'),
    function (h) { return h.id; }
  );

  function paint() {
    // The topmost visible letter wins, so scrolling up and down past a
    // boundary always agrees with itself.
    var current = letters.find(function (id) { return visible.has(id); });
    for (var id in links) links[id].classList.toggle('is-here', id === current);
  }

  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      if (e.isIntersecting) visible.add(e.target.id);
      else visible.delete(e.target.id);
    });
    paint();
  }, { rootMargin: '-15% 0px -70% 0px' });

  document.querySelectorAll('.atoz-letter').forEach(function (h) { io.observe(h); });
})();
