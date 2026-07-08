"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UserRepository = void 0;
const user_model_1 = require("../models/user.model");
const BaseRepository_1 = require("./BaseRepository");
class UserRepository extends BaseRepository_1.BaseRepository {
    constructor() {
        super(user_model_1.UserModel);
    }
    async findByFbId(fbId) {
        return this.findOne({ fbId });
    }
    /**
     * Atomically upserts the user record on every incoming message.
     *
     * NOTE: rawResult is intentionally NOT used.
     * In Mongoose v9 with upsert:true, rawResult.value returns null for new inserts
     * even with returnDocument:'after' — known Mongoose v8/v9 behaviour.
     * Without rawResult, findOneAndUpdate returns the document directly (always
     * non-null after a successful upsert with returnDocument:'after').
     * isNew is inferred from messageCount === 1 (schema default 0 + first $inc = 1).
     */
    async trackActivity(fbId, name) {
        try {
            const nameSet = name ? { name } : {};
            const doc = await user_model_1.UserModel.findOneAndUpdate({ fbId }, {
                $setOnInsert: { fbId, role: 'user', preferences: {} },
                $set: { lastSeenAt: new Date(), ...nameSet },
                $inc: { messageCount: 1 },
            }, { upsert: true, returnDocument: 'after', runValidators: true }).exec();
            if (!doc) {
                throw new Error(`findOneAndUpdate returned no document for fbId=${fbId}`);
            }
            const isNew = doc.messageCount === 1;
            return { doc, isNew };
        }
        catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            throw new Error(`[UserRepository.trackActivity] ${msg}`);
        }
    }
    async upsertByFbId(fbId, data = {}) {
        try {
            const doc = await user_model_1.UserModel.findOneAndUpdate({ fbId }, {
                $set: { ...data, lastSeenAt: new Date() },
                $setOnInsert: { fbId },
            }, { upsert: true, returnDocument: 'after', runValidators: true }).exec();
            return doc;
        }
        catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            throw new Error(`[UserRepository.upsertByFbId] ${msg}`);
        }
    }
    async setBlocked(fbId, blocked) {
        try {
            const result = await user_model_1.UserModel.updateOne({ fbId }, { $set: { isBlocked: blocked } }).exec();
            return result.modifiedCount > 0;
        }
        catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            throw new Error(`[UserRepository.setBlocked] ${msg}`);
        }
    }
    async isBlocked(fbId) {
        try {
            const result = await user_model_1.UserModel.exists({ fbId, isBlocked: true }).exec();
            return result !== null;
        }
        catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            throw new Error(`[UserRepository.isBlocked] ${msg}`);
        }
    }
    async setPreference(fbId, key, value) {
        try {
            const result = await user_model_1.UserModel.updateOne({ fbId }, { $set: { [`preferences.${key}`]: value } }).exec();
            return result.modifiedCount > 0;
        }
        catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            throw new Error(`[UserRepository.setPreference] ${msg}`);
        }
    }
    async setRole(fbId, role) {
        try {
            const result = await user_model_1.UserModel.updateOne({ fbId }, { $set: { role } }).exec();
            return result.modifiedCount > 0;
        }
        catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            throw new Error(`[UserRepository.setRole] ${msg}`);
        }
    }
}
exports.UserRepository = UserRepository;
