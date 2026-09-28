// Writes content/REVIEW.md: every draft in content/animals/ (rv still
// null) laid out for a person to check, with each claim next to the
// animals.js answer it sits beside and the sources said to back it.
// Derived and gitignored - the JSON files are the real content.
//
// Run: npm run review. Then approve what you've checked with
// npm run approve -- <slug> [<slug>...] (tools/content-approve.js).

const fs = require('fs');
const path = require('path');
const { loadContent, BY_SLUG } = require('./content.js');
const { answers, HABITATS, IUCN } = require('../render-data.js');

const { all, errors } = loadContent();
const drafts = Object.keys(all).filter((s) => !all[s].rv);

const KEY_OF_ROW = [null, 'd', 'dg', 'dm', 'ac', 'h', 'p', 'et'];
const LABEL = {
  sci: 'Scientific name', ov: 'Overview', hb: 'Habitat', len: 'Length', ht: 'Height', wt: 'Weight',
  rg: 'Where it lives', df: 'What it eats', iu: 'IUCN status', grp: 'Group links', fx: 'Extra facts', cf: 'Confused with',
};

let md = `# Content review\n\n${drafts.length} draft${drafts.length === 1 ? '' : 's'} awaiting review. `;
md += 'Check each claim against its source, edit the JSON in `content/animals/`, then approve with `npm run approve -- <slug>`. ';
md += 'Preview on the real page: run `npx wrangler pages dev . --port=8788` and open `http://localhost:8788/animals/<slug>?draft=1`.\n\n';
if (errors.length) md += `**Validation errors (fix before approving):**\n\n${errors.map((e) => `- ${e}`).join('\n')}\n\n`;

for (const slug of drafts) {
  const c = all[slug];
  const a = BY_SLUG[slug];
  md += `---\n\n## ${a ? a.n : slug} (\`${slug}\`)\n\n`;
  if (c.notes) md += `> **Notes for the reviewer:** ${c.notes}\n\n`;

  for (const k of ['sci', 'ov']) if (c[k]) md += `**${LABEL[k]}:** ${c[k]}\n\n`;

  if (a) {
    md += '| Question | Answer (animals.js) | Why-note |\n|---|---|---|\n';
    answers(a, c).forEach(([q, v, , why], i) => {
      if (!KEY_OF_ROW[i]) return;
      md += `| ${q} | ${v} | ${why ? why.replace(/\|/g, '\\|') : ''} |\n`;
    });
    md += '\n';
  }

  for (const k of ['hb', 'len', 'ht', 'wt', 'rg', 'df', 'iu', 'grp']) {
    if (c[k] == null) continue;
    let v = c[k];
    if (k === 'hb') v = v.map((h) => HABITATS[h]).join(', ');
    if (k === 'iu') v = `${IUCN[v]} (${v})`;
    if (k === 'grp') v = v.map((g) => (BY_SLUG[g] ? BY_SLUG[g].n : g)).join(', ');
    md += `- **${LABEL[k]}:** ${v}\n`;
  }
  if (c.fx) c.fx.forEach((f) => { md += `- **Extra fact:** ${f}\n`; });
  if (c.cf) c.cf.forEach((x) => { md += `- **Confused with ${BY_SLUG[x.slug] ? BY_SLUG[x.slug].n : x.slug}:** ${x.tip}\n`; });
  md += '\n**Sources**\n\n';
  (c.src || []).forEach((s) => {
    md += `- [${s.title}](${s.url})${s.for ? ` backs: ${s.for.map((k) => LABEL[k] || (k === 'why' ? 'why-notes' : k)).join(', ')}` : ''}\n`;
  });
  md += '\n';
}

const out = path.join(__dirname, '..', 'content', 'REVIEW.md');
fs.writeFileSync(out, md);
console.log(`wrote content/REVIEW.md (${drafts.length} drafts)`);
