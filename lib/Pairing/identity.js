// Identitas perangkat tertaut (linked-device identity).
//
// Tuple `browser = [os, browser, version]` menentukan nama yang tampil di HP
// pada menu *Linked devices*, tapi tidak semua isinya sama aturannya:
//
//  1. DeviceProps.os (= browser[0])  → teks di daftar perangkat. Bebas.
//  2. companion_platform_display      → VALIDASI server saat pairing kode.
//     Nilai di luar allow-list = error 400 bad-request, dan HP tidak pernah
//     dapat notifikasi. Lihat tabel PAIRING_ACCEPTED_* di bawah.
//  3. WebInfo.webSubPlatform          → hanya relevan untuk identitas "Desktop".
//
// Prinsip modul ini (meniru @xbibzlibrary/whatsbibz):
//  • Kalau identitas ditentukan user (env DEVICE_IDENTITY / BIBZ_BROWSER),
//    pakai apa adanya — jangan "dibetulkan" diam-diam. Cukup beri peringatan.
//  • Kalau tidak, pakai profil paling stabil dan BERPUTAR ke profil berikutnya
//    hanya saat server menolaknya (428 sebelum QR, 400 saat pairing, 405).
//  • Profil yang terbukti bekerja disimpan ke <session>/identity.json agar
//    konsisten antar restart — identitas harus tetap sama selama sesi hidup,
//    kalau tidak HP menampilkan perangkat dengan nama berbeda.

import fs from 'node:fs'
import path from 'node:path'
import { platform, release } from 'node:os'

// ─── ALLOW-LIST companion_platform_display ─────────────────────
// Diukur langsung ke server produksi WhatsApp (WA Web 2.3000.x, 2026-09-03).
// OS di luar daftar ini PASTI menghasilkan 400 bad-request saat pairing kode.

/** OS yang diterima server pada companion_platform_display (case-insensitive) */
export const PAIRING_ACCEPTED_OS = Object.freeze([
  'Mac OS', 'macOS', 'Windows', 'Linux', 'Ubuntu', 'Debian', 'Fedora',
  'CentOS', 'Gentoo', 'Manjaro', 'Chromium OS', 'Android', 'iOS'
])

/** OS yang terbukti DITOLAK (400) → dipetakan ke padanan yang valid */
export const PAIRING_OS_FALLBACK = Object.freeze({
  'arch linux': 'Linux', archlinux: 'Linux', arch: 'Linux', 'arch linux arm': 'Linux',
  'gnu/linux': 'Linux', 'linux mint': 'Linux', mint: 'Linux', opensuse: 'Linux',
  kali: 'Linux', nixos: 'Linux', 'pop!_os': 'Linux', alpine: 'Linux', void: 'Linux',
  endeavouros: 'Linux', garuda: 'Linux', raspbian: 'Linux', 'red hat': 'Linux',
  rocky: 'Linux', almalinux: 'Linux', 'elementary os': 'Linux', zorin: 'Linux',
  'mac os x': 'Mac OS', osx: 'Mac OS', 'os x': 'Mac OS', darwin: 'Mac OS',
  'chrome os': 'Chromium OS', chromeos: 'Chromium OS',
  freebsd: 'Linux', openbsd: 'Linux', netbsd: 'Linux', solaris: 'Linux', aix: 'Linux'
})

/** Browser yang diterima server pada companion_platform_display */
export const PAIRING_ACCEPTED_BROWSERS = Object.freeze([
  'Chrome', 'Chromium', 'Firefox', 'Safari', 'Edge', 'Opera', 'Brave', 'Vivaldi', 'Arc'
])

const lower = (s) => String(s ?? '').trim().toLowerCase()

/** OS untuk companion_platform_display: nama valid, atau null bila tak dikenal */
export function resolvePairingOs(os) {
  const l = lower(os)
  if (!l) return null
  const exact = PAIRING_ACCEPTED_OS.find((o) => o.toLowerCase() === l)
  if (exact) return exact
  if (PAIRING_OS_FALLBACK[l]) return PAIRING_OS_FALLBACK[l]
  // heuristik: apa pun yang menyebut linux/ubuntu/debian → Linux; mac → Mac OS; win → Windows
  if (/\blinux\b|ubuntu|debian|fedora|arch/.test(l)) return 'Linux'
  if (/\bmac|darwin|osx/.test(l)) return 'Mac OS'
  if (/windows|win\d/.test(l)) return 'Windows'
  return null
}

