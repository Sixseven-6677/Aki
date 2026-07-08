"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CommandStatsRepository = void 0;
const command_stats_model_1 = require("../models/command-stats.model");
const LoggerManager_1 = require("../../logger/LoggerManager");
const log = LoggerManager_1.LoggerManager.getLogger("CommandStatsRepository");
class CommandStatsRepository {
    async increment(commandName, threadId) {
        try {
            const filter = threadId
                ? { commandName, threadId }
                : { commandName, threadId: { $exists: false } };
            await command_stats_model_1.CommandStatsModel.findOneAndUpdate(filter, {
                $inc: { count: 1 },
                $set: { lastUsedAt: new Date() },
                $setOnInsert: { commandName, ...(threadId ? { threadId } : {}) },
            }, { upsert: true }).exec();
        }
        catch (err) {
            log.warn("CommandStats increment failed.", {
                commandName,
                error: err instanceof Error ? err.message : String(err),
            });
        }
    }
    async getTopCommands(limit = 10) {
        try {
            const docs = await command_stats_model_1.CommandStatsModel.aggregate([
                { $group: { _id: "$commandName", count: { $sum: "$count" }, lastUsedAt: { $max: "$lastUsedAt" } } },
                { $sort: { count: -1 } },
                { $limit: limit },
            ]).exec();
            return docs.map((d) => ({ commandName: d._id, count: d.count, lastUsedAt: d.lastUsedAt }));
        }
        catch (err) {
            throw new Error(`[CommandStatsRepository.getTopCommands] ${err instanceof Error ? err.message : String(err)}`);
        }
    }
    async getByThread(threadId, limit = 10) {
        try {
            const docs = await command_stats_model_1.CommandStatsModel
                .find({ threadId }, { commandName: 1, count: 1, lastUsedAt: 1 })
                .sort({ count: -1 })
                .limit(limit)
                .lean()
                .exec();
            return docs.map((d) => ({
                commandName: d.commandName,
                count: d.count,
                lastUsedAt: d.lastUsedAt,
            }));
        }
        catch (err) {
            throw new Error(`[CommandStatsRepository.getByThread] ${err instanceof Error ? err.message : String(err)}`);
        }
    }
}
exports.CommandStatsRepository = CommandStatsRepository;
