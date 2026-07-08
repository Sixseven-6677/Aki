"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BanModel = void 0;
const mongoose_1 = require("mongoose");
const BanSchema = new mongoose_1.Schema({
    userId: { type: String, required: true, unique: true, index: true },
    reason: { type: String },
    bannedAt: { type: Date, default: () => new Date() },
    expiresAt: { type: Date, default: null },
    bannedBy: { type: String },
}, { versionKey: false });
exports.BanModel = (0, mongoose_1.model)("Ban", BanSchema);
