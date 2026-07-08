"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CommandStatsModel = void 0;
const mongoose_1 = require("mongoose");
const CommandStatsSchema = new mongoose_1.Schema({
    commandName: { type: String, required: true },
    threadId: { type: String },
    count: { type: Number, default: 0 },
    lastUsedAt: { type: Date, default: () => new Date() },
}, { versionKey: false, timestamps: false });
CommandStatsSchema.index({ commandName: 1, threadId: 1 }, { unique: true, sparse: true });
CommandStatsSchema.index({ count: -1 });
exports.CommandStatsModel = (0, mongoose_1.model)("CommandStats", CommandStatsSchema);
