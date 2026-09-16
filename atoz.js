/* Browse page behaviour: three independent, additive pieces. Every
 * animal is still a real <a href> in the static HTML build-seo.js
 * generates - none of this is required to use the page, it just makes
 * finding one name among 438 faster.
 */
(function () {

  /* -- Current-letter highlight ----------------------------------------
     IntersectionObserver, not a scroll handler: the browser does the
     work off the main thread and there's no rAF throttling to get
     wrong. The rootMargin pins the "current" line near the top of the
     viewport, just under the fixed nav - without it, the letter only
     activates once its heading reaches the middle of the screen, which
     reads as the rail lagging a scroll behind.

     Decoration only. Every anchor still works with this disabled, and
     nothing here affects the links, the order or the markup. */
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
      for (var id in links) {
        var isCurrent = id === current;
        links[id].classList.toggle('is-here', isCurrent);
        // A screen reader gets no equivalent of the sighted scroll-
        // position cue otherwise - the class toggle alone is invisible
        // to anything that isn't looking at the rail.
        if (isCurrent) links[id].setAttribute('aria-current', 'true');
        else links[id].removeAttribute('aria-current');
      }
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

  /* -- Category filter ---------------------------------------------------
     Each animal's <li data-cat> already carries its bucket key from the
     same CATEGORY_BUCKETS table Party Mode's own category picker uses
     (baked in server-side by tools/build-seo.js) - one taxonomy, not a
     second one invented for this page. Pure show/hide: nothing is
     re-fetched or removed from the DOM, so a crawler or a no-JS visitor
     still sees the complete, real list either way. */
  (function () {
    var catRow = document.querySelector('.atoz-cats');
    if (!catRow) return;
    var buttons = Array.prototype.slice.call(catRow.querySelectorAll('button'));
    var items = Array.prototype.slice.call(document.querySelectorAll('.atoz-list li[data-cat]'));
    var groups = Array.prototype.slice.call(document.querySelectorAll('.atoz-group'));
    var subgroups = Array.prototype.slice.call(document.querySelectorAll('.atoz-subgroup'));
    var railLinks = {};
    document.querySelectorAll('.atoz-jump a').forEach(function (a) {
      railLinks[a.getAttribute('href').slice(1)] = a;
    });

    function applyFilter(key) {
      items.forEach(function (li) {
        li.hidden = key !== 'all' && li.getAttribute('data-cat') !== key;
      });
      // A sub-group (one chunk of a big letter, e.g. "Sa-Sh") can empty
      // out on its own even while the parent letter still has visible
      // names in a different chunk.
      subgroups.forEach(function (sg) {
        sg.hidden = sg.querySelectorAll('li[data-cat]:not([hidden])').length === 0;
      });
      groups.forEach(function (g) {
        var visibleCount = g.querySelectorAll('li[data-cat]:not([hidden])').length;
        g.hidden = visibleCount === 0;
        var letter = g.querySelector('.atoz-letter');
        var id = letter && letter.id;
        // Dimmed, not removed - the rail's own count stays the letter's
        // real total, and a second tap on "All" brings the link straight
        // back to life with no re-render needed.
        if (id && railLinks[id]) railLinks[id].classList.toggle('is-empty', visibleCount === 0);
      });
    }

    buttons.forEach(function (btn) {
      btn.addEventListener('click', function () {
        buttons.forEach(function (b) { b.setAttribute('aria-pressed', String(b === btn)); });
        applyFilter(btn.getAttribute('data-cat-filter'));
      });
    });
  })();

  /* -- On-page search ------------------------------------------------
     The fastest way to find one of 438 names shouldn't be two taps
     inside the corner menu's own quick-search, on the one page whose
     entire job is finding a name. Same SearchCore matching and the same
     .searchrow/.suggest/.noresult components the corner search already
     uses (menu.js) - just always visible here instead of toggled open,
     since there's no nav-bar width constraint forcing it to hide. */
  (function () {
    var input = document.getElementById('atozSearchInput');
    var resultsBox = document.getElementById('atozSearchResults');
    var noResult = document.getElementById('atozSearchNoResult');
    var wrap = document.getElementById('atozSearch');
    if (!input || !resultsBox || !noResult || !wrap || !window.SearchCore) return;

    var results = [];
    var cursor = -1;

    function renderResults() {
      resultsBox.innerHTML = '';
      if (!results.length) {
        resultsBox.hidden = true;
        input.setAttribute('aria-expanded', 'false');
        return;
      }
      results.forEach(function (entry, i) {
        var li = document.createElement('li');
        li.setAttribute('role', 'option');
        li.setAttribute('aria-selected', String(i === cursor));
        var em = document.createElement('span');
        em.className = 's-emoji';
        em.textContent = entry.a.e || '🐾';
        var nm = document.createElement('span');
        nm.textContent = entry.a.n;
        li.append(em, nm);
        li.addEventListener('mousedown', function (e) { e.preventDefault(); pick(entry); });
        resultsBox.appendChild(li);
      });
      resultsBox.hidden = false;
      input.setAttribute('aria-expanded', 'true');
    }

    function pick(entry) {
      location.href = '/?a=' + entry.slug;
    }

    input.addEventListener('input', function () {
      results = SearchCore.search(input.value, 8);
      cursor = results.length ? 0 : -1;
      renderResults();
      if (input.value.trim() && !results.length) {
        noResult.hidden = false;
        noResult.textContent = 'No match for "' + input.value.trim() +
          '". It might not be in here yet — there are ' + SearchCore.count + ' so far.';
      } else {
        noResult.hidden = true;
      }
    });

    input.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { input.value = ''; results = []; cursor = -1; renderResults(); noResult.hidden = true; return; }
      if (!results.length) return;
      if (e.key === 'ArrowDown') { e.preventDefault(); cursor = (cursor + 1) % results.length; renderResults(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); cursor = (cursor - 1 + results.length) % results.length; renderResults(); }
      else if (e.key === 'Enter' && cursor > -1) { e.preventDefault(); pick(results[cursor]); }
    });

    document.addEventListener('click', function (e) {
      if (!wrap.contains(e.target)) { resultsBox.hidden = true; }
    });
  })();

})();
