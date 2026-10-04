// Regresi: `pair-success` harus menandai sesi sebagai registered.
//
// Gejalanya (v1.0.8 Kizuna): QR di-scan → server balas `pair-success` lalu
// LANGSUNG menutup socket dengan 515. Tidak ada notifikasi
// `link_code_companion_reg` (yang di versi WA Web sekarang tidak pernah
// dikirim), padahal hanya notifikasi itu — di lib/Socket/messages-recv.js —
// yang menyetel `creds.registered = true`. Akibatnya creds.json tertinggal
// dengan `me` terisi + `registered: false`, dan boot berikutnya mengambil
// jalur login pasif lalu gagal berulang ("restart session" loop).
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { randomBytes } from 'crypto'
import { proto } from '../WAProto/index.js'
import { Curve, hmacSign } from '../lib/Utils/crypto.js'
import { configureSuccessfulPairing } from '../lib/Utils/validate-connection.js'
import { WA_ADV_ACCOUNT_SIG_PREFIX, WA_ADV_DEVICE_SIG_PREFIX } from '../lib/Defaults/index.js'

/**
 * Bangun stanza `pair-success` yang tanda tangannya VALID, supaya
 * configureSuccessfulPairing tidak menolak di sisi verifikasi signature.
 */
const makePairSuccessStanza = () => {
	const advSecretKey = randomBytes(32).toString('base64')
	const signedIdentityKey = Curve.generateKeyPair()
	const accountKeyPair = Curve.generateKeyPair()
	const accountType = proto.ADVEncryptionType.E2EE
	// `ADVSignedDeviceIdentity.details` is itself an encoded ADVDeviceIdentity
	// (keyIndex/deviceType) — bukan byte mentah.
	const deviceDetails = proto.ADVDeviceIdentity.encode({
		keyIndex: 5,
		accountType,
		deviceType: accountType
	}).finish()
	const accountSignature = Curve.sign(
		accountKeyPair.private,
		Buffer.concat([WA_ADV_ACCOUNT_SIG_PREFIX, deviceDetails, signedIdentityKey.public])
	)
	const deviceSignature = Curve.sign(
		signedIdentityKey.private,
		Buffer.concat([WA_ADV_DEVICE_SIG_PREFIX, deviceDetails, accountKeyPair.public])
	)

	const details = proto.ADVSignedDeviceIdentity.encode({
		details: deviceDetails,
		accountSignatureKey: accountKeyPair.public,
		accountSignature,
		deviceSignature
	}).finish()

	const hmac = hmacSign(
		Buffer.concat([Buffer.from([]), details]),
		Buffer.from(advSecretKey, 'base64')
	)

	const deviceIdentity = proto.ADVSignedDeviceIdentityHMAC.encode({
		details,
		hmac,
		accountType
	}).finish()

	return {
		stanza: {
			attrs: { id: 'PAIRING1' },
			content: [
				{
					tag: 'pair-success',
					content: [
						{ tag: 'platform', attrs: { name: 'android' } },
						{ tag: 'device-identity', attrs: {}, content: deviceIdentity },
						{ tag: 'device', attrs: { jid: '6281234567890:12@s.whatsapp.net', lid: '1888:12@lid' } }
					]
				}
			]
		},
		creds: { advSecretKey, signedIdentityKey, signalIdentities: [] }
	}
}

test('pair-success menyetel registered = true (bukan hanya me)', () => {
	const { stanza, creds } = makePairSuccessStanza()
	const { creds: updated } = configureSuccessfulPairing(stanza, creds)

	assert.equal(updated.registered, true, 'tanpa ini creds.json = me tanpa registered → loop pairing ulang')
	assert.equal(updated.me.id, '6281234567890:12@s.whatsapp.net')
	assert.equal(updated.platform, 'android')
	assert.ok(updated.account, 'deviceIdentity ikut tersimpan')
	assert.ok(updated.signalIdentities.length, 'identity LID ikut tersimpan')
})

test('penandaan registered tidak merusak reply pair-device-sign', () => {
	const { stanza, creds } = makePairSuccessStanza()
	const { reply } = configureSuccessfulPairing(stanza, creds)

	assert.equal(reply.attrs.type, 'result')
	assert.equal(reply.attrs.id, 'PAIRING1')
	const sign = reply.content[0]
	assert.equal(sign.tag, 'pair-device-sign')
	// accountSignatureKey harus dilepas dari balasan (isi untuk server saja)
	assert.equal(proto.ADVSignedDeviceIdentity.decode(sign.content[0].content).accountSignatureKey?.length ?? 0, 0)
})

test('stanza tanpa device-identity tetap ditolak', () => {
	const { creds } = makePairSuccessStanza()
	const stanza = {
		attrs: { id: 'PAIRING2' },
		content: [{ tag: 'pair-success', content: [{ tag: 'platform', attrs: { name: 'android' } }] }]
	}

	assert.throws(() => configureSuccessfulPairing(stanza, creds), /Missing device-identity or device/)
})
