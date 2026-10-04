// Offline test untuk pairing controller + device identity (lib/Pairing).
// Tidak menyentuh jaringan. Jalankan: bun test ./test/
import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  createPairingController, pairingErrorCode, isRateLimitError,
  isCustomPairingError, isRegistrationRejected, isTimeoutError, normalizePairingCode
} from '../lib/Pairing/controller.js'
import {
  resolvePairingOs, resolvePairingBrowser, derivePairingDisplay,
  isPairingDisplayAccepted, isIdentityRejection, createIdentityRotator,
  resolveDeviceIdentity, parseBrowserSpec
} from '../lib/Pairing/identity.js'

// ─── Klasifikasi error ─────────────────────────────────────────
test('pairingErrorCode membaca error.data, bukan output.statusCode', () => {
  // Boom dari assertNodeErrorFree: statusCode 500 generik, kode WA di .data
  assert.equal(pairingErrorCode({ data: 400, output: { statusCode: 500 } }), 400)
  assert.equal(pairingErrorCode({ data: 429, output: { statusCode: 500 } }), 429)
  // tanpa .data, pakai statusCode yang bukan 500
  assert.equal(pairingErrorCode({ output: { statusCode: 408 } }), 408)
  assert.equal(pairingErrorCode({ output: { statusCode: 500 } }), undefined)
  assert.equal(pairingErrorCode(new Error('boom')), undefined)
})

test('klasifikasi rate-limit / custom / rejected / timeout', () => {
  assert.ok(isRateLimitError({ data: 429, output: { statusCode: 500 } }))
  assert.ok(isRateLimitError({ data: 428, output: { statusCode: 500 } }))
  assert.ok(isRateLimitError(new Error('rate-overlimit')))
  assert.ok(!isRateLimitError({ data: 400, output: { statusCode: 500 } }))

  assert.ok(isCustomPairingError({ data: 422, output: { statusCode: 500 } }))
  assert.ok(isCustomPairingError(new Error('invalid pairing code')))
  assert.ok(!isCustomPairingError({ data: 400, output: { statusCode: 500 } }))

  assert.ok(isRegistrationRejected({ data: 400, output: { statusCode: 500 } }))
  assert.ok(!isRegistrationRejected({ data: 429, output: { statusCode: 500 } }))

  assert.ok(isTimeoutError({ data: 408, output: { statusCode: 500 } }))
  assert.ok(isTimeoutError(new Error('request timed out')))
})

test('normalizePairingCode hanya terima 8 char A-Z0-9', () => {
  assert.equal(normalizePairingCode('xbizpro1'), 'XBIZPRO1')
  assert.equal(normalizePairingCode('  ABCD1234  '), 'ABCD1234')
  assert.equal(normalizePairingCode('SHORT'), '')
  assert.equal(normalizePairingCode('TOOLONGCODE'), '')
  assert.equal(normalizePairingCode('ABC-1234'), '')
})

// ─── Allow-list companion_platform_display ─────────────────────
test('OS di luar allow-list dipetakan ke padanan valid', () => {
  assert.equal(resolvePairingOs('Ubuntu'), 'Ubuntu')
  assert.equal(resolvePairingOs('Mac OS'), 'Mac OS')
  assert.equal(resolvePairingOs('Arch Linux'), 'Linux', 'Arch Linux ditolak 400 → Linux')
  assert.equal(resolvePairingOs('Linux Mint'), 'Linux')
  assert.equal(resolvePairingOs('Darwin'), 'Mac OS')
  assert.equal(resolvePairingOs('Chrome OS'), 'Chromium OS')
  assert.equal(resolvePairingOs('nama-produk-totol'), null)
})

test('browser "Desktop" dan tak dikenal turun ke Chrome', () => {
  assert.equal(resolvePairingBrowser('Chrome'), 'Chrome')
  assert.equal(resolvePairingBrowser('Safari'), 'Safari')
  assert.equal(resolvePairingBrowser('Desktop'), 'Chrome', '"Desktop" ditolak 400')
  assert.equal(resolvePairingBrowser('ProdukX'), 'Chrome')
})

