"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BlackConfigModel = void 0;
const mongoose_1 = require("mongoose");
const BlackConfigSchema = new mongoose_1.Schema({
    threadId: { type: String, required: true, unique: true, index: true },
    message: { type: String, default: "" },
    intervalSec: { type: Number, default: 0 },
    active: { type: Boolean, default: false },
    lastSentAt: { type: Date, default: null },
    updatedAt: { type: Date, default: () => new Date() },
}, { versionKey: false });
exports.BlackConfigModel = (0, mongoose_1.model)("BlackConfig", BlackConfigSchema);
