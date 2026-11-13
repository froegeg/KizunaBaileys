// Regresi untuk pemilihan host upload di lib/Utils/messages-media.js.
// Host yang tidak mengiklankan <upload/> (mis. media-sin6-1) adalah
// download-only dan tidak boleh dicoba sebelum host yang bisa upload.
import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { getWAUploadToServer } from '../lib/Utils/messages-media.js'

const logger = { debug() {}, warn() {}, child() { return this } }

const host = (hostname, canUpload) => ({
	hostname,
	maxContentLengthBytes: 1,
	...(canUpload === undefined ? {} : { canUpload })
})

const mediaConn = (hosts) => ({
	hosts,
	auth: 'test-auth',
	ttl: 300,
	fetchDate: new Date()
})

const makeUpload = (hosts) =>
	getWAUploadToServer(
		{ customUploadHosts: [], fetchAgent: undefined, logger, options: {} },
		async () => mediaConn(hosts)
	)

async function withMockedFetch(t, onRequest) {
	const dir = await mkdtemp(join(tmpdir(), 'laminaris-upload-'))
	const file = join(dir, 'media.bin')
	await writeFile(file, 'test-media-payload')

	const originalFetch = globalThis.fetch
	const originalDeno = globalThis.Deno
	// Paksa jalur fetch (bukan https module) supaya request bisa dimock.
	globalThis.Deno = {}
	globalThis.fetch = async (url) => {
		const hostname = new URL(url).hostname
		const result = onRequest(hostname)
		if (result instanceof Error) {
			throw result
		}
		return new Response(JSON.stringify({
			url: `https://${hostname}/uploaded`,
			direct_path: '/uploaded',
			meta_hmac: 'hmac',
			...result
		}), { status: 200, headers: { 'content-type': 'application/json' } })
	}

	t.after(async () => {
		globalThis.fetch = originalFetch
		if (originalDeno === undefined) {
			delete globalThis.Deno
		} else {
			globalThis.Deno = originalDeno
		}
		await rm(dir, { recursive: true, force: true })
	})

	return file
}

const uploadMedia = (file, hosts) =>
	makeUpload(hosts)(file, { mediaType: 'image', fileEncSha256B64: 'dGVzdA==' })

test('host dengan <upload/> dipakai lebih dulu', async (t) => {
	const tried = []
	const file = await withMockedFetch(t, (hostname) => {
		tried.push(hostname)
		return {}
	})

	const result = await uploadMedia(file, [
		host('media-sin6-1.cdn.whatsapp.net', false),
		host('media.fjog2-1.fna.whatsapp.net', true)
	])

	assert.deepEqual(tried, ['media.fjog2-1.fna.whatsapp.net'])
	assert.equal(new URL(result.mediaUrl).hostname, 'media.fjog2-1.fna.whatsapp.net')
})

test('urutan lama dipertahankan bila server tidak mengirim flag', async (t) => {
	const tried = []
	const file = await withMockedFetch(t, (hostname) => {
		tried.push(hostname)
		return hostname === 'media-sin6-1.cdn.whatsapp.net'
			? new TypeError('ECONNREFUSED')
			: {}
	})

	const result = await uploadMedia(file, [
		host('media-sin6-1.cdn.whatsapp.net'),
		host('media.fjog2-1.fna.whatsapp.net')
	])

	assert.deepEqual(tried, [
		'media-sin6-1.cdn.whatsapp.net',
		'media.fjog2-1.fna.whatsapp.net'
	])
	assert.equal(new URL(result.mediaUrl).hostname, 'media.fjog2-1.fna.whatsapp.net')
})

test('host download-only tetap dicoba sebagai fallback terakhir', async (t) => {
	const tried = []
	const file = await withMockedFetch(t, (hostname) => {
		tried.push(hostname)
		return hostname === 'media.fjog2-1.fna.whatsapp.net'
			? new TypeError('ECONNREFUSED')
			: {}
	})

	const result = await uploadMedia(file, [
		host('media-sin6-1.cdn.whatsapp.net', false),
		host('media.fjog2-1.fna.whatsapp.net', true)
	])

	assert.deepEqual(tried, [
		'media.fjog2-1.fna.whatsapp.net',
		'media-sin6-1.cdn.whatsapp.net'
	])
	assert.equal(new URL(result.mediaUrl).hostname, 'media-sin6-1.cdn.whatsapp.net')
})
