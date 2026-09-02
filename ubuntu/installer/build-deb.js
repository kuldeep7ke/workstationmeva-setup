'use strict';
/*
 * Workstation Meva Online - Debian/Ubuntu .deb builder.
 *
 * Produces a fully self-contained amd64 .deb:
 *   - prebuilt backend/frontend (no npm on the target)
 *   - bundled Node.js linux-x64 runtime (extracted by postinst)
 *   - bundled Caddy v2 linux binary (reverse proxy on :80)
 *   - systemd units + one-time .env creation
 * Install is fully offline:  sudo apt install ./workstation-meva-online_*.deb
 *
 * Usage:
 *   node ubuntu/installer/build-deb.js [--version 1.0.0] [--arch amd64]
 *
 * Build-time needs: an npm registry (npm ci) + caddy/node downloads when not
 * cached under tools/. Install-time needs: none (offline).
 */

const { execSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');
const https = require('https');

const ROOT = path.resolve(__dirname, '..', '..');

// ----------------------------------------------------------------------------
// package metadata
// ----------------------------------------------------------------------------
const PKG = 'workstation-meva-online';
const VERSION = process.argv.find((a, i) => process.argv[i - 1] === '--version') || '1.0.0';
const ARCH = process.argv.find((a, i) => process.argv[i - 1] === '--arch') || 'amd64';
const INSTALL_DIR = '/opt/workstation-online';
const NODE_PREFIX = '/opt/workstation-node';
const OUT_DIR = path.join(ROOT, 'installer');
const OUT_DEB = path.join(OUT_DIR, `${PKG}_${VERSION}_${ARCH}.deb`);
const BUILD = path.join(os.tmpdir(), `wm-deb-${Date.now()}`);
const STAGING = path.join(BUILD, 'data');           // data.tar payload root
const CONTROL_DIR = path.join(BUILD, 'control');    // control files
const FILES_DIR = path.join(__dirname, 'files');

const MIME = 1720000000;                    // fixed tar mtime for reproducibility
const EXEC_MODE = 0o755;
const REG_MODE = 0o644;

const fail = (m) => { console.error('ERROR:', m); process.exit(1); };
const sh = (cmd, opts = {}) => execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'], ...opts });

// ----------------------------------------------------------------------------
// downloads (cached under tools/)
// ----------------------------------------------------------------------------
function download(url, dest) {
  if (fs.existsSync(dest)) return Promise.resolve();
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  console.log(`Downloading ${url}`);
  return new Promise((resolve, reject) => {
    const f = fs.createWriteStream(dest);
    const fetch = (u) => {
      https.get(u, { headers: { 'User-Agent': 'opencode-deb-builder' } }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume();
          fetch(new URL(res.headers.location, u).toString());
          return;
        }
        if (res.statusCode !== 200) { reject(new Error(`HTTP ${res.statusCode}`)); return; }
        res.pipe(f);
        f.on('finish', () => { f.close(resolve); });
      }).on('error', (e) => { f.destroy(); reject(e); });
    };
    fetch(url);
  });
}

async function getNodeBundle() {
  const glob = fs.readdirSync(path.join(ROOT, 'tools', 'node')).filter((f) => /^node-v\d+\.\d+\.\d+-linux-x64\.tar\.xz$/.test(f));
  if (glob.length) return path.join(ROOT, 'tools', 'node', glob[0]);
  const ver = 'v24.19.0';
  const url = `https://nodejs.org/dist/${ver}/node-${ver}-linux-x64.tar.xz`;
  const dest = path.join(ROOT, 'tools', 'node', `node-${ver}-linux-x64.tar.xz`);
  await download(url, dest);
  return dest;
}

async function getCaddyBin() {
  const cached = path.join(ROOT, 'tools', 'caddy');
  const bin = path.join(cached, 'caddy-linux-amd64');
  if (fs.existsSync(bin)) return bin;
  const ver = '2.11.4';
  const tarball = path.join(cached, `caddy_${ver}_linux_amd64.tar.gz`);
  await download(`https://github.com/caddyserver/caddy/releases/download/v${ver}/caddy_${ver}_linux_amd64.tar.gz`, tarball);
  fs.mkdirSync(cached, { recursive: true });
  sh(`tar -xzf "${tarball}" -C "${cached}" caddy`);
  fs.renameSync(path.join(cached, 'caddy'), bin);
  return bin;
}

