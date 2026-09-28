// /animals/<slug> - every animal's page. See functions/_shared/animal-page.js.

import { slugify, entryFor, notFound, renderAnimal, headOf } from '../_shared/animal-page.js';

export async function onRequestGet(context) {
  const raw = String(context.params.slug || '');
  let decoded = raw;
  try { decoded = decodeURIComponent(raw); } catch { /* keep raw */ }
  const slug = slugify(decoded);
  const entry = entryFor(slug);
  if (!entry) return notFound(context);

  // One URL per animal: /animals/Snow_Leopard, /animals/snow%20leopard and
  // the like all collapse onto the canonical lowercase-hyphen form.
  if (raw !== slug) return Response.redirect(new URL('/animals/' + slug, context.request.url).toString(), 301);

  return renderAnimal(context, slug, entry);
}

export const onRequestHead = headOf(onRequestGet);
