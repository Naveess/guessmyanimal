/* Structured data (JSON-LD) for the generated pages and the animal
 * Function. Deliberately small and true by construction:
 *
 *   WebSite         the homepage only (index.html carries it inline;
 *                   functions/_shared/animal-page.js strips it from the
 *                   animal pages that reuse that shell).
 *   WebPage /       every other page, with dateModified taken from the
 *   CollectionPage  real review date (rv) when there is one.
 *   BreadcrumbList  the path back up the site.
 *
 * No author, reviewedBy or rating: the site has nothing true to put in
 * them beyond what the About page already says in words.
 */
const SITE = 'https://guessmyanimal.com';
const WEBSITE_ID = `${SITE}/#website`;

// crumbs: [[name, path], ...] from the top, the last being this page.
function breadcrumbs(crumbs) {
  return {
    '@type': 'BreadcrumbList',
    itemListElement: crumbs.map(([name, p], i) => ({
      '@type': 'ListItem', position: i + 1, name, item: SITE + p,
    })),
  };
}

function page({ type = 'WebPage', path, name, description, dateModified, image, crumbs }) {
  const url = SITE + path;
  const pg = {
    '@type': type,
    '@id': url,
    url,
    name,
    description,
    inLanguage: 'en-GB',
    isPartOf: { '@id': WEBSITE_ID },
  };
  if (dateModified) pg.dateModified = dateModified;
  if (image) pg.primaryImageOfPage = { '@type': 'ImageObject', url: image };
  const graph = [pg];
  if (crumbs) {
    const bc = breadcrumbs(crumbs);
    bc['@id'] = url + '#breadcrumb';
    pg.breadcrumb = { '@id': bc['@id'] };
    graph.push(bc);
  }
  return { '@context': 'https://schema.org', '@graph': graph };
}

// The <script> tag. "<" is escaped so no string in the data can close it.
const scriptTag = (obj) =>
  `<script type="application/ld+json">${JSON.stringify(obj).replace(/</g, '\\u003c')}</script>`;

module.exports = { page, breadcrumbs, scriptTag, SITE, WEBSITE_ID };