// ----------------------------------------------------------------------------
// backend runtime dependencies (production only, platform-safe check)
// ----------------------------------------------------------------------------
function buildBackendRuntime() {
  const tmp = path.join(BUILD, 'backend-npm');
  fs.mkdirSync(tmp, { recursive: true });
  for (const f of ['package.json', 'package-lock.json']) {
    fs.copyFileSync(path.join(ROOT, 'backend', f), path.join(tmp, f));
  }
  console.log('Installing backend production deps (npm ci --omit=dev)...');
  sh(`npm ci --omit=dev --no-audit --no-fund --ignore-scripts`, { cwd: tmp });
  // platform safety scan
  const native = [];
  (function walk(p) {
    for (const e of fs.readdirSync(p, { withFileTypes: true })) {
      const fp = path.join(p, e.name);
      if (e.isDirectory()) walk(fp);
      else if (/\.(exe|dll|node)$/i.test(e.name)) native.push(fp);
    }
  })(path.join(tmp, 'node_modules'));
  if (native.length) {
    console.warn('WARNING: native/Windows binaries found in prod deps:', native.join(', '));
  }
  return path.join(tmp, 'node_modules');
}

// ----------------------------------------------------------------------------
// copy helpers
// ----------------------------------------------------------------------------
function cp(src, dest) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
}

function copyTree(src, dest) {
  if (!fs.existsSync(src)) fail(`missing source: ${src}`);
  fs.mkdirSync(dest, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, e.name);
    const d = path.join(dest, e.name);
    if (e.isDirectory()) copyTree(s, d);
    else if (e.isFile()) fs.copyFileSync(s, d);
  }
}

// ----------------------------------------------------------------------------
// assemble data payload under STAGING
// ----------------------------------------------------------------------------
async function assemble() {
  const opt = path.join(STAGING, 'opt', 'workstation-online');
  const npmModules = buildBackendRuntime();

  copyTree(path.join(ROOT, 'backend', 'dist'), path.join(opt, 'backend', 'dist'));
  copyTree(npmModules, path.join(opt, 'backend', 'node_modules'));
  cp(path.join(ROOT, 'backend', '.env.example'), path.join(opt, 'backend', '.env.example'));
  cp(path.join(ROOT, 'backend', 'package.json'), path.join(opt, 'backend', 'package.json'));

  copyTree(path.join(ROOT, 'frontend', 'dist'), path.join(opt, 'frontend', 'dist'));

  // bundled node runtime (ships as compressed tarball; postinst extracts it)
  const nodeBundle = await getNodeBundle();
  fs.mkdirSync(path.join(opt, 'tools', 'node'), { recursive: true });
  cp(nodeBundle, path.join(opt, 'tools', 'node', path.basename(nodeBundle)));

  // caddy + config
  fs.mkdirSync(path.join(opt, 'proxy', 'caddy'), { recursive: true });
  cp(await getCaddyBin(), path.join(opt, 'proxy', 'caddy', 'caddy'));
  cp(path.join(ROOT, 'proxy', 'caddy', 'Caddyfile'), path.join(opt, 'proxy', 'caddy', 'Caddyfile'));

  // manual-mode launchers (parity with repo)
  fs.mkdirSync(path.join(opt, 'ubuntu'), { recursive: true });
  for (const f of ['start.sh', 'stop.sh', 'start-server-core.sh']) {
    cp(path.join(ROOT, 'ubuntu', f), path.join(opt, 'ubuntu', f));
  }
  for (const f of ['create-env.sh', 'clean-junk.sh', 'caddy-watchdog.sh', 'README.md', '.env.example']) {
    cp(path.join(ROOT, f), path.join(opt, f));
  }
  fs.mkdirSync(path.join(opt, 'docs'), { recursive: true });
  for (const f of ['SETUP-GUIDE-UBUNTU.md', 'SETUP-SUPABASE.md']) {
    cp(path.join(ROOT, 'docs', f), path.join(opt, 'docs', f));
  }

  // systemd units
  const etc = path.join(STAGING, 'etc', 'systemd', 'system');
  fs.mkdirSync(etc, { recursive: true });
  cp(path.join(FILES_DIR, 'workstation-meva.service'), path.join(etc, 'workstation-meva.service'));
  cp(path.join(FILES_DIR, 'workstation-meva-caddy.service'), path.join(etc, 'workstation-meva-caddy.service'));

  npmModules && fs.rmSync(npmModules, { recursive: true, force: true });
}

