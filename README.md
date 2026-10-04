# @laminaris/baileys

WhatsApp Web multi-device library for Node.js — an ESM-focused Baileys distribution with an integrated MessageBuilder, interactive/native-flow helpers, a VoIP calling stack, and a pairing controller with automatic device-identity rotation.

> [!IMPORTANT]
> `@laminaris/baileys` is an unofficial WhatsApp Web API library and is not affiliated with, authorized, maintained, sponsored, or endorsed by WhatsApp or Meta.
>
> Use this project responsibly and comply with WhatsApp's Terms of Service and applicable laws. Run bots on a spare number.

## Requirements

- **Node.js ≥ 20**
- ESM only (`"type": "module"` or dynamic `import()`)
- Optional peers, each only needed if you use the matching feature: `sharp`, `@napi-rs/image`, `jimp` (media), `link-preview-js` (link previews), `better-sqlite3` / `mongodb` / `pg` / `mysql2` / `ioredis` / `@nekodb/client` (auth stores), `audio-decode` + `fluent-ffmpeg` (audio), `sharp` (thumbnails)

## Install

```bash
npm install @laminaris/baileys
```

## Quick start

```js
import makeWASocket, {
	useMultiFileAuthState,
	makeCacheableSignalKeyStore,
	fetchLatestWaWebVersion,
	DisconnectReason
} from '@laminaris/baileys'

const { state, saveCreds } = await useMultiFileAuthState('auth')
const { version, isLatest } = await fetchLatestWaWebVersion()

const sock = makeWASocket({
	// Only trust the fetched version when it really came from web.whatsapp.com.
	// Otherwise the built-in version is used — a stale one gets rejected (408).
	...(isLatest && { version }),
	auth: { creds: state.creds, keys: makeCacheableSignalKeyStore(state.keys) },
	browser: ['Mac OS', 'Chrome', '15.6.1'],
	markOnlineOnConnect: true
})

sock.ev.on('creds.update', saveCreds)
sock.ev.on('connection.update', ({ connection, lastDisconnect }) => {
	if (connection === 'close') {
		const code = lastDisconnect?.error?.output?.statusCode
		console.log('closed:', code, DisconnectReason[code] ?? 'unknown')
	}
})
```

## Pairing codes

`requestPairingCode` waits for the server to acknowledge the request, so a rejected pairing surfaces as an error rather than a silent success.

```js
const code = await sock.requestPairingCode('6281234567890')
console.log('Enter this code on your phone:', code)
```

Pass a second argument for a custom 8-character code (`A-Z0-9`). If the server refuses it, fall back to a random one once:

```js
await sock.requestPairingCode('6281234567890', 'MYCODE12')
```

**Do not call this before the connection is live.** In particular, do not call it on `connection === 'connecting'` — that event fires before the WebSocket opens and before the handshake completes, which makes the pairing stanza the first thing on the connection and gets the socket terminated. Request a code when a QR arrives, or once the connection is `open`.

### Pairing controller

`createPairingController` wraps that in production discipline: one in-flight request, a long refresh interval so a code being typed on the phone does not expire mid-attempt, exponential backoff on 428/429, and automatic stop once `registered`.

```js
import { createPairingController } from '@laminaris/baileys'

const pairing = createPairingController({
	sock,
	phone: '6281234567890',
	pairingCode: 'MYCODE12',       // optional
	onCode: (code, meta) => {
		console.log('pairing code:', code, meta)  // meta: { custom, fallback }
	},
	logger: console
})

sock.ev.on('connection.update', ({ qr, connection }) => {
	if (qr && !sock.authState.creds.registered) pairing.start()
})
sock.ev.on('creds.update', () => {
	if (sock.authState.creds.registered) pairing.stop()
})
```

## Device identity

The `browser = [os, browser, version]` tuple decides the name shown under *Linked devices*. Part of it is validated by WhatsApp at pairing time, which is why the raw tuple is not always safe to send.

| Field | Server rule |
| --- | --- |
| `browser[0]` (device name) | Free text |
| `companion_platform_display` | Allow-listed — an unknown value is a `400`, and the phone never gets a notification |
| `WebInfo.webSubPlatform` | `DARWIN` / `APP_STORE` are closed (`428` before the QR) |

Helpers derive a display that is always accepted:

```js
import { derivePairingDisplay, isPairingDisplayAccepted } from '@laminaris/baileys'

derivePairingDisplay(['Arch Linux', 'Chrome', '6.12'])   // 'Chrome (Linux)'
derivePairingDisplay(['Mac OS', 'Desktop', '15.6.1'])     // 'Chrome (Mac OS)'
isPairingDisplayAccepted('Chrome (Arch Linux)')           // false
```

`resolveDeviceIdentity` picks the most stable profile and rotates to the next only when the server rejects one, persisting the winner to `<authDir>/identity.json` so the device name stays the same across restarts.

