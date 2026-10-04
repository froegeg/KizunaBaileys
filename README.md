<div align="center">
  <img src="./assets/banner.png" alt="Laminaris Baileys — WhatsApp Web multi-device library" width="820">
  <h1>Laminaris Baileys</h1>
  <p><strong>WhatsApp Web multi-device library untuk Node.js</strong><br>
  Distribusi Baileys berbasis ESM dengan MessageBuilder, pesan interaktif, native flow, VoIP, dan pairing controller dengan rotasi identitas otomatis.</p>
  <p>
    <a href="https://www.npmjs.com/package/@laminaris/baileys"><img src="https://img.shields.io/npm/v/@laminaris/baileys?style=flat-square&label=npm" alt="npm version"></a>
    <a href="./LICENSE"><img src="https://img.shields.io/npm/l/@laminaris/baileys?style=flat-square&label=license&color=2ea44f" alt="license"></a>
    <img src="https://img.shields.io/badge/node-%E2%89%A5%2020-5FA04E?style=flat-square&label=node" alt="node version">
    <img src="https://img.shields.io/badge/module-ESM-c8ff00?style=flat-square&label=module" alt="esm">
    <img src="https://img.shields.io/badge/types-declarations%20included-3178C6?style=flat-square&label=typescript" alt="typescript">
  </p>
</div>

---

