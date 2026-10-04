// Regresi untuk dua patch di lib/Socket/socket.js dan
// lib/Utils/validate-connection.js.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { proto } from '../WAProto/index.js'
import { generateLoginNode } from '../lib/Utils/validate-connection.js'

const baseConfig = {
	version: [2, 3000, 1029],
	countryCode: 'US',
	syncFullHistory: true
}

// generateLoginNode returns a plain object built with fromObject, so read
// webInfo directly rather than round-tripping it through the decoder.
const subPlatformFor = (browser) =>
	generateLoginNode('6281234567890@s.whatsapp.net', { ...baseConfig, browser })
		.webInfo.webSubPlatform

test('Mac OS Desktop tidak lagi mengiklankan DARWIN', () => {
	const { WEB_BROWSER, DARWIN, APP_STORE } = proto.ClientPayload.WebInfo.WebSubPlatform
	const actual = subPlatformFor(['Mac OS', 'Desktop', '15.6.1'])

	assert.equal(actual, WEB_BROWSER, 'DARWIN ditutup server → 428 sebelum QR')
	assert.notEqual(actual, DARWIN)
	assert.notEqual(actual, APP_STORE)
})

test('Windows Desktop memakai WIN_HYBRID, bukan WIN32', () => {
	const { WIN_HYBRID, WIN32 } = proto.ClientPayload.WebInfo.WebSubPlatform
	const actual = subPlatformFor(['Windows', 'Desktop', '10.0.22631'])

	assert.equal(actual, WIN_HYBRID, 'server menolak WIN32')
	assert.notEqual(actual, WIN32)
})

test('browser non-Desktop tetap WEB_BROWSER walau syncFullHistory', () => {
	const { WEB_BROWSER } = proto.ClientPayload.WebInfo.WebSubPlatform
	assert.equal(subPlatformFor(['Mac OS', 'Chrome', '15.6.1']), WEB_BROWSER)
	assert.equal(subPlatformFor(['Ubuntu', 'Chrome', '6.12.44']), WEB_BROWSER)
})
