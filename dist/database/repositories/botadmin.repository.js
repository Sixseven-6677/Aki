"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BotAdminRepository = void 0;
const botadmin_model_1 = require("../models/botadmin.model");
const LoggerManager_1 = require("../../logger/LoggerManager");
const log = LoggerManager_1.LoggerManager.getLogger("BotAdminRepository");
class BotAdminRepository {
    async findAll() {
        try {
            const docs = await botadmin_model_1.BotAdminModel.find({}, { fbId: 1 }).lean().exec();
            return docs.map((d) => d.fbId);
        }
        catch (err) {
            throw new Error(`[BotAdminRepository.findAll] ${err instanceof Error ? err.message : String(err)}`);
        }
    }
    async add(fbId, addedBy, note) {
        try {
            await botadmin_model_1.BotAdminModel.findOneAndUpdate({ fbId }, { $setOnInsert: { fbId, addedBy, addedAt: new Date(), ...(note ? { note } : {}) } }, { upsert: true }).exec();
            log.debug("BotAdmin added.", { fbId, addedBy });
        }
        catch (err) {
            throw new Error(`[BotAdminRepository.add] ${err instanceof Error ? err.message : String(err)}`);
        }
    }
    async remove(fbId) {
        try {
            const result = await botadmin_model_1.BotAdminModel.deleteOne({ fbId }).exec();
            const deleted = result.deletedCount > 0;
            if (deleted)
                log.debug("BotAdmin removed.", { fbId });
            return deleted;
        }
        catch (err) {
            throw new Error(`[BotAdminRepository.remove] ${err instanceof Error ? err.message : String(err)}`);
        }
    }
    async exists(fbId) {
        try {
            const result = await botadmin_model_1.BotAdminModel.exists({ fbId }).exec();
            return result !== null;
        }
        catch (err) {
            throw new Error(`[BotAdminRepository.exists] ${err instanceof Error ? err.message : String(err)}`);
        }
    }
    async count() {
        try {
            return await botadmin_model_1.BotAdminModel.countDocuments().exec();
        }
        catch (err) {
            throw new Error(`[BotAdminRepository.count] ${err instanceof Error ? err.message : String(err)}`);
        }
    }
}
exports.BotAdminRepository = BotAdminRepository;
