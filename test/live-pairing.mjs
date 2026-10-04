// Live pairing smoke test against real WhatsApp servers.
// Requests a pairing code for a fictional Ofcom number and reports whether the
// server acknowledged it. No phone involved; nothing gets linked.
//
//   bun test/live-pairing.mjs
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import makeWASocket, {
	useMultiFileAuthState,
	makeCacheableSignalKeyStore,
	fetchLatestWaWebVersion,
	derivePairingDisplay
} from '../lib/index.js'

const PHONE = process.env.LIVE_TEST_PHONE || '207183875010'
const authDir = mkdtempSync(join(tmpdir(), 'laminaris-live-'))

const log = (...a) => console.log('  ', ...a)
// Minimal pino-shaped sink: the socket calls child() and level methods.
const boom = {
	level: 'silent',
	trace() {}, debug() {}, info() {}, warn() {}, error() {}, fatal() {},
	child() { return boom },
	silent() {}
}

console.log('\nlive pairing smoke test')
console.log('  authDir:', authDir)

const { state, saveCreds } = await useMultiFileAuthState(authDir)
const { version, isLatest, error } = await fetchLatestWaWebVersion()

if (!isLatest) {
	console.error('  could not resolve the live WA Web version:', error?.message)
	console.error('  aborting — a stale version would make this test meaningless')
	process.exit(1)
}
log('WA Web version:', version.join('.'))

const browser = ['Mac OS', 'Chrome', '15.6.1']
console.log('  identity:', browser.join(' / '), '-> display:', derivePairingDisplay(browser))

const sock = makeWASocket({
	version,
	auth: { creds: state.creds, keys: makeCacheableSignalKeyStore(state.keys, boom) },
	logger: boom,
	browser,
	markOnlineOnConnect: true
})

sock.ev.on('creds.update', saveCreds)

let pairingDone = false
let requested = false

async function requestOnce(trigger) {
	if (requested) return
	requested = true
	log(`requesting pairing code (trigger: ${trigger})`)
	try {
		const code = await sock.requestPairingCode(PHONE)
		pairingDone = true
		console.log(`\n  RESULT: server acknowledged. code=${code}`)
		await checkCreds()
		cleanup()
		process.exit(0)
	} catch (err) {
		const waCode = typeof err?.data === 'number' ? err.data : (err?.output?.statusCode ?? 'n/a')
		console.log(`\n  RESULT: rejected. waCode=${waCode} message=${err?.message}`)
		await checkCreds()
		cleanup()
		process.exit(1)
	}
}

sock.ev.on('connection.update', async ({ connection, qr, lastDisconnect }) => {
	// An unregistered socket never reports 'open', so the QR is the reliable
	// signal that the handshake completed and it is safe to request a code.
	if (qr) {
		log('QR received — handshake healthy')
		void requestOnce('qr')
	}
	if (connection === 'open') void requestOnce('open')
	if (connection === 'close') {
		const status = lastDisconnect?.error?.output?.statusCode ?? 'n/a'
		console.log(`\n  RESULT: connection closed before pairing. statusCode=${status}`)
		await checkCreds()
		cleanup()
		process.exit(1)
	}
})

// saveCreds is async (file lock + write), so let it settle before asserting.
const checkCreds = async () => {
	await new Promise((r) => setTimeout(r, 300))
	const file = join(authDir, 'creds.json')
	if (!existsSync(file)) return log('creds.json: absent')
	const creds = JSON.parse(readFileSync(file, 'utf-8'))
	const hasMe = Boolean(creds.me?.id)
	log(`creds.json — registered=${creds.registered} me=${hasMe ? 'present' : 'absent'}`)

	if (pairingDone) {
		// Acknowledged: `me` must be on disk or the pairing can never finish.
		if (!hasMe) {
			console.log('  PATCH CHECK: FAIL — server acknowledged but creds.me was never persisted')
			process.exitCode = 1
		} else {
			log('patch check: creds.me persisted after the acknowledgement')
		}
		return
	}

	// Rejected or closed: `me` must NOT be left behind.
	if (hasMe) {
		console.log('  PATCH CHECK: FAIL — creds.me was persisted for a request the server never accepted')
		process.exitCode = 1
	} else {
		log('patch check: creds.me not left behind on a rejected request')
	}
}

function cleanup() {
	try { sock.ev.removeAllListeners('connection.update'); sock.end() } catch {}
	try { rmSync(authDir, { recursive: true, force: true }) } catch {}
}

setTimeout(() => {
	console.log('\n  RESULT: timed out after 60s with no answer')
	cleanup()
	process.exit(1)
}, 60_000).unref()