test('derivePairingDisplay selalu menghasilkan nilai yang diterima', () => {
  assert.equal(derivePairingDisplay(['Mac OS', 'Chrome', '15.6.1']), 'Chrome (Mac OS)')
  assert.equal(derivePairingDisplay(['Arch Linux', 'Chrome', '6.12']), 'Chrome (Linux)')
  assert.equal(derivePairingDisplay(['Mac OS', 'Desktop', '15.6.1']), 'Chrome (Mac OS)')
  assert.equal(derivePairingDisplay(['Ubuntu', 'Chrome', '124.0']), 'Chrome (Ubuntu)')
  // nama produk tidak dikenal sebagai OS → jatuh ke host, tetap valid
  for (const browser of [['FooBar', 'Chrome', '1.0'], ['NixOS', 'Firefox', '1.0']]) {
    assert.ok(isPairingDisplayAccepted(derivePairingDisplay(browser)), `${browser[0]} harus valid`)
  }
})

test('isPairingDisplayAccepted menolak nilai yang kena 400', () => {
  assert.ok(isPairingDisplayAccepted('Chrome (Mac OS)'))
  assert.ok(!isPairingDisplayAccepted('Chrome (Arch Linux)'), 'Arch Linux kena 400')
  assert.ok(!isPairingDisplayAccepted('Desktop (Mac OS)'), '"Desktop" kena 400')
  assert.ok(!isPairingDisplayAccepted('Chrome'))
  assert.ok(!isPairingDisplayAccepted(''))
})

// ─── Deteksi penolakan identitas ───────────────────────────────
test('isIdentityRejection hanya 405 dan 428-sebelum-QR', () => {
  assert.ok(isIdentityRejection({ status: 405 }))
  assert.ok(isIdentityRejection({ status: 428, sawQr: false }))
  assert.ok(!isIdentityRejection({ status: 428, sawQr: true }), 'QR sudah keluar = bukan masalah identitas')
  assert.ok(!isIdentityRejection({ status: 401 }))
  assert.ok(!isIdentityRejection({ status: 408 }))
  assert.ok(!isIdentityRejection({ status: 515 }))
  // fase pairing: 400 = companion_platform_display tak dikenal
  assert.ok(isIdentityRejection({ phase: 'pairing', status: 400 }))
  assert.ok(!isIdentityRejection({ phase: 'pairing', status: 429 }))
})

// ─── Rotasi identitas ──────────────────────────────────────────
test('rotator berputar hanya di mode auto', () => {
  const mk = (mode) => createIdentityRotator({
    candidates: [{ id: 'a', browser: ['Mac OS', 'Chrome', '1'] }, { id: 'b', browser: ['Linux', 'Chrome', '2'] }],
    authDir: null, mode, logger: { warn() {} }
  })

  const auto = mk('auto')
  assert.equal(auto.current.id, 'a')
  assert.ok(auto.next('428 sebelum QR'))
  assert.equal(auto.current.id, 'b')
  assert.ok(!auto.next('lagi'), 'kandidat habis → false')
  assert.equal(auto.tried.length, 1)
  assert.equal(auto.tried[0].id, 'a')

  const custom = mk('custom')
  assert.ok(!custom.next('428'), 'mode custom tidak pernah mengganti identitas diam-diam')
  assert.equal(custom.current.id, 'a')
})

test('resolveDeviceIdentity: env kustom menang, lalu auto', () => {
  const custom = resolveDeviceIdentity({ identity: 'archLinux:Firefox', authDir: null, env: {} })
  assert.equal(custom.mode, 'custom')
  assert.equal(custom.browser[0], 'Arch Linux')
  assert.equal(custom.browser[1], 'Firefox')

  const fromEnv = resolveDeviceIdentity({ authDir: null, env: { DEVICE_IDENTITY: 'ubuntu-chrome' } })
  assert.equal(fromEnv.mode, 'custom')
  assert.equal(fromEnv.browser[0], 'Ubuntu')

  const auto = resolveDeviceIdentity({ authDir: null, env: {} })
  assert.equal(auto.mode, 'auto')
  assert.equal(auto.browser[0], 'Mac OS', 'profil paling stabil didahulukan')
  assert.ok(auto.candidates.length >= 2, 'ada kandidat cadangan untuk rotasi')
  for (const c of auto.candidates) {
    assert.notEqual(c.browser[1], 'Desktop', 'Desktop tidak masuk kandidat auto')
  }
})

