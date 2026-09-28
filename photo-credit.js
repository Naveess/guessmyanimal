/* The animal page's photo, and the credit its licence requires.
 *
 * Almost every lead photo on Wikipedia lives on Wikimedia Commons under a
 * licence (CC BY, CC BY-SA, ...) that requires naming the author and the
 * licence wherever it's reused. "Photo via Wikipedia" did neither. This
 * asks Commons directly for the file's author, licence and a properly
 * sized rendition, and builds the credit line from what it returns -
 * never from a guess.
 *
 * Rules that follow from that:
 *   - No Commons record, or a non-free ("fair use") file: no photo at
 *     all. Non-free files are only licensed to Wikipedia itself, not to
 *     sites reusing them.
 *   - No author in the metadata: credit "Wikimedia Commons" and link the
 *     file page, where the full terms are. Never invent a name.
 *
 * Same dual-export shape as render-data.js: a browser global (app.js,
 * which looks photos up live as you move between animals) and a Node
 * module (tools/build-photos.js, which bakes the same data in ahead of
 * time so the server-rendered page has its photo before any JS runs).
 */
(function (root) {
  const API = 'https://commons.wikimedia.org/w/api.php?action=query&format=json&formatversion=2' +
    '&origin=*&prop=imageinfo&iiprop=url%7Cextmetadata&iiurlwidth=900' +
    '&iiextmetadatafilter=Artist%7CLicenseShortName%7CLicenseUrl%7CAttributionRequired&titles=';

  // "File:Name.jpg" from any upload.wikimedia.org / thumb URL - or null
  // when the file lives on English Wikipedia itself rather than Commons,
  // which in practice means a non-free image we must not reuse.
  function fileTitleFromUrl(url) {
    const m = String(url || '').match(/\/wikipedia\/commons\/(?:thumb\/)?[0-9a-f]\/[0-9a-f]{2}\/([^/?#]+)/);
    if (!m) return null;
    try { return 'File:' + decodeURIComponent(m[1]); } catch (e) { return null; }
  }

  function apiUrl(fileTitle) { return API + encodeURIComponent(fileTitle); }

  const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'", nbsp: ' ' };
  function plain(html) {
    return String(html || '')
      .replace(/<[^>]*>/g, ' ')
      .replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (m, k) => ENTITIES[k])
      .replace(/\s+/g, ' ')
      .trim();
  }

  // The Commons API response -> { src, width, height, filePage, artist,
  // license, licenseUrl }, or null if it can't be used.
  function fromApi(json) {
    const page = json && json.query && json.query.pages && json.query.pages[0];
    if (!page || page.missing || !page.imageinfo || !page.imageinfo[0]) return null;
    const info = page.imageinfo[0];
    const meta = info.extmetadata || {};
    const val = (k) => (meta[k] && meta[k].value) || '';
    const license = plain(val('LicenseShortName'));
    if (!license || /fair use|non-free/i.test(license)) return null;
    let artist = plain(val('Artist'));
    if (artist.length > 48) artist = artist.slice(0, 45).trim() + '…';
    return {
      // Commons tacks ?utm_ tracking onto every URL; the image doesn't need it.
      src: String(info.thumburl || info.url || '').replace(/\?utm_[^#]*$/, ''),
      width: info.thumbwidth || info.width || 0,
      height: info.thumbheight || info.height || 0,
      filePage: info.descriptionurl || '',
      artist,
      license,
      licenseUrl: val('LicenseUrl'),
    };
  }

  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // "Photo: Giles Laurent, CC BY-SA 4.0" - the author links to the file's
  // Commons page (where the full terms and any required wording live), the
  // licence to its deed. Returned as an HTML string for the server-side
  // build; app.js uses the same function so both paths print the same line.
  function creditHtml(p) {
    const link = (href, text) => href
      ? `<a href="${esc(href)}" target="_blank" rel="noopener">${esc(text)}</a>`
      : esc(text);
    const who = link(p.filePage, p.artist || 'Wikimedia Commons');
    const lic = link(p.licenseUrl, p.license);
    return `Photo: ${who}, ${lic}`;
  }

  const PhotoCredit = { fileTitleFromUrl, apiUrl, fromApi, creditHtml };
  if (typeof module !== 'undefined' && module.exports) module.exports = PhotoCredit;
  if (typeof root !== 'undefined') root.PhotoCredit = PhotoCredit;
})(typeof window !== 'undefined' ? window : globalThis);