```js
import { resolveDeviceIdentity, createIdentityRotator, isIdentityRejection } from '@laminaris/baileys'

const resolved = resolveDeviceIdentity({ authDir: 'auth' })
const rotator = createIdentityRotator({
	candidates: resolved.candidates,
	authDir: 'auth',
	mode: resolved.mode,
	logger: console
})

sock.ev.on('connection.update', ({ connection, lastDisconnect, qr }) => {
	if (connection !== 'close') return
	const status = lastDisconnect?.error?.output?.statusCode
	// 428 before any QR, or 405 → the identity was refused
	if (!sock.authState.creds.registered && isIdentityRejection({ status, sawQr: !!qr })) {
		rotator.next(`${status} before QR`)
	}
})
```

Rotation happens only while unregistered. Once linked, the identity is locked — changing it would look like a different device to the phone.

To pin the display explicitly, pass `companionPlatformDisplay`; only set it to a value you know is on the allow-list.

## Auth stores

```js
import {
	useMultiFileAuthState,
	useSingleFileAuthState,
	useSqliteAuthState,
	useMongoAuthState,
	usePostgresAuthState,
	useMysqlAuthState,
	useRedisAuthState,
	useDocumentDbAuthState
} from '@laminaris/baileys'
```

Each returns `{ state, saveCreds }` (and most also `clearAuth`). `useDocumentDbAuthState` works with any driver exposing `db.collection(name).helper()`.

## Connection lifecycle

```
connect ──► QR / pairing code ──► 515 restartRequired ──► reconnect ──► open
   │
   │  428 before QR / 405  (identity refused)   → rotate identity, reconnect
   │  400 at pairing       (identity refused)   → rotate identity, reconnect
   └─ other close codes    → backoff, bounded, then give up
```

`515` after a successful pairing is normal — the server asks the client to restart.

## Interactive messages

`MessageBuilder` (NIXCODE) and the extras module cover buttons, carousels, native flows, and AI-rich payloads.

```js
import { Button, ButtonV2, Carousel, AIRich, MB, a2uiText } from '@laminaris/baileys'

await new Button(sock)
	.text('Pick one')
	.addButton('Yes', 'yes')
	.addButton('No', 'no')
	.send(jid)
```

## Pinning messages

`sock.pinMessage(jid, key)` pins a message for everyone in the chat; `sock.unpinMessage(jid, key)` releases it. Only admins can pin in a group.

```js
await sock.pinMessage(jid, quoted.key)
await sock.unpinMessage(jid, quoted.key)
```

Pins expire, so pass `duration` (seconds) to keep one longer than the default of 86400:

```js
await sock.pinMessage(jid, quoted.key, { duration: 604800 })
```

Incoming pins and unpins arrive on `messages.pin.update`, and the affected message is marked in the store:

```js
sock.ev.on('messages.pin.update', ([{ pinnedKey, pinned, durationInSecs }]) => {
	console.log(pinned ? `pinned for ${durationInSecs}s` : 'unpinned', pinnedKey.id)
})
```

The same thing through `sendMessage`, if you would rather stay in the content API:

```js
await sock.sendMessage(jid, { pin: { key: quoted.key, type: 'PIN_FOR_ALL', duration: 604800 } })
await sock.sendMessage(jid, { pin: { key: quoted.key, type: 'UNPIN_FOR_ALL' } })
```

## Low-level API

`makeWASocket` exposes the full surface: `sendMessage`, `groupMetadata`, `query`, `logout`, `end`, `ev`, plus the `Proto` definitions re-exported from `WAProto`.

## TypeScript

Declarations ship with the package, including a complete `WAProto/index.d.ts`.

## Project structure

```
lib/
  Pairing/      controller.js, identity.js
  Socket/       socket.js, engine.js, messages-send.js, messages-recv.js, groups.js, newsletter.js
  Utils/        auth stores, crypto, media, pairing helpers
  MessageBuilder/  interactive message builders
  Voip/         calling stack + vendored WASM under assets/
  Defaults/ Signal/ Store/ Types/ WABinary/ WAM/ WAUSync/
WAProto/        protobuf definitions (index.js + index.d.ts)
scripts/        check-exports.js
test/           offline suites
```

## Testing

```bash
bun test ./test/                        # offline suites, no network
bun scripts/check-exports.js            # list the public export surface
bun scripts/check-exports.js <ref.mjs>  # diff against a reference build
```

## Credits

- **Baileys** — Rajeh Taher / WhiskeySockets
- **Elaina Baileys** — rexxhayanasi (fork base)
- **NIXCODE MessageBuilder** — Nixel
- **`baileys-caller`** — ShellTear (VoIP)

See [`NOTICE.md`](./NOTICE.md) and [`LICENSE`](./LICENSE).

## License

MIT.
