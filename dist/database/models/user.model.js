"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UserModel = void 0;
const mongoose_1 = require("mongoose");
const UserSchema = new mongoose_1.Schema({
    fbId: {
        type: String,
        required: true,
        unique: true,
        index: true,
    },
    name: {
        type: String,
    },
    role: {
        type: String,
        enum: ["user", "moderator", "admin", "owner"],
        default: "user",
    },
    isBlocked: {
        type: Boolean,
        default: false,
    },
    lastSeenAt: {
        type: Date,
        default: () => new Date(),
    },
    messageCount: {
        type: Number,
        default: 0,
        min: 0,
    },
    preferences: {
        type: mongoose_1.Schema.Types.Mixed,
        default: {},
    },
}, {
    timestamps: true,
    versionKey: false,
});
exports.UserModel = (0, mongoose_1.model)("User", UserSchema);