> [!IMPORTANT]
> **`@laminaris/baileys` adalah pustaka WhatsApp Web API tidak resmi.** Proyek ini tidak berafiliasi dengan, tidak diizinkan, tidak dikelola, tidak disponsori, dan tidak diakui oleh WhatsApp maupun Meta.
>
> Gunakan secara bertanggung jawab dan patuhi [Ketentuan Layanan WhatsApp](https://www.whatsapp.com/legal/terms-of-service) serta hukum yang berlaku. **Jalankan bot pada nomor cadangan.**

---

## 📑 Daftar Isi

| # | Bagian | Isi |
| :--: | --- | --- |
| 1 | [Instalasi](#1-instalasi) | Node, paket, peer dependency opsional |
| 2 | [Mulai Cepat](#2-mulai-cepat) | Socket, auth, event koneksi |
| 3 | [Fitur](#3-fitur) | Ringkasan seluruh kemampuan |
| 4 | [Pairing Code](#4-pairing-code) | Kode pairing + controller produksi |
| 5 | [Device Identity](#5-device-identity) | Validasi display & rotasi identitas |
| 6 | [Auth Store](#6-auth-store) | Penyimpanan kredensial |
| 7 | [Pesan Interaktif](#7-pesan-interaktif) | Tombol, carousel, native flow, AI-rich |
| 8 | [Pin Pesan](#8-pin-pesan) | Menempel & melepas pin |
| 9 | [Newsletter](#9-newsletter) | Channel & query admin |
| 10 | [VoIP](#10-voip) | Stack panggilan |
| 11 | [Lifecycle Koneksi](#11-lifecycle-koneksi) | Kode close & artinya |
| 12 | [API Dasar](#12-api-dasar) | Permukaan API lengkap |
| 13 | [Struktur Proyek](#13-struktur-proyek) | Peta direktori |
| 14 | [Pengembangan](#14-pengembangan) | Test & pemeriksaan export |
| 15 | [Kredit dan Lisensi](#15-kredit-dan-lisensi) | Atribusi |

---

## 1. Instalasi

**Persyaratan:** Node.js **≥ 20** dan ESM saja (`"type": "module"` atau `import()` dinamis).

```bash
npm install @laminaris/baileys
```

<details>
<summary><b>Peer dependency opsional</b> — hanya perlu bila fitur terkait dipakai</summary>

| Kebutuhan | Paket |
| --- | --- |
| Media (gambar, video, dokumen) | `sharp`, `@napi-rs/image`, atau `jimp` |
| Thumbnail | `sharp` |
| Link preview | `link-preview-js` |
| Audio (decode) | `audio-decode` + `fluent-ffmpeg` |
| Auth store | `better-sqlite3`, `mongodb`, `pg`, `mysql2`, `ioredis`, `@nekodb/client` |

Semua bersifat opsional. Paket inti tetap terpasang tanpa semuanya.

</details>

---

## 2. Mulai Cepat

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
	// Hanya percayai versi yang benar-benar berasal dari web.whatsapp.com.
	// Selain itu versi bawaan dipakai — versi basi ditolak server (408).
	...(isLatest && { version }),
	auth: { creds: state.creds, keys: makeCacheableSignalKeyStore(state.keys) },
	browser: ['Mac OS', 'Chrome', '15.6.1'],
	markOnlineOnConnect: true
})

sock.ev.on('creds.update', saveCreds)

sock.ev.on('connection.update', ({ connection, lastDisconnect }) => {
	if (connection === 'close') {
		const code = lastDisconnect?.error?.output?.statusCode
		console.log('terputus:', code, DisconnectReason[code] ?? 'tidak dikenal')
	}
})
```

<details>
<summary><b>Menangani pesan masuk</b></summary>

```js
sock.ev.on('messages.upsert', ({ messages }) => {
	for (const msg of messages) {
		console.log(msg.pushName, msg.message)
	}
})
```

</details>

---

## 3. Fitur

| Area | Kemampuan |
| --- | --- |
| **Protokol** | Multi-device penuh, WABinary, `WAProto` lengkap, sinkronisasi app-state |
| **Pairing** | Kode pairing, controller dengan backoff, rotasi identitas linked-device |
| **Pesan** | Teks, media, reaction, edit, hapus, poll, kuis (`QUIZ`), scheduled call, ephemeral, view-once |
| **Interaktif** | `MessageBuilder` (NIXCODE): tombol, carousel, native flow, AI-rich, komentar |
| **Pin** | `pinMessage` / `unpinMessage` + event `messages.pin.update` |
| **Newsletter** | 50+ method: buat, kelola admin, direktori, insights, polling, pin channel |
| **Group** | Metadata, peserta, admin, moderasi, komunitas, ephemeral |
| **VoIP** | Stack panggilan penuh dengan engine WASM bawaan |
| **Auth** | File tunggal/bermulti, SQLite, Mongo, Postgres, MySQL, Redis, dokumen DB |
| **Tooling** | TypeScript declarations, export check, suite test offline |

---

## 4. Pairing Code

`requestPairingCode` **menunggu konfirmasi server**, sehingga pairing yang ditolak akan muncul sebagai error — bukan dianggap berhasil secara diam-diam.

```js
const code = await sock.requestPairingCode('6281234567890')
console.log('Masukkan kode ini di HP:', code)
```

Kode kustom sepanjang 8 karakter (`A-Z0-9`) bisa diteruskan sebagai argumen kedua. Bila server menolak, library otomatis mencoba sekali dengan kode acak:

```js
await sock.requestPairingCode('6281234567890', 'MYCODE12')
```

> [!WARNING]
> **Jangan panggil sebelum koneksi hidup.** Jangan pula pada `connection === 'connecting'` — event itu terbit sebelum WebSocket terbuka dan sebelum handshake selesai, sehingga stanza pairing menjadi pesan pertama di koneksi dan socket langsung di-terminate. Minta kode saat QR muncul, atau setelah koneksi `open`.

### Pairing Controller

`createPairingController` membungkus itu dengan disiplin produksi: satu request in-flight, interval refresh panjang agar kode yang sedang diketik tidak kedaluwarsa di tengah jalan, exponential backoff untuk `428`/`429`, dan berhenti otomatis setelah `registered`.

```js
import { createPairingController } from '@laminaris/baileys'

const pairing = createPairingController({
	sock,
	phone: '6281234567890',
	pairingCode: 'MYCODE12',        // opsional
	onCode: (code, meta) => {
		console.log('kode pairing:', code, meta)   // meta: { custom, fallback }
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

---

## 5. Device Identity

Tuple `browser = [os, browser, version]` menentukan nama yang tampil di *Linked devices*. Sebagian isinya divalidasi server saat pairing — itu sebabnya tuple mentah tidak selalu aman dikirim.

| Field | Aturan server |
| --- | --- |
| `browser[0]` (nama perangkat) | Bebas |
| `companion_platform_display` | **Allow-list** — nilai asing menghasilkan `400`, dan HP tidak pernah menerima notifikasi |
| `WebInfo.webSubPlatform` | `DARWIN` / `APP_STORE` ditutup (`428` sebelum QR) |

Helper menurunkan display yang selalu diterima:

```js
import { derivePairingDisplay, isPairingDisplayAccepted } from '@laminaris/baileys'

derivePairingDisplay(['Arch Linux', 'Chrome', '6.12'])   // 'Chrome (Linux)'
derivePairingDisplay(['Mac OS', 'Desktop', '15.6.1'])     // 'Chrome (Mac OS)'
isPairingDisplayAccepted('Chrome (Arch Linux)')           // false
```

### Rotasi Identitas

`resolveDeviceIdentity` memilih profil paling stabil dan berpindah ke profil berikutnya **hanya** saat server menolak, lalu menyimpan pemenang ke `<authDir>/identity.json` agar nama perangkat konsisten antar restart.

```js
import {
	resolveDeviceIdentity,
	createIdentityRotator,
	isIdentityRejection
} from '@laminaris/baileys'

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
	// 428 sebelum QR, atau 405 → identitas ditolak
	if (!sock.authState.creds.registered && isIdentityRejection({ status, sawQr: !!qr })) {
		rotator.next(`${status} sebelum QR`)
	}
})
```

> [!NOTE]
> Rotasi hanya terjadi saat belum terdaftar. Setelah perangkat tertaut, identitas terkunci — mengubahnya akan terlihat seperti perangkat berbeda bagi HP.

Untuk mengunci display secara eksplisit, kirim `companionPlatformDisplay`; **hanya** isi dengan nilai yang Anda yakin ada di allow-list.

---

## 6. Auth Store

```js
import {
	useMultiFileAuthState,
	useSingleFileAuthState,
	useSqliteAuthState,
	useMongoAuthState,
	usePostgresAuthState,
	useMySQLAuthState,
	useRedisAuthState,
	useDocumentDbAuthState
} from '@laminaris/baileys'
```

Setiap store mengembalikan `{ state, saveCreds }` (sebagian besar juga `clearAuth`). `useDocumentDbAuthState` bekerja dengan driver apa pun yang menyediakan `db.collection(name).helper()`.

---

## 7. Pesan Interaktif

`MessageBuilder` (NIXCODE) dan modul extras mencakup tombol, carousel, native flow, dan payload AI-rich.

```js
import { Button, ButtonV2, Carousel, AIRich } from '@laminaris/baileys'

await new Button(sock)
	.setBody('Pilih satu')
	.addButton('Ya', 'yes')
	.addButton('Tidak', 'no')
	.send(jid)
```

Teks pesan diatur lewat `BaseBuilder`: `setTitle()`, `setSubtitle()`, `setBody()`, `setFooter()`.

<details>
<summary><b>Contoh lain</b></summary>

```js
// Tombol salin konten
await new Button(sock)
	.setBody('Salin kode promo')
	.addCopy('Salin', 'promo')
	.send(jid)

// Carousel kartu
await new Carousel(sock)
	.addCard({ title: 'Judul', body: 'Isi kartu', footer: 'Catatan' })
	.send(jid)

// Native flow / AI-rich
await new AIRich(sock)
	.addText('Halo dari AI')
	.send(jid)
```

Metode lain pada `Button`: `setImage()`, `setVideo()`, `setDocument()`, `makeRow()`, `makeSection()`, `addSelection()`, `addReply()`, `addCall()`, `addReminder()`, `addUrl()`, `addCopy()`, `addLocation()`, `addAddress()`.

</details>

---

## 8. Pin Pesan

`sock.pinMessage(jid, key)` menempelkan pin untuk semua anggota chat; `sock.unpinMessage(jid, key)` melepasnya. Di grup, **hanya admin** yang bisa pin.

```js
await sock.pinMessage(jid, quoted.key)
await sock.unpinMessage(jid, quoted.key)
```

Pin punya masa berlaku. Berikan `duration` (detik) bila ingin memanjang dari default **86400**:

```js
await sock.pinMessage(jid, quoted.key, { duration: 604800 })   // 7 hari
```

### Event

Pin dan unpin yang masuk tiba di `messages.pin.update`, dan pesan terkait ditandai di store:

```js
sock.ev.on('messages.pin.update', ([{ pinnedKey, pinned, durationInSecs }]) => {
	console.log(pinned ? `dipin ${durationInSecs} detik` : 'pin dilepas', pinnedKey.id)
})
```

### Lewat API Konten

Alternatifnya tetap memakai `sendMessage`. Isi `pin` adalah **key** pesan secara langsung, sementara `type` dan `duration` berada di level atas:

```js
await sock.sendMessage(jid, {
	pin: quoted.key,
	type: 'PIN_FOR_ALL',
	duration: 604800
})

await sock.sendMessage(jid, {
	pin: quoted.key,
	type: 'UNPIN_FOR_ALL'
})
```

| Field | Tipe | Default |
| --- | --- | --- |
| `pin` | key pesan | wajib |
| `type` | `PIN_FOR_ALL` \| `UNPIN_FOR_ALL` | `PIN_FOR_ALL` |
| `duration` (atau `time`) | detik | `86400`, dipaksa `0` saat unpin |

> [!NOTE]
> Field wire berstatus **Offline** untuk proto dan **Derived** untuk atribut stanza. Lihat [`EXPERIMENTAL.md`](./EXPERIMENTAL.md#pinning-messages).

---

## 9. Newsletter

> [!TIP]
> **`type` selalu jadi argumen pertama** pada `newsletterMetadata` dan `newsletterFetchMessages`, dengan nilai `'jid'` atau `'key'`.

```js
// --- Buat channel
await sock.newsletterCreate('my newsletter', 'deskripsi singkat')

// --- Metadata (type dulu!)
const metadata = await sock.newsletterMetadata('jid', '1231111111111@newsletter')

// --- Jumlah admin
const adminCount = await sock.newsletterAdminCount('1231111111111@newsletter')

// --- Follow / unfollow
await sock.newsletterFollow('1231111111111@newsletter')
await sock.newsletterUnfollow('1231111111111@newsletter')

// --- Mute / unmute
await sock.newsletterMute('1231111111111@newsletter')
await sock.newsletterUnmute('1231111111111@newsletter')

// --- Ubah metadata
await sock.newsletterUpdate('1231111111111@newsletter', { name: 'nama baru' })
await sock.newsletterUpdateName('1231111111111@newsletter', 'nama baru')
await sock.newsletterUpdateDescription('1231111111111@newsletter', '📣 Update mingguan')
await sock.newsletterUpdatePicture('1231111111111@newsletter', './logo.jpg')   // path, URL, atau Buffer
await sock.newsletterRemovePicture('1231111111111@newsletter')

// --- Reaksi ke pesan
await sock.newsletterReactMessage('1231111111111@newsletter', '100', '💛')

// --- Ambil pesan
const messages = await sock.newsletterFetchMessages('jid', '1231111111111@newsletter', 50, 0, 0)

// --- Hapus channel
await sock.newsletterDelete('1231111111111@newsletter')
```

**Kelompok method lain:**

| Kelompok | Method |
| --- | --- |
| Admin | `newsletterAdminCapabilities`, `newsletterAdminInfo`, `newsletterChangeOwner`, `newsletterDemote`, `newsletterPendingAdminInvites`, `newsletterInsights`, `newsletterFollowers`, `newsletterSubscribers`, `newsletterSubscribed` |
| Pin channel | `newsletterPinMessages`, `newsletterUnpinMessages` |
| Interaksi | `newsletterPollVoters`, `newsletterReactionSenders`, `newsletterSendPollVote`, `newsletterQuestionResponses`, `newsletterQuestionResponseState`, `newsletterMyAddOns` |
| Direktori | `newsletterDirectoryList`, `newsletterDirectorySearch`, `newsletterDirectoryCategories`, `newsletterRecommended`, `newsletterSimilar` |
| Label & pelaporan | `newsletterLabelAiContent`, `newsletterLabelPaidPartnership`, `newsletterReports`, `newsletterAppealReport`, `newsletterEnforcements`, `newsletterCanPostStatus` |
| Undangan admin | `newsletterCreateAdminInvite`, `newsletterRevokeAdminInvite`, `newsletterAcceptAdminInvite` |

---

## 10. VoIP

Stack panggilan di `lib/Voip/` menangani signaling dan media. Resource WhatsApp Web sudah di-vendor di `lib/Voip/` (`assets/wasm/`), sehingga tidak ada unduhan saat runtime.

```js
import { makeVoipClient, CallState } from '@laminaris/baileys'

const voip = await makeVoipClient(sock)
await voip.connect()

// Panggilan personal
const call = await voip.call('6281234567890')

call.on('ringing', () => console.log('berdering'))
call.on('connected', () => console.log('terhubung'))
call.on('ended', reason => console.log('selesai:', reason))

// Panggilan grup
const groupCall = await voip.callGroup('1234567890@g.us')

call.mute(true)
call.end()
```

<details>
<summary><b>API VoIP</b></summary>

| Objek | Member |
| --- | --- |
| `makeVoipClient(socket, options?)` | Membuat `VoipClient` |
| `VoipClient` | `connect()`, `attach(socket)`, `call()`, `callGroup()`, `joinGroupCall()`, `acceptCall(isMicEnabled?)`, `disconnect()`, `resetCallState()` |
| `ActiveCall` | `end()`, `mute(muted)`, `play()`, `playVideo()`, `enqueue()`, `enqueueVideo()`, `skip()`, `skipVideo()`, `queued()`, `queuedVideo()`, `nowPlaying()`, `isVideo()`, `startScreenShare()`, `stopScreenShare()`, `waitForEnd()` |
| Event `ActiveCall` | `ringing`, `connected`, `ended`, `idle`, `track`, `trackend`, `videotrack`, `videotrackend`, `audio` |
| `CallState` | `Idle`, `Calling`, `PreacceptReceived`, `ReceivedCall`, `AcceptSent`, `AcceptReceived`, `Active`, `ActiveElsewhere`, `Ending` |

</details>

---

## 11. Lifecycle Koneksi

```
connect ──► QR / pairing code ──► 515 restartRequired ──► reconnect ──► open
   │
   │  428 sebelum QR / 405  (identitas ditolak)  → rotasi identitas, reconnect
   │  400 saat pairing       (identitas ditolak)  → rotasi identitas, reconnect
   └─ kode close lainnya    → backoff Terbatas, lalu menyerah
```

| Kode | Artinya |
| --- | --- |
| `401` | Logged out — sesi tidak valid |
| `408` | Versi WhatsApp basi ditolak |
| `411` | Multi-device mismatch |
| `428` | Precondition failed — **`cred`/identitas ditolak sebelum QR** |
| `515` | **Normal** setelah pairing sukses — server meminta restart |

> `515` setelah pairing berhasil adalah hal wajar, bukan error.

---

## 12. API Dasar

`makeWASocket` membuka permukaan API lengkap: `sendMessage`, `pinMessage`, `unpinMessage`, `groupMetadata`, `groupParticipantsUpdate`, `query`, `fetchLatestWaWebVersion`, `logout`, `end`, `ev`, plus definisi `proto` yang di-re-export dari `WAProto`.

---

## 13. Struktur Proyek

```
lib/
├── Pairing/          controller.js, identity.js
├── Socket/           socket.js, engine.js, messages-send.js,
│                     messages-recv.js, groups.js, newsletter.js
├── Utils/            auth store, crypto, media, helper pairing
├── MessageBuilder/   builder pesan interaktif
├── Voip/             stack panggilan + WASM di assets/
├── Defaults/ Signal/ Store/ Types/ WABinary/ WAM/ WAUSync/
WAProto/              definisi protobuf (index.js + index.d.ts)
scripts/              check-exports.js
test/                 suite offline
assets/               banner.png
```

---

## 14. Pengembangan

```bash
bun test ./test/                        # suite offline, tanpa jaringan
bun scripts/check-exports.js            # daftar permukaan export publik
bun scripts/check-exports.js <ref.mjs>  # bandingkan dengan build referensi
```

---

## 15. Kredit dan Lisensi

| Proyek | Kontributor | Kontribusi |
| --- | --- | --- |
| **Baileys** | Rajeh Taher / WhiskeySockets | Implementasi protokol multi-device, `WAProto`, signal handling, WABinary |
| **Elaina Baileys** | rexxhayanasi | Basis fork langsung untuk distribusi ini |
| **NIXCODE MessageBuilder** | Nixel | `lib/MessageBuilder/` |
| **baileys-caller** | ShellTear | Stack VoIP di `lib/Voip/` |

Lihat [`NOTICE.md`](./NOTICE.md) untuk rincian atribusi dan [`LICENSE`](./LICENSE) untuk lisensinya.

<div align="center">
  <sub>Lisensi <strong>MIT</strong> · Bukan produk resmi WhatsApp atau Meta</sub>
</div>