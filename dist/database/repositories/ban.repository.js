"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BanRepository = void 0;
const ban_model_1 = require("../models/ban.model");
const LoggerManager_1 = require("../../logger/LoggerManager");
const log = LoggerManager_1.LoggerManager.getLogger("BanRepository");
class BanRepository {
    async findActive() {
        try {
            const now = new Date();
            const docs = await ban_model_1.BanModel.find({
                $or: [
                    { expiresAt: null },
                    { expiresAt: { $gt: now } },
                ],
            }).lean().exec();
            return docs.map((d) => ({
                userId: d.userId,
                reason: d.reason,
                bannedAt: d.bannedAt,
                expiresAt: d.expiresAt,
                bannedBy: d.bannedBy,
            }));
        }
        catch (err) {
            throw new Error(`[BanRepository.findActive] ${err instanceof Error ? err.message : String(err)}`);
        }
    }
    async upsert(entry) {
        try {
            await ban_model_1.BanModel.findOneAndUpdate({ userId: entry.userId }, {
                $set: {
                    reason: entry.reason,
                    bannedAt: entry.bannedAt,
                    expiresAt: entry.expiresAt,
                    bannedBy: entry.bannedBy,
                },
                $setOnInsert: { userId: entry.userId },
            }, { upsert: true }).exec();
            log.debug("Ban upserted.", { userId: entry.userId });
        }
        catch (err) {
            throw new Error(`[BanRepository.upsert] ${err instanceof Error ? err.message : String(err)}`);
        }
    }
    async remove(userId) {
        try {
            const result = await ban_model_1.BanModel.deleteOne({ userId }).exec();
            return result.deletedCount > 0;
        }
        catch (err) {
            throw new Error(`[BanRepository.remove] ${err instanceof Error ? err.message : String(err)}`);
        }
    }
    async purgeExpired() {
        try {
            const result = await ban_model_1.BanModel.deleteMany({
                expiresAt: { $ne: null, $lte: new Date() },
            }).exec();
            if (result.deletedCount > 0) {
                log.info(`BanRepository: purged ${result.deletedCount} expired ban(s).`);
            }
            return result.deletedCount;
        }
        catch (err) {
            throw new Error(`[BanRepository.purgeExpired] ${err instanceof Error ? err.message : String(err)}`);
        }
    }
}
exports.BanRepository = BanRepository;
