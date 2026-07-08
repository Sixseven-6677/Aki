"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FacebookEventNormalizer = void 0;
class FacebookEventNormalizer {
    normalize(entry) {
        const base = {
            senderId: entry.sender.id,
            senderFbId: entry.senderFbId,
            pageId: entry.recipient.id,
            timestamp: entry.timestamp,
        };
        if (entry.postback) {
            const event = {
                ...base,
                type: "postback",
                payload: entry.postback.payload,
                title: entry.postback.title,
            };
            return event;
        }
        if (entry.thread_action === "added_participants") {
            const event = {
                ...base,
                type: "member_joined",
                addedByUserId: entry.sender.id,
                members: (entry.added_participants ?? []).map((p) => p.id),
            };
            return event;
        }
        if (entry.thread_action === "removed_participants") {
            const event = {
                ...base,
                type: "member_left",
                members: (entry.removed_participants ?? []).map((p) => p.id),
            };
            return event;
        }
        if (entry.thread_action === "name_changed" && entry.name_change) {
            const event = {
                ...base,
                type: "name_changed",
                threadId: entry.sender.id,
                newName: entry.name_change.newName,
                changedBy: entry.name_change.changedBy,
            };
            return event;
        }
        if (entry.thread_action === "nickname_changed" && entry.nickname_change) {
            const event = {
                ...base,
                type: "nickname_changed",
                threadId: entry.sender.id,
                participantId: entry.nickname_change.participantId,
                newNickname: entry.nickname_change.newNickname,
                changedBy: entry.nickname_change.changedBy,
            };
            return event;
        }
        if (entry.message) {
            const attachments = (entry.message.attachments ?? []).map((att) => ({
                type: att.type,
                url: att.payload.url,
                coordinates: att.payload.coordinates,
            }));
            const event = {
                ...base,
                type: "message",
                messageId: entry.message.mid,
                text: entry.message.text,
                attachments,
            };
            return event;
        }
        const unknown = { ...base, type: "unknown" };
        return unknown;
    }
    normalizeMany(entries) {
        return entries.map((e) => this.normalize(e));
    }
}
exports.FacebookEventNormalizer = FacebookEventNormalizer;