// ----------------------------------------------------------------------------
// tar writer (GNU longnames, deterministic)
// ----------------------------------------------------------------------------
function isExecEntry(name) {
  return name.endsWith('.sh') || /\/caddy$/.test(name);
}

function tarWrite(root, files) {
  const entries = files.map((rel) => {
    const abs = path.join(root, rel);
    const st = fs.statSync(abs);
    return { tar: rel.replace(/\\/g, '/'), abs, dir: st.isDirectory() };
  });
  entries.sort((a, b) => {
    const an = a.tar + (a.dir ? '/' : '');
    const bn = b.tar + (b.dir ? '/' : '');
    return an < bn ? -1 : 1;
  });

  const chunks = [];
  chunks.push(header(Buffer.from('./', 'ascii'), '5', Buffer.alloc(0), EXEC_MODE));
  const store = (name, typeflag, data, mode) => {
    let nm = Buffer.from(name, 'utf8');
    if (nm.length > 100) {
      chunks.push(header(Buffer.from('././@LongLink', 'ascii'), 'L', nm, REG_MODE));
      chunks.push(pad512(nm));
      nm = Buffer.from('././@LongLink', 'ascii');
    }
    chunks.push(header(nm, typeflag, data, mode));
    chunks.push(pad512(data || Buffer.alloc(0)));
  };

  for (const e of entries) {
    const name = e.dir ? e.tar + '/' : e.tar;
    if (e.dir) store(name, '5', Buffer.alloc(0), EXEC_MODE);
    else store(name, '0', fs.readFileSync(e.abs), isExecEntry(name) ? EXEC_MODE : REG_MODE);
  }
  return Buffer.concat(chunks);
}

function header(nameBuf, typeflag, data, mode) {
  const buf = Buffer.alloc(512);
  buf.set(nameBuf, 0);
  buf.write(mode.toString(8).padStart(7, '0'), 100, 7, 'ascii');
  buf.write('0000000', 108, 7, 'ascii');      // uid
  buf.write('0000000', 116, 7, 'ascii');      // gid
  buf.write((data ? data.length : 0).toString(8).padStart(11, '0'), 124, 11, 'ascii');
  buf.write(MIME.toString(8).padStart(11, '0'), 136, 11, 'ascii');
  buf.write('        ', 148, 8, 'ascii');     // checksum placeholder
  buf[156] = typeflag.charCodeAt(0);
  buf.write('ustar', 257, 5, 'ascii');
  buf.write('00', 263, 2, 'ascii');
  buf.write('root', 265, 4, 'ascii');
  buf.write('root', 297, 4, 'ascii');
  const sum = buf.reduce((a, b) => a + b, 0);
  buf.write(sum.toString(8).padStart(6, '0'), 148, 6, 'ascii');
  buf.write('\0 ', 154, 2, 'ascii');
  return buf;
}

function pad512(data) {
  const rem = data.length % 512;
  if (rem === 0) return data;
  return Buffer.concat([data, Buffer.alloc(512 - rem)]);
}

function walkTree(root) {
  const out = [];
  (function r(d, rel) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const fp = path.join(d, e.name);
      const rp = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) { out.push(rp); r(fp, rp); }
      else out.push(rp);
    }
  })(root, '');
  return out;
}

// ----------------------------------------------------------------------------
// control + md5sums
// ----------------------------------------------------------------------------
function md5sums(root) {
  const lines = [];
  (function r(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const fp = path.join(d, e.name);
      if (e.isDirectory()) r(fp);
      else {
        const rel = path.relative(root, fp).replace(/\\/g, '/');
        const sum = crypto.createHash('md5').update(fs.readFileSync(fp)).digest('hex');
        lines.push(`${sum}  ${rel}`);
      }
    }
  })(root);
  return lines.sort().join('\n') + '\n';
}

function installedSize(root) {
  let total = 0;
  (function r(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const fp = path.join(d, e.name);
      if (e.isDirectory()) r(fp);
      else total += fs.statSync(fp).size;
    }
  })(root);
  return Math.ceil(total / 1024);
}

