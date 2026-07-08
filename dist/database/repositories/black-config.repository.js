"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BlackConfigRepository = void 0;
const black_config_model_1 = require("../models/black-config.model");
const LoggerManager_1 = require("../../logger/LoggerManager");
const log = LoggerManager_1.LoggerManager.getLogger("BlackConfigRepository");
class BlackConfigRepository {
    async findAll() {
        try {
            return await black_config_model_1.BlackConfigModel.find({}).exec();
        }
        catch (err) {
            throw new Error(`[BlackConfigRepository.findAll] ${err instanceof Error ? err.message : String(err)}`);
        }
    }
    async upsert(threadId, data) {
        try {
            await black_config_model_1.BlackConfigModel.findOneAndUpdate({ threadId }, {
                $set: { ...data, updatedAt: new Date() },
                $setOnInsert: { threadId },
            }, { upsert: true }).exec();
            log.debug("BlackConfig upserted.", { threadId });
        }
        catch (err) {
            throw new Error(`[BlackConfigRepository.upsert] ${err instanceof Error ? err.message : String(err)}`);
        }
    }
    async findByThreadId(threadId) {
        try {
            return await black_config_model_1.BlackConfigModel.findOne({ threadId }).exec();
        }
        catch (err) {
            throw new Error(`[BlackConfigRepository.findByThreadId] ${err instanceof Error ? err.message : String(err)}`);
        }
    }
    async setActive(threadId, active) {
        try {
            await black_config_model_1.BlackConfigModel.findOneAndUpdate({ threadId }, {
                $set: { active, updatedAt: new Date() },
                $setOnInsert: { threadId },
            }, { upsert: true }).exec();
        }
        catch (err) {
            throw new Error(`[BlackConfigRepository.setActive] ${err instanceof Error ? err.message : String(err)}`);
        }
    }
}
exports.BlackConfigRepository = BlackConfigRepository;
