"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GroupSettingsRepository = void 0;
const group_settings_model_1 = require("../models/group-settings.model");
const LoggerManager_1 = require("../../logger/LoggerManager");
const log = LoggerManager_1.LoggerManager.getLogger("GroupSettingsRepository");
class GroupSettingsRepository {
    async findByThreadId(threadId) {
        try {
            return await group_settings_model_1.GroupSettingsModel.findOne({ threadId }).exec();
        }
        catch (err) {
            throw new Error(`[GroupSettingsRepository.findByThreadId] ${err instanceof Error ? err.message : String(err)}`);
        }
    }
    async upsert(threadId, data) {
        try {
            const doc = await group_settings_model_1.GroupSettingsModel.findOneAndUpdate({ threadId }, {
                $set: { ...data, updatedAt: new Date() },
                $setOnInsert: { threadId },
            }, { upsert: true, returnDocument: "after" }).exec();
            log.debug("GroupSettings upserted.", { threadId });
            return doc;
        }
        catch (err) {
            throw new Error(`[GroupSettingsRepository.upsert] ${err instanceof Error ? err.message : String(err)}`);
        }
    }
    async findAll() {
        try {
            return await group_settings_model_1.GroupSettingsModel.find({}).exec();
        }
        catch (err) {
            throw new Error(`[GroupSettingsRepository.findAll] ${err instanceof Error ? err.message : String(err)}`);
        }
    }
    async getLockdown(threadId) {
        try {
            const doc = await group_settings_model_1.GroupSettingsModel.findOne({ threadId }, { lockdown: 1 }).lean().exec();
            return doc?.lockdown ?? false;
        }
        catch (err) {
            throw new Error(`[GroupSettingsRepository.getLockdown] ${err instanceof Error ? err.message : String(err)}`);
        }
    }
    async setLockdown(threadId, enabled) {
        try {
            await group_settings_model_1.GroupSettingsModel.findOneAndUpdate({ threadId }, {
                $set: { lockdown: enabled, updatedAt: new Date() },
                $setOnInsert: { threadId },
            }, { upsert: true }).exec();
        }
        catch (err) {
            throw new Error(`[GroupSettingsRepository.setLockdown] ${err instanceof Error ? err.message : String(err)}`);
        }
    }
    async getLockedThreadIds() {
        try {
            const docs = await group_settings_model_1.GroupSettingsModel.find({ lockdown: true }, { threadId: 1 }).lean().exec();
            return docs.map((d) => d.threadId);
        }
        catch (err) {
            throw new Error(`[GroupSettingsRepository.getLockedThreadIds] ${err instanceof Error ? err.message : String(err)}`);
        }
    }
}
exports.GroupSettingsRepository = GroupSettingsRepository;
