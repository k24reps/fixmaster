/**
 * One-shot codemod: convert <i className="fas fa-x ..."/> → <Icon name="x" .../>.
 * Handles string-literal AND template-literal classNames, preserves non-FA
 * classes (e.g. CSS-module animation classes), and injects the Icon import.
 *
 * Run:  node scripts/codemod-icons.mjs           (apply)
 *       node scripts/codemod-icons.mjs --dry      (preview only)
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const DRY = process.argv.includes('--dry');
const ROOT = process.cwd();

// Recursively gather .tsx files under src (no git dependency).
function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === 'dist' || entry === '.git') continue;
    const abs = join(dir, entry);
    const st = statSync(abs);
    if (st.isDirectory()) out.push(...walk(abs));
    else if (entry.endsWith('.tsx')) out.push(abs);
  }
  return out;
}
const list = walk(join(ROOT, 'src'));

// Match a self-closing <i ... /> tag.
const I_TAG = /<i\s+[^>]*?\/>/g;
// className="..."  OR  className={`...`}
const CN_STR = /className="([^"]*)"/;
const CN_TPL = /className=\{`([^`]*)`\}/;

let totalTags = 0;
const fileChanges = [];

for (const abs of list) {
  const rel = abs.slice(ROOT.length + 1).replace(/\\/g, '/');
  let src = readFileSync(abs, 'utf8');
  let changed = 0;
  const samples = [];

  src = src.replace(I_TAG, (tag) => {
    let cn = null;
    let isTpl = false;
    const mStr = tag.match(CN_STR);
    const mTpl = tag.match(CN_TPL);
    if (mTpl) {
      cn = mTpl[1];
      isTpl = true;
    } else if (mStr) {
      cn = mStr[1];
    }
    if (cn == null || !/\bfa-/.test(cn)) return tag; // not a FA icon tag

    // Dynamic name (e.g. `fa-arrow-${cond ? 'up' : 'down'}`) — too risky to
    // codemod; leave untouched and fix by hand.
    if (/fa-[a-z-]*\$\{/.test(cn)) return tag;

    // Split into tokens; pull the fa-NAME token, drop fas/fab/fa markers.
    const tokens = cn.split(/\s+/).filter(Boolean);
    let name = null;
    const rest = [];
    for (const tok of tokens) {
      if (tok === 'fas' || tok === 'fab' || tok === 'far' || tok === 'fa') continue;
      if (tok === 'fa-spin') {
        rest.push('spin'); // global keyframe utility (see global.css)
        continue;
      }
      if (tok.startsWith('fa-')) {
        if (name == null) name = tok.slice(3);
        continue;
      }
      rest.push(tok); // e.g. ${styles.spin} or a literal module class
    }
    if (!name) return tag;

    // Remaining attributes (aria-hidden, title, etc.) — strip className.
    let attrs = tag
      .replace(CN_STR, '')
      .replace(CN_TPL, '')
      .replace(/^<i\s*/, '')
      .replace(/\/>$/, '')
      .trim();

    // Rebuild a className for leftover classes (preserve template interpolation).
    let classProp = '';
    if (rest.length) {
      const joined = rest.join(' ');
      classProp = isTpl ? ` className={\`${joined}\`}` : ` className="${joined}"`;
    }

    const attrStr = attrs ? ` ${attrs}` : '';
    const out = `<Icon name="${name}"${classProp}${attrStr} />`;
    changed++;
    if (samples.length < 3) samples.push(`${tag}  →  ${out}`);
    return out;
  });

  if (changed > 0) {
    // Inject Icon import if missing.
    if (!/\bIcon\b[^\n]*from '@\/components\/ui'/.test(src) && !/from '@\/components\/ui\/Icon'/.test(src)) {
      if (/import\s*\{[^}]*\}\s*from\s*'@\/components\/ui';/.test(src)) {
        // Add Icon to the existing ui barrel import.
        src = src.replace(/import\s*\{([^}]*)\}\s*from\s*'@\/components\/ui';/, (_m, inner) => {
          const names = inner.split(',').map((s) => s.trim()).filter(Boolean);
          if (!names.includes('Icon')) names.push('Icon');
          return `import { ${names.join(', ')} } from '@/components/ui';`;
        });
      } else {
        // Prepend a dedicated import after the first import line.
        src = src.replace(/(^.*?\n)/, `$1import { Icon } from '@/components/ui';\n`);
      }
    }
    totalTags += changed;
    fileChanges.push({ rel, changed, samples });
    if (!DRY) writeFileSync(abs, src, 'utf8');
  }
}

console.log(`${DRY ? '[DRY] ' : ''}files changed: ${fileChanges.length}, tags converted: ${totalTags}`);
for (const f of fileChanges) {
  console.log(`\n${f.rel}  (${f.changed})`);
  for (const s of f.samples) console.log('   ' + s);
}
