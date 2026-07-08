"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BotConfigModel = void 0;
const mongoose_1 = require("mongoose");
const BotConfigSchema = new mongoose_1.Schema({
    key: { type: String, required: true, unique: true, index: true },
    value: { type: String, required: true },
    updatedAt: { type: Date, default: () => new Date() },
}, { versionKey: false });
exports.BotConfigModel = (0, mongoose_1.model)("BotConfig", BotConfigSchema);