/** Browser untuk companion_platform_display: "Desktop"/nama tak dikenal → Chrome */
export function resolvePairingBrowser(browser) {
  const l = lower(browser)
  const exact = PAIRING_ACCEPTED_BROWSERS.find((b) => b.toLowerCase() === l)
  if (exact) return exact
  return 'Chrome'
}

/**
 * Turunkan companion_platform_display yang PASTI lolos validasi dari tuple browser.
 *   ['Arch Linux','Chrome','6.16']  → 'Chrome (Linux)'
 *   ['Mac OS','Desktop','15.6.1']   → 'Chrome (Mac OS)'
 *   ['Ubuntu','Chrome','124.0']     → 'Chrome (Ubuntu)'
 */
export function derivePairingDisplay(browser, hostOs = platform()) {
  const [os, name] = browser || []
  const resolvedOs = resolvePairingOs(os) ?? resolvePairingOs(hostOsLabel(hostOs)) ?? 'Linux'
  return `${resolvePairingBrowser(name)} (${resolvedOs})`
}

/** Apakah string display ini akan diterima server (berdasarkan tabel di atas)? */
export function isPairingDisplayAccepted(display) {
  const m = /^(.+?) \((.+)\)$/.exec(String(display ?? '').trim())
  if (!m) return false
  const browserOk = PAIRING_ACCEPTED_BROWSERS.some((b) => b.toLowerCase() === lower(m[1]))
  const osOk = PAIRING_ACCEPTED_OS.some((o) => o.toLowerCase() === lower(m[2]))
  return browserOk && osOk
}

/** Label OS host: 'Mac OS' | 'Windows' | 'Arch Linux' | 'Ubuntu' | ... */
export function hostOsLabel(hostOs = platform()) {
  if (hostOs === 'darwin') return 'Mac OS'
  if (hostOs === 'win32') return 'Windows'
  if (hostOs === 'android') return 'Android'
  if (hostOs === 'linux') return linuxDistroName() || 'Linux'
  return 'Linux'
}

/** Nama distro dari /etc/os-release (NAME=), tanpa embel "GNU/Linux" */
export function linuxDistroName(file = '/etc/os-release') {
  try {
    const txt = fs.readFileSync(file, 'utf8')
    const m = /^NAME="?([^"\n]+)"?/m.exec(txt)
    if (!m) return null
    return m[1].replace(/\s+GNU\/Linux/i, '').trim()
  } catch {
    return null
  }
}

/** Versi OS host yang layak tampil di browser[2] */
export function hostOsVersion() {
  return release()
}

// ─── PROFIL IDENTITAS ──────────────────────────────────────────
// Urut dari yang PALING stabil. skor = gabungan: QR/handshake OK, pairing kode
// diterima tanpa penyesuaian display, tanpa webSubPlatform khusus, umum dipakai
// klien nyata (kecil kemungkinan dianggap anomali).
// Desktop sengaja TIDAK ada di sini: hanya dipakai bila diminta eksplisit
// (butuh syncFullHistory, dan DARWIN/APP_STORE ditutup server → 428 sebelum QR).

export const IDENTITY_PROFILES = Object.freeze([
  { id: 'macos-chrome', browser: ['Mac OS', 'Chrome', '15.6.1'], score: 100, note: 'default; display "Chrome (Mac OS)" diterima apa adanya' },
  { id: 'macos-safari', browser: ['Mac OS', 'Safari', '15.6.1'], score: 95, note: 'display "Safari (Mac OS)" diterima' },
  { id: 'windows-chrome', browser: ['Windows', 'Chrome', '10.0.22631'], score: 92, note: 'display "Chrome (Windows)" diterima' },
  { id: 'linux-chrome', browser: ['Linux', 'Chrome', '6.12.44'], score: 90, note: 'display "Chrome (Linux)" diterima' },
  { id: 'ubuntu-chrome', browser: ['Ubuntu', 'Chrome', '6.12.44'], score: 88, note: 'display "Chrome (Ubuntu)" diterima' },
  { id: 'macos-firefox', browser: ['Mac OS', 'Firefox', '15.6.1'], score: 85, note: 'display "Firefox (Mac OS)" diterima' },
  { id: 'windows-edge', browser: ['Windows', 'Edge', '10.0.22631'], score: 84, note: 'display "Edge (Windows)" diterima' },
  { id: 'archlinux-chrome', browser: ['Arch Linux', 'Chrome', '6.12.44'], score: 80, note: 'nama "Arch Linux" di HP; display diturunkan ke "Chrome (Linux)"' },
  // Desktop hanya via eksplisit
  { id: 'macos-desktop', browser: ['Mac OS', 'Desktop', '15.6.1'], score: 60, desktop: true, note: 'riwayat penuh; webSubPlatform WEB_BROWSER (DARWIN ditutup server)' },
  { id: 'windows-desktop', browser: ['Windows', 'Desktop', '10.0.22631'], score: 58, desktop: true, note: 'riwayat penuh; WIN_HYBRID' }
])

