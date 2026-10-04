/* Laminaris Baileys maintained distribution. Upstream notices and license are preserved in LICENSE and NOTICE.md. */
import { proto } from '../../WAProto/index.js';
import { DEFAULT_CONNECTION_CONFIG } from '../Defaults/index.js';
import { prepareModernMessageContent } from '../Utils/modern-messages.js';
import { makeNewsletterStatusFetcher, makeNewsletterStatusUpdatesFetcher, makeNewsletterStatusReactionSender, makeNewsletterStatusRevokeSender, makeNewsletterStatusSender } from '../Utils/newsletter-status.js';
import { bindVoiceRecognition } from '../Utils/voice-recognition.js';
import { makeCommunitiesSocket } from './communities.js';

const makeWASocket = (config) => {
    const newConfig = {
        ...DEFAULT_CONNECTION_CONFIG,
        ...config
    };
    const sock = makeCommunitiesSocket(newConfig);
    bindVoiceRecognition(sock, newConfig);
    const sendMessage = sock.sendMessage.bind(sock);
    sock.sendMessage = (jid, content, options = {}) => sendMessage(jid, prepareModernMessageContent(content), options);
    sock.pinMessage = async (jid, key, options = {}) => {
        const { duration, time, ...sendOptions } = options;
        return sock.sendMessage(jid, {
            pin: {
                key,
                type: proto.Message.PinInChatMessage.Type.PIN_FOR_ALL,
                duration: duration ?? time
            }
        }, sendOptions);
    };
    sock.unpinMessage = async (jid, key, options = {}) => sock.sendMessage(jid, {
        pin: {
            key,
            type: proto.Message.PinInChatMessage.Type.UNPIN_FOR_ALL
        }
    }, options);
    sock.sendNewsletterStatus = makeNewsletterStatusSender(sock, newConfig);
    sock.sendNewsletterStatusReaction = makeNewsletterStatusReactionSender(sock);
    sock.revokeNewsletterStatus = makeNewsletterStatusRevokeSender(sock);
    sock.getNewsletterStatuses = makeNewsletterStatusFetcher(sock);
    sock.getNewsletterStatusUpdates = makeNewsletterStatusUpdatesFetcher(sock);
    return sock;
};
export default makeWASocket;
