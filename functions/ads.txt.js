// /ads.txt: the sellers authorised to sell this site's ad space.
//
// The value is an ADS_TXT environment variable if one is set (Cloudflare
// Pages > Settings > Variables, then redeploy), otherwise adsTxt in
// functions/_shared/ads.json. Empty in both, it's a 404 rather than an
// empty 200, which an ad buyer could read as "nobody is authorised".

import ADS from './_shared/ads.json';

export function onRequestGet({ env }) {
  const body = String((env && env.ADS_TXT) || ADS.adsTxt || '').trim();
  if (!body) return new Response('Not found\n', { status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  return new Response(body + '\n', {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