export const IDENTITY_STATE_FILE = 'identity.json'

const isTuple = (b) => Array.isArray(b) && b.length >= 2 && b.slice(0, 2).every((x) => typeof x === 'string' && x.trim())

/** Versi default yang wajar bila user tidak mengisi browser[2] */
export function defaultVersionForOs(os) {
  const l = lower(os)
  if (/mac|darwin|osx/.test(l)) return '15.6.1'
  if (/windows/.test(l)) return '10.0.22631'
  if (/linux|ubuntu|debian|arch|fedora/.test(l)) return '6.12.44'
  return '1.0.0'
}

const withVersion = (t) => [
  t[0],
  t[1],
  t[2] && String(t[2]).trim() ? String(t[2]).trim() : defaultVersionForOs(t[0])
]

/**
 * Parse spesifikasi identitas jadi tuple [os, browser, version].
 * Bentuk yang diterima:
 *   ['Mac OS','Chrome']        (tuple langsung)
 *   'macos-chrome'             (id profil)
 *   'archLinux:Firefox'        (preset:browser)
 *   'Mac OS/Safari/15.6.1'     (OS/Browser/Version, atau koma, atau pipe)
 */
export function parseBrowserSpec(spec) {
  if (isTuple(spec)) return withVersion([spec[0], spec[1], spec[2]])
  if (typeof spec !== 'string' || !spec.trim()) return null
  const s = spec.trim()

  const profile = IDENTITY_PROFILES.find((p) => p.id === s.toLowerCase())
  if (profile) return [...profile.browser]

  // "preset:browser" — recognised preset names
  const PRESETS = {
    macos: ['Mac OS', '15.6.1'],
    windows: ['Windows', '10.0.22631'],
    linux: ['Linux', '6.12.44'],
    ubuntu: ['Ubuntu', '6.12.44'],
    archlinux: ['Arch Linux', '6.12.44'],
    android: ['Android', '1.0.0']
  }
  const m = /^([A-Za-z]+)\s*:\s*([A-Za-z][\w ]*)$/.exec(s)
  if (m) {
    const preset = PRESETS[m[1].toLowerCase()]
    if (preset) return withVersion([preset[0], m[2].trim(), preset[1]])
    // "os:browser" untuk OS bebas
    if (resolvePairingOs(m[1])) return withVersion([m[1].trim(), m[2].trim(), ''])
  }

  const parts = s.split(/\s*[/|,]\s*/).filter(Boolean)
  if (parts.length >= 2) return withVersion([parts[0], parts[1], parts[2]])
  return null
}

/**
 * Baca identitas dari environment (semua opsional).
 * DEVICE_IDENTITY menang atas trio DEVICE_OS / DEVICE_BROWSER / DEVICE_VERSION.
 * Alias BIBZ_* dari library referensi juga diterima.
 */
export function identityFromEnv(env = process.env) {
  const raw = env.DEVICE_IDENTITY || env.BIBZ_BROWSER || env.BIBZ_IDENTITY
  if (raw) {
    if (/^auto$/i.test(raw.trim())) return 'auto'
    const t = parseBrowserSpec(raw)
    if (t) return t
  }
  const osKey = env.DEVICE_OS || env.BIBZ_DEVICE_OS
  const browserKey = env.DEVICE_BROWSER || env.BIBZ_DEVICE_BROWSER
  if (osKey || browserKey) {
    const os = osKey || hostOsLabel()
    const browser = browserKey || 'Chrome'
    const version = env.DEVICE_VERSION || env.BIBZ_DEVICE_VERSION || (osKey ? '' : hostOsVersion())
    return withVersion([os, browser, version])
  }
  return null
}