test('parseBrowserSpec menerima beberapa bentuk', () => {
  assert.deepEqual(parseBrowserSpec('macos-chrome'), ['Mac OS', 'Chrome', '15.6.1'])
  assert.deepEqual(parseBrowserSpec('Mac OS/Safari/15.6.1'), ['Mac OS', 'Safari', '15.6.1'])
  assert.deepEqual(parseBrowserSpec('windows:Edge'), ['Windows', 'Edge', '10.0.22631'])
  assert.deepEqual(parseBrowserSpec(['Ubuntu', 'Chrome']), ['Ubuntu', 'Chrome', '6.12.44'])
  assert.equal(parseBrowserSpec('   '), null)
})

// ─── Pairing controller (dengan sock palsu) ────────────────────
const makeSock = () => {
  const calls = []
  return {
    calls,
    authState: { creds: { registered: false } },
    requestPairingCode: async (phone, custom) => {
      calls.push({ phone, custom })
      return 'ABCD1234'
    }
  }
}

test('controller menerbitkan kode setelah server ACK', async () => {
  const sock = makeSock()
  const codes = []
  const ctl = createPairingController({ sock, phone: '628123', onCode: (code, meta) => codes.push({ code, meta }) })
  const code = await ctl.start()
  assert.equal(code, 'ABCD1234')
  assert.equal(sock.calls[0].phone, '628123')
  assert.equal(codes.length, 1)
  assert.equal(codes[0].meta.custom, false)
})

test('controller berhenti begitu creds.registered = true', async () => {
  const sock = makeSock()
  sock.authState.creds.registered = true
  const ctl = createPairingController({ sock, phone: '628123' })
  assert.equal(await ctl.start(), null, 'tidak meminta kode kalau sudah registered')
  assert.equal(sock.calls.length, 0)
})

test('controller menolak request paralel (satu in-flight)', async () => {
  const sock = makeSock()
  let release
  sock.requestPairingCode = () => new Promise((r) => { release = () => r('ABCD1234') })
  const ctl = createPairingController({ sock, phone: '628123' })
  const first = ctl.start()
  const second = await ctl.start()
  assert.equal(second, null, 'request kedua diabaikan')
  release()
  assert.equal(await first, 'ABCD1234')
})

test('400 bad-request memicu onRejected, controller berhenti', async () => {
  const sock = makeSock()
  sock.requestPairingCode = async () => {
    const err = new Error('bad-request')
    err.data = 400
    err.output = { statusCode: 500 }
    throw err
  }
  let rejectedWith = null
  const ctl = createPairingController({
    sock, phone: '628123',
    onRejected: (err, info) => { rejectedWith = info.code; return true }
  })
  assert.equal(await ctl.start(), null)
  assert.equal(rejectedWith, 400)
  assert.ok(ctl.isStopped(), 'rotasi diambil alih → controller tidak menjadwalkan ulang')
})

test('429_rate-limit tidak memicu rotasi identitas', async () => {
  const sock = makeSock()
  sock.requestPairingCode = async () => {
    const err = new Error('rate-overlimit')
    err.data = 429
    err.output = { statusCode: 500 }
    throw err
  }
  let rejected = false
  const ctl = createPairingController({ sock, phone: '628123', onRejected: () => { rejected = true; return true } })
  await ctl.start()
  assert.ok(!rejected, '429 bukan penolakan identitas')
  assert.ok(!ctl.isStopped(), 'harus mencoba lagi dengan backoff')
})

test('custom code ditolak → fallback sekali ke kode acak', async () => {
  const sock = makeSock()
  let n = 0
  sock.requestPairingCode = async (phone, custom) => {
    n++
    if (custom) {
      const err = new Error('custom pairing code rejected')
      err.data = 422
      err.output = { statusCode: 500 }
      throw err
    }
    sock.calls.push({ phone, custom })
    return 'RANDOM99'
  }
  sock.calls = []
  const codes = []
  const ctl = createPairingController({
    sock, phone: '628123', pairingCode: 'MYCODE12',
    onCode: (code, meta) => codes.push({ code, meta })
  })
  const code = await ctl.start()
  assert.equal(code, 'RANDOM99')
  assert.equal(codes[0].meta.fallback, true, 'ditandai sebagai fallback')
  assert.equal(sock.calls.length, 1, 'fallback hanya dicoba sekali')
})
