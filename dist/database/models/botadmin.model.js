"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BotAdminModel = void 0;
const mongoose_1 = require("mongoose");
const BotAdminSchema = new mongoose_1.Schema({
    fbId: { type: String, required: true, unique: true, index: true },
    addedBy: { type: String, required: true },
    addedAt: { type: Date, default: () => new Date() },
    note: { type: String },
}, { versionKey: false });
exports.BotAdminModel = (0, mongoose_1.model)("BotAdmin", BotAdminSchema);
