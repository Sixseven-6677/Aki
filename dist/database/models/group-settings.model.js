"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GroupSettingsModel = void 0;
const mongoose_1 = require("mongoose");
const GroupSettingsSchema = new mongoose_1.Schema({
    threadId: { type: String, required: true, unique: true, index: true },
    protectName: { type: Boolean, default: false },
    lockedName: { type: String, default: "" },
    protectNicknames: { type: Boolean, default: false },
    nicknames: { type: mongoose_1.Schema.Types.Mixed, default: {} },
    botNickname: { type: String, default: "" },
    lockdown: { type: Boolean, default: false },
    prefix: { type: String, default: "" },
    updatedAt: { type: Date, default: () => new Date() },
}, { versionKey: false });
exports.GroupSettingsModel = (0, mongoose_1.model)("GroupSettings", GroupSettingsSchema);