/**
 * Tentukan identitas efektif. Prioritas: eksplisit → env → 'auto'.
 * @returns {{mode:'custom'|'auto', browser:[string,string,string], source:string,
 *            profileId?:string, candidates:Array<{id:string,browser:[string,string,string]}>,
 *            notes:Array<{level:string,message:string}>}}
 */
export function resolveDeviceIdentity({ identity, authDir, env = process.env, maxRotations = 4 } = {}) {
  const notes = []

  // 1) eksplisit dari kode
  if (identity && identity !== 'auto') {
    const t = parseBrowserSpec(identity)
    if (t) {
      notes.push(...customIdentityNotes(t))
      return { mode: 'custom', browser: t, source: 'options', candidates: [{ id: 'custom', browser: t }], notes }
    }
    notes.push({ level: 'warn', message: `DEVICE_IDENTITY '${String(identity)}' tidak bisa dibaca — pakai mode otomatis` })
  }

  // 2) env
  const fromEnv = identityFromEnv(env)
  if (fromEnv && fromEnv !== 'auto') {
    notes.push(...customIdentityNotes(fromEnv))
    return { mode: 'custom', browser: fromEnv, source: 'env', candidates: [{ id: 'custom', browser: fromEnv }], notes }
  }
  if (fromEnv === 'auto') {
    notes.push({ level: 'info', message: 'DEVICE_IDENTITY=auto — identitas dipilih otomatis' })
  }

  // 3) otomatis: kandidat terurut skor, profil yang pernah sukses didahulukan
  let candidates = IDENTITY_PROFILES
    .filter((p) => !p.desktop)
    .map((p) => ({ id: p.id, browser: [...p.browser] }))
    .sort((a, b) => {
      const sa = IDENTITY_PROFILES.find((p) => p.id === a.id)?.score ?? 0
      const sb = IDENTITY_PROFILES.find((p) => p.id === b.id)?.score ?? 0
      return sb - sa
    })
    .slice(0, Math.max(2, maxRotations + 1))

  const saved = authDir ? loadIdentityState(authDir) : null
  if (saved?.browser && isTuple(saved.browser)) {
    const i = candidates.findIndex((c) => c.id === saved.profileId)
    if (i > 0) candidates = [candidates[i], ...candidates.slice(0, i), ...candidates.slice(i + 1)]
    else if (i < 0) candidates = [{ id: saved.profileId || 'saved', browser: [...saved.browser] }, ...candidates]
    notes.push({ level: 'info', message: `identitas otomatis dilanjutkan dari sesi: ${saved.browser[1]} (${saved.browser[0]})` })
  }

  return {
    mode: 'auto',
    browser: candidates[0].browser,
    source: saved ? 'auto+saved' : 'auto',
    profileId: candidates[0].id,
    candidates,
    notes
  }
}

function customIdentityNotes(t) {
  const notes = []
  if (!resolvePairingOs(t[0])) {
    notes.push({
      level: 'info',
      message: `OS '${t[0]}' tidak ada di allow-list pairing kode WhatsApp → display pairing otomatis '${derivePairingDisplay(t)}' (nama di daftar perangkat tetap '${t[0]}')`
    })
  }
  if (t[1] === 'Desktop') {
    notes.push({
      level: 'info',
      message: `identitas Desktop: riwayat penuh hanya diminta bila syncFullHistory aktif; pairing kode memakai '${derivePairingDisplay(t)}'`
    })
  }
  return notes
}

// ─── PERSISTENSI identity.json ─────────────────────────────────

export function identityStatePath(authDir) {
  return path.join(authDir, IDENTITY_STATE_FILE)
}

export function loadIdentityState(authDir) {
  try {
    const j = JSON.parse(fs.readFileSync(identityStatePath(authDir), 'utf8'))
    return j && isTuple(j.browser) ? j : null
  } catch {
    return null
  }
}

export function saveIdentityState(authDir, { browser, profileId, mode, reason }) {
  try {
    fs.mkdirSync(authDir, { recursive: true })
    fs.writeFileSync(
      identityStatePath(authDir),
      JSON.stringify({ browser, profileId, mode, reason, at: new Date().toISOString() }, null, 2)
    )
    return true
  } catch {
    return false
  }
}

