# Notices

Laminaris Baileys is an independently maintained fork/distribution in the Baileys ecosystem.

The upstream copyright and permission notice is preserved in `LICENSE`. Portions of the codebase derive from or were influenced by upstream Baileys work and subsequent forks.

## Credits

- **Baileys** — Rajeh Taher / WhiskeySockets. The multi-device protocol implementation, `WAProto` definitions, signal handling, and WABinary layer originate here. MIT licensed; the original copyright notice is retained in `LICENSE`.
- **Elaina Baileys** — rexxhayanasi. The immediate fork base for this distribution, including its packaging, compatibility work, and the maintenance line preceding this project. Copyright (c) 2026 rexxhayanasi is retained in `LICENSE`.
- **Nixel (NIXCODE MessageBuilder)** — `lib/MessageBuilder/`. An independent advanced interactive-message builder integrated into the library. It carries its own copyright notice and watermark, which are preserved verbatim in the source file. Copyright (c) 2026 Nixel.
- **ShellTear** — the VoIP calling stack in `lib/Voip/` derives from work in `baileys-caller`, which first showed the WhatsApp Web VoIP WASM engine could be driven from Node. The WhatsApp Web resources it drives are vendored unmodified under `lib/assets/wasm/`.

## Additions in this distribution

Beyond the fork base, this distribution adds:

- `lib/Pairing/` — a pairing-code controller with rate-limit backoff and a linked-device identity resolver with automatic rotation, ported from pairing work in the WhatsBibz project.
- Patches to `lib/Socket/socket.js` so `creds.me` is only persisted after the server acknowledges a pairing request, and to `lib/Utils/validate-connection.js` for the Windows sub-platform value.
- Renamed auth-store adapter (`use-document-db-auth-state`) and package identity.

## Legal

Do not remove third-party copyright or attribution notices required by their respective licenses. This project is not affiliated with, endorsed by, or supported by WhatsApp or Meta.