function buildControl() {
  fs.mkdirSync(CONTROL_DIR, { recursive: true });
  const size = installedSize(STAGING);
  const control = [
    `Package: ${PKG}`,
    `Version: ${VERSION}`,
    'Section: web',
    'Priority: optional',
    `Architecture: ${ARCH}`,
    'Maintainer: Workstation Meva <support@workstation-meva.invalid>',
    `Installed-Size: ${size}`,
    'Suggests: openssl',
    'Description: Workstation Meva Online - Marathi newsroom office suite (offline, self-contained)',
    ' A single .deb that installs the Workstation Meva Online server on Ubuntu/Debian',
    ' together with a bundled Node.js runtime and the Caddy reverse proxy. The install',
    ' is fully offline: no npm, compiler, package downloads or internet needed.',
    ' The backend connects to your own Supabase PostgreSQL database (DATABASE_URL in',
    ' /opt/workstation-online/backend/.env). The first user to sign up becomes admin.',
    '',
  ].join('\n');
  fs.writeFileSync(path.join(CONTROL_DIR, 'control'), control);

  const conffiles = [
    '/opt/workstation-online/proxy/caddy/Caddyfile',
    '/opt/workstation-online/backend/.env.example',
    '',
  ].join('\n');
  fs.writeFileSync(path.join(CONTROL_DIR, 'conffiles'), conffiles);
  fs.writeFileSync(path.join(CONTROL_DIR, 'md5sums'), md5sums(STAGING));

  const scripts = ['postinst', 'prerm', 'postrm'];
  const files = [];
  for (const s of scripts) {
    const abs = path.join(FILES_DIR, s);
    fs.copyFileSync(abs, path.join(CONTROL_DIR, s));
    fs.chmodSync(path.join(CONTROL_DIR, s), EXEC_MODE);
    files.push(s);
  }
  const controlEntries = ['control', 'conffiles', 'md5sums', ...scripts];
  const controlTar = tarWrite(CONTROL_DIR, controlEntries);
  return zlib.gzipSync(controlTar, { level: 9 });
}

function buildData() {
  console.log('Assembling data payload...');
  const files = walkTree(STAGING);
  const dataTar = tarWrite(STAGING, files);
  console.log(`data.tar payload: ${STAGING} (${files.length} entries)`);
  return zlib.gzipSync(dataTar, { level: 9 });
}

// ----------------------------------------------------------------------------
// ar archive (.deb container)
// ----------------------------------------------------------------------------
function arWrite(members) {
  const chunks = [Buffer.from('!<arch>\n', 'ascii')];
  for (const { name, data, mode } of members) {
    const h = Buffer.alloc(60, 0x20); // space-padded fields (GNU ar style)
    h.write(name, 0, 16, 'ascii');
    h.write(Math.floor(MIME).toString(), 16, 12, 'ascii');
    h.write('0', 28, 6, 'ascii');
    h.write('0', 34, 6, 'ascii');
    h.write(mode.toString(8).padStart(7, '0'), 40, 7, 'ascii');
    h.write(data.length.toString().padStart(10, '0'), 48, 10, 'ascii');
    h.write('`\n', 58, 2, 'ascii');
    chunks.push(h, data);
    if (data.length % 2 === 1) chunks.push(Buffer.from('\n'));
  }
  return Buffer.concat(chunks);
}

// ----------------------------------------------------------------------------
// main
// ----------------------------------------------------------------------------
async function main() {
  fs.mkdirSync(BUILD, { recursive: true });
  console.log(`Building ${PKG} ${VERSION} (${ARCH})`);
  console.log(`Working dir: ${BUILD}`);

  await assemble();
  const controlGz = buildControl();
  const dataGz = buildData();

  const deb = arWrite([
    { name: 'debian-binary', data: Buffer.from('2.0\n'), mode: REG_MODE },
    { name: 'control.tar.gz', data: controlGz, mode: REG_MODE },
    { name: 'data.tar.gz', data: dataGz, mode: REG_MODE },
  ]);

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(OUT_DEB, deb);
  console.log('');
  console.log(`Wrote ${OUT_DEB}`);
  console.log(`  size        : ${(deb.length / 1024 / 1024).toFixed(1)} MB`);
  console.log(`  control arc : ${controlGz.length} bytes, data arc: ${dataGz.length} bytes`);
  console.log(`  Installed   : ${INSTALL_DIR} (data preserved on upgrade; .env one-time)`);
  console.log(`  Services    : workstation-meva.service + workstation-meva-caddy.service`);
  fs.rmSync(BUILD, { recursive: true, force: true });
}

main().catch((e) => { console.error(e); process.exit(1); });