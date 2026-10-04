// Offline suite for pin/unpin message: the modern content builder, the
// generateWAMessageContent pin branch, and the messages.pin.update event.
import assert from 'node:assert/strict'
import EventEmitter from 'node:events'
import { test } from 'node:test'
import { proto } from '../WAProto/index.js'
import { generateWAMessage, generateWAMessageContent, getContentType } from '../lib/Utils/messages.js'
import { makePinMessage, prepareModernMessageContent } from '../lib/Utils/modern-messages.js'
import processMessage from '../lib/Utils/process-message.js'

const { PIN_FOR_ALL, UNPIN_FOR_ALL } = proto.Message.PinInChatMessage.Type

const pinnedKey = {
	remoteJid: '6281234567890@s.whatsapp.net',
	fromMe: false,
	id: 'PINNEDMSGID'
}

const logger = { debug() {}, info() {}, warn() {}, error() {} }

const processPinMessage = async (message, { storedMessages = [] } = {}) => {
	const ev = new EventEmitter()
	const events = { pin: [], update: [] }
	ev.on('messages.pin.update', data => events.pin.push(...data))
	ev.on('messages.update', data => events.update.push(...data))
	await processMessage(message, {
		shouldProcessHistoryMsg: false,
		placeholderResendCache: undefined,
		ev,
		creds: { me: { id: '6289999999999@s.whatsapp.net' }, accountSettings: {} },
		signalRepository: { lidMapping: {} },
		keyStore: {},
		logger,
		options: {},
		getMessage: async key => storedMessages.find(msg => msg.key.id === key.id)
	})
	return events
}

test('pin builder defaults to PIN_FOR_ALL with a bounded duration', () => {
	const { pinInChatMessage, messageContextInfo } = makePinMessage({ key: pinnedKey })

	assert.equal(pinInChatMessage.key.id, pinnedKey.id)
	assert.equal(pinInChatMessage.type, PIN_FOR_ALL)
	assert.ok(messageContextInfo.messageAddOnDurationInSecs > 0)
})

test('pin builder accepts the enum name and a custom duration', () => {
	const { pinInChatMessage, messageContextInfo } = makePinMessage({
		key: pinnedKey,
		type: 'PIN_FOR_ALL',
		duration: 604800
	})

	assert.equal(pinInChatMessage.type, PIN_FOR_ALL)
	assert.equal(messageContextInfo.messageAddOnDurationInSecs, 604800)
})

test('unpin builder clears the duration', () => {
	const { pinInChatMessage, messageContextInfo } = makePinMessage({
		key: pinnedKey,
		type: 'unpin_for_all'
	})

	assert.equal(pinInChatMessage.type, UNPIN_FOR_ALL)
	assert.equal(messageContextInfo.messageAddOnDurationInSecs, 0)
})

test('pin builder rejects a key without an id', () => {
	assert.throws(() => makePinMessage({ key: { remoteJid: pinnedKey.remoteJid } }), /pin\.key\.id is required/)
})

test('pin builder rejects an unknown type', () => {
	assert.throws(
		() => makePinMessage({ key: pinnedKey, type: 'SOMETHING_ELSE' }),
		/pin\.type must be PIN_FOR_ALL or UNPIN_FOR_ALL/
	)
})

test('pin builder rejects a non-positive duration', () => {
	assert.throws(() => makePinMessage({ key: pinnedKey, duration: 0 }), /pin\.duration must be a positive number/)
})

test('legacy bare-key pin content still builds a pinInChatMessage', async () => {
	const content = await generateWAMessageContent(
		{ pin: pinnedKey, type: PIN_FOR_ALL, time: 604800 },
		{}
	)

	assert.equal(getContentType(content), 'pinInChatMessage')
	assert.equal(content.pinInChatMessage.type, PIN_FOR_ALL)
	assert.equal(content.pinInChatMessage.key.id, pinnedKey.id)
	assert.equal(content.messageContextInfo.messageAddOnDurationInSecs, 604800)
})

test('pin content survives a proto encode/decode round trip', () => {
	const encoded = proto.Message.encode({
		pinInChatMessage: { key: pinnedKey, type: PIN_FOR_ALL, senderTimestampMs: 1 },
		messageContextInfo: { messageAddOnDurationInSecs: 86400 }
	}).finish()
	const decoded = proto.Message.decode(encoded)

	assert.equal(getContentType(decoded), 'pinInChatMessage')
	assert.equal(decoded.pinInChatMessage.key.id, pinnedKey.id)
	assert.equal(decoded.pinInChatMessage.type, PIN_FOR_ALL)
	assert.equal(decoded.messageContextInfo.messageAddOnDurationInSecs, 86400)
})

