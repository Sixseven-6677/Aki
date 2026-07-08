"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BotConfigRepository = void 0;
const bot_config_model_1 = require("../models/bot-config.model");
const LoggerManager_1 = require("../../logger/LoggerManager");
const log = LoggerManager_1.LoggerManager.getLogger("BotConfigRepository");
class BotConfigRepository {
    async get(key) {
        try {
            const doc = await bot_config_model_1.BotConfigModel.findOne({ key }).lean().exec();
            return doc?.value ?? null;
        }
        catch (err) {
            throw new Error(`[BotConfigRepository.get] ${err instanceof Error ? err.message : String(err)}`);
        }
    }
    async set(key, value) {
        try {
            await bot_config_model_1.BotConfigModel.findOneAndUpdate({ key }, {
                $set: { value, updatedAt: new Date() },
                $setOnInsert: { key },
            }, { upsert: true }).exec();
            log.debug("BotConfig set.", { key, value });
        }
        catch (err) {
            throw new Error(`[BotConfigRepository.set] ${err instanceof Error ? err.message : String(err)}`);
        }
    }
    async getAll() {
        try {
            const docs = await bot_config_model_1.BotConfigModel.find({}).lean().exec();
            const result = {};
            for (const doc of docs)
                result[doc.key] = doc.value;
            return result;
        }
        catch (err) {
            throw new Error(`[BotConfigRepository.getAll] ${err instanceof Error ? err.message : String(err)}`);
        }
    }
}
exports.BotConfigRepository = BotConfigRepository;
