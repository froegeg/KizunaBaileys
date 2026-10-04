// Export-surface check: compares this package's public exports against a
// reference build to catch accidental removals during a refactor.
//
//   bun scripts/check-exports.js                     # list current exports
//   bun scripts/check-exports.js <referenceIndex.mjs> # diff against reference
//
// The reference is expected to expose a superset minus intentional renames.
import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'

const REMOVED_EXPORTS = new Set([
	// Renamed from useNekoDBAuth → useDocumentDbAuthState
	'useNekoDBAuth'
])

const ADDED_EXPORTS = new Set([
	// lib/Pairing/
	'IDENTITY_PROFILES',
	'IDENTITY_STATE_FILE',
	'PAIRING_ACCEPTED_BROWSERS',
	'PAIRING_ACCEPTED_OS',
	'PAIRING_BACKOFF_MAX_MS',
	'PAIRING_OS_FALLBACK',
	'PAIRING_REFRESH_MS',
	'clearIdentityState',
	'createIdentityRotator',
	'createPairingController',
	'defaultVersionForOs',
	'derivePairingDisplay',
	'describeIdentity',
	'hostOsLabel',
	'hostOsVersion',
	'identityFromEnv',
	'identityStatePath',
	'isCustomPairingError',
	'isIdentityRejection',
	'isPairingDisplayAccepted',
	'isRateLimitError',
	'isRegistrationRejected',
	'isTimeoutError',
	'linuxDistroName',
	'lintIdentity',
	'loadIdentityState',
	'normalizePairingCode',
	'pairingErrorCode',
	'parseBrowserSpec',
	'resolveDeviceIdentity',
	'resolvePairingBrowser',
	'resolvePairingOs',
	'saveIdentityState',
	'useDocumentDbAuthState'
])

const selfPath = resolve(import.meta.dirname, '..', 'lib', 'index.js')
const current = Object.keys(await import(pathToFileURL(selfPath).href)).sort()

const referenceArg = process.argv[2]

if (!referenceArg) {
	console.log(`${current.length} exports`)
	for (const name of current) console.log(name)
	process.exit(0)
}

const reference = Object.keys(await import(pathToFileURL(resolve(referenceArg)).href)).sort()

const refSet = new Set(reference)
const curSet = new Set(current)

const missing = reference.filter(n => !curSet.has(n) && !REMOVED_EXPORTS.has(n))
const renamed = reference.filter(n => !curSet.has(n) && REMOVED_EXPORTS.has(n))
const added = current.filter(n => !refSet.has(n) && !ADDED_EXPORTS.has(n))
const undeclared = current.filter(n => !refSet.has(n) && !ADDED_EXPORTS.has(n))

if (renamed.length) {
	console.log(`\nrenamed (expected): ${renamed.join(', ')}`)
}

if (undeclared.length) {
	console.log(`\nnew but undeclared in ADDED_EXPORTS (${undeclared.length}):`)
	for (const n of undeclared) console.log(`  ${n}`)
}

if (missing.length) {
	console.error(`\nMISSING exports (${missing.length}) — these were removed:`)
	for (const n of missing) console.error(`  ${n}`)
	console.error('\nFailing.')
	process.exit(1)
}

console.log(`\nexport surface OK — ${current.length} current, ${reference.length} reference, 0 missing`)
if (undeclared.length) {
	console.log(`${undeclared.length} new export(s) not declared in ADDED_EXPORTS`)
}