test('an incoming pin emits messages.pin.update and marks the stored message', async () => {
	const events = await processPinMessage(
		{
			key: { remoteJid: pinnedKey.remoteJid, fromMe: true, id: 'PINMSG' },
			messageTimestamp: 1,
			message: {
				pinInChatMessage: {
					key: pinnedKey,
					type: PIN_FOR_ALL,
					senderTimestampMs: 1234
				},
				messageContextInfo: { messageAddOnDurationInSecs: 86400 }
			}
		},
		{ storedMessages: [{ key: pinnedKey, message: { conversation: 'hi' } }] }
	)

	assert.equal(events.pin.length, 1)
	assert.equal(events.pin[0].pinned, true)
	assert.equal(events.pin[0].pinnedKey.id, pinnedKey.id)
	assert.equal(events.pin[0].key.id, 'PINMSG')
	assert.equal(events.pin[0].durationInSecs, 86400)
	assert.equal(events.pin[0].senderTimestampMs, 1234)

	assert.deepEqual(events.update, [
		{ key: pinnedKey, update: { pinned: true, pinDurationInSecs: 86400 } }
	])
})

test('an incoming unpin clears the pinned flag', async () => {
	const events = await processPinMessage(
		{
			key: { remoteJid: pinnedKey.remoteJid, fromMe: false, id: 'UNPINMSG' },
			messageTimestamp: 1,
			message: {
				pinInChatMessage: {
					key: pinnedKey,
					type: UNPIN_FOR_ALL,
					senderTimestampMs: 5678
				},
				messageContextInfo: { messageAddOnDurationInSecs: 0 }
			}
		},
		{ storedMessages: [{ key: pinnedKey, message: { conversation: 'hi' } }] }
	)

	assert.equal(events.pin[0].pinned, false)
	assert.equal(events.pin[0].durationInSecs, 0)
	assert.deepEqual(events.update, [{ key: pinnedKey, update: { pinned: false } }])
})

test('a pin for an unknown message still emits the pin event', async () => {
	const events = await processPinMessage({
		key: { remoteJid: pinnedKey.remoteJid, fromMe: false, id: 'PINMSG2' },
		messageTimestamp: 1,
		message: {
			pinInChatMessage: {
				key: pinnedKey,
				type: PIN_FOR_ALL,
				senderTimestampMs: 1
			}
		}
	})

	assert.equal(events.pin.length, 1)
	assert.equal(events.update.length, 0)
})

test('prepareModernMessageContent keeps the legacy bare-key shape working', () => {
	const prepared = prepareModernMessageContent({ pin: pinnedKey, time: 604800 })

	assert.equal(prepared.raw, true)
	assert.equal(prepared.pinInChatMessage.type, PIN_FOR_ALL)
	assert.equal(prepared.messageContextInfo.messageAddOnDurationInSecs, 604800)
})

test('every pin shape survives sendMessage content preparation', async () => {
	const options = { userJid: '6289999999999@s.whatsapp.net', messageId: 'PINMSG' }
	const shapes = [
		{ content: { pin: { key: pinnedKey } }, type: PIN_FOR_ALL, duration: 86400 },
		{ content: { pin: { key: pinnedKey, type: 'UNPIN_FOR_ALL' } }, type: UNPIN_FOR_ALL, duration: 0 },
		{ content: { pin: pinnedKey, time: 604800 }, type: PIN_FOR_ALL, duration: 604800 },
		{ content: { pin: { key: pinnedKey, duration: 2592000 } }, type: PIN_FOR_ALL, duration: 2592000 }
	]

	for (const shape of shapes) {
		const message = await generateWAMessage(
			pinnedKey.remoteJid,
			prepareModernMessageContent(shape.content),
			options
		)
		// relayMessage keys the "edit" stanza attribute off pinInChatMessage being present.
		assert.ok(message.message.pinInChatMessage, 'pinInChatMessage survives preparation')
		assert.equal(message.message.pinInChatMessage.type, shape.type)
		assert.equal(
			message.message.messageContextInfo.messageAddOnDurationInSecs,
			shape.duration
		)
		assert.equal(message.message.pinInChatMessage.key.id, pinnedKey.id)
	}
})