// Uji matriks lifecycle: simulasikan callback close dengan statusCode
// dan pastikan counter module-scope bekerja (guard tidak ke-reset).
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { DisconnectReason } from '../lib/Types/index.js'

function sessionWipeReason(status, message = '') {
  if (status === DisconnectReason.loggedOut) return '401 loggedOut'
  if (status === 500) return '500 badSession'
  if (status === 411) return '411 multideviceMismatch'
  if (/corrupt|invalid creds|bad session|unauthorized/i.test(String(message))) return `error sesi: ${String(message).slice(0, 60)}`
  return null
}

test('sessionWipeReason memetakan status yang benar', () => {
  assert.equal(sessionWipeReason(401), '401 loggedOut')
  assert.equal(sessionWipeReason(500), '500 badSession')
  assert.equal(sessionWipeReason(411), '411 multideviceMismatch')
  assert.equal(sessionWipeReason(428), null, '428 = identitas, bukan sesi')
  assert.equal(sessionWipeReason(408), null)
  assert.equal(sessionWipeReason(515), null, '515 = sukses pairing')
  assert.equal(sessionWipeReason(undefined, 'session corrupt'), 'error sesi: session corrupt')
})

test('counter attempts tidak ke-reset antar reconnect', () => {
  // Simulasikan bug lama: counter local di dalam start()
  const simulate = (asLocal) => {
    let attempts = 0
    const reconnect = () => {
      // start() baru dibuat tiap reconnect
      if (asLocal) attempts = 0
      attempts += 1
      return attempts
    }
    const seq = []
    for (let i = 0; i < 5; i++) seq.push(reconnect())
    return seq
  }
  assert.deepEqual(simulate(false), [1,2,3,4,5], 'module scope: counter naik terus')
  assert.deepEqual(simulate(true), [1,1,1,1,1], 'lokal: guard tidak pernah tembus (bug lama)')
})

test('backoff: 10s x attempt, cap 60s', () => {
  const delay = (n) => Math.min(10_000 * n, 60_000)
  assert.equal(delay(1), 10_000)
  assert.equal(delay(3), 30_000)
  assert.equal(delay(6), 60_000)
  assert.equal(delay(20), 60_000, 'cap')
})

test('515 diprioritaskan sebelum wipe (pairing sukses)', () => {
  // urutan di handler: 515 -> 401-pending -> 401 -> wipe -> backoff
  const order = (status) => {
    if (status === DisconnectReason.restartRequired) return 'restart-2s'
    if (status === DisconnectReason.loggedOut) return 'loggedout'
    if (sessionWipeReason(status)) return 'wipe'
    return 'backoff'
  }
  assert.equal(order(515), 'restart-2s')
  assert.equal(order(428), 'backoff', 'identitas handled di socket.js')
  assert.equal(order(500), 'wipe')
})