export function clearIdentityState(authDir) {
  try { fs.rmSync(identityStatePath(authDir), { force: true }) } catch {}
}

// ─── DETEKSI PENOLAKAN + ROTASI ────────────────────────────────

/**
 * Apakah kegagalan ini berarti server MENOLAK IDENTITAS (bukan jaringan/nomor)?
 *  - 428 sebelum QR pernah muncul → handshake/ClientPayload ditolak
 *  - 400 bad-request pada pairing kode → companion_platform_display tak dikenal
 *  - 405 pada connect → klien/versi ditolak
 * 401/408/429/515 BUKAN alasan ganti identitas.
 */
export function isIdentityRejection({ status, sawQr = false, phase = 'connect', errorData } = {}) {
  if (phase === 'pairing') return status === 400 || errorData === 400
  if (status === 405) return true
  if (status === 428 && !sawQr) return true
  return false
}

/**
 * Pengelola rotasi identitas untuk mode otomatis.
 * next(reason) → kandidat berikutnya, atau null bila habis/custom.
 */
export function createIdentityRotator({ candidates, authDir, mode, logger, onChange = () => {} }) {
  let index = 0
  const tried = []
  const current = () => candidates[index]

  return {
    get current() { return current() },
    get index() { return index },
    get tried() { return [...tried] },
    get exhausted() { return index >= candidates.length - 1 },

    /** panggil saat identitas terbukti bekerja (QR diterima / pairing diakui / open) */
    markStable(reason = 'ok') {
      if (mode !== 'auto' || !authDir) return
      saveIdentityState(authDir, { browser: current().browser, profileId: current().id, mode, reason })
    },

    /** ganti ke kandidat berikutnya; false bila mode custom atau kandidat habis */
    next(reason) {
      if (mode !== 'auto') return false
      if (index >= candidates.length - 1) return false
      const from = current()
      tried.push({ id: from.id, reason })
      index += 1
      const c = current()
      logger?.warn?.(
        `Identitas '${from.id}' ditolak server (${reason}) → mencoba '${c.id}' = ${c.browser[1]} (${c.browser[0]})`
      )
      if (authDir) saveIdentityState(authDir, { browser: c.browser, profileId: c.id, mode, reason: `rotated: ${reason}` })
      onChange(c, reason)
      return true
    }
  }
}

/** Ringkasan identitas untuk log / UI */
export function describeIdentity(browser, { companionPlatformDisplay } = {}) {
  const display = companionPlatformDisplay || derivePairingDisplay(browser)
  return {
    browser: [...browser],
    linkedDeviceName: `${browser[1]} (${browser[0]})`,
    pairingDisplay: display,
    pairingDisplayAccepted: isPairingDisplayAccepted(display)
  }
}

/**
 * Peringatan dini identitas SEBELUM menyentuh server — dipakai supaya
// pengguna tahu display tak valid akan kena 400 saat pairing.
 */
export function lintIdentity({ browser, companionPlatformDisplay, syncFullHistory } = {}) {
  const notes = []
  if (!isTuple(browser)) {
    notes.push({ level: 'warn', message: 'browser harus [os, browser, version]' })
    return notes
  }
  const [os, name] = browser
  if (companionPlatformDisplay && !isPairingDisplayAccepted(companionPlatformDisplay)) {
    notes.push({
      level: 'warn',
      message: `PAIRING_DISPLAY '${companionPlatformDisplay}' tidak ada di allow-list WhatsApp (pairing kode akan 400). Disarankan: '${derivePairingDisplay(browser)}'`
    })
  }
  if (!companionPlatformDisplay && !resolvePairingOs(os)) {
    notes.push({
      level: 'info',
      message: `OS '${os}' tidak dikenal server untuk pairing kode → display otomatis '${derivePairingDisplay(browser)}' (nama di daftar perangkat tetap '${os}')`
    })
  }
  if (name === 'Desktop' && syncFullHistory && os === 'Mac OS') {
    notes.push({
      level: 'info',
      message: 'Mac OS Desktop + syncFullHistory: webSubPlatform DARWIN ditolak server (428) → gunakan browser non-Desktop'
    })
  }
  return notes
}
