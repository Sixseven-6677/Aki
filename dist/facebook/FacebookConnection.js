"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.FacebookConnection = exports.ConnectionState = void 0;
const crypto_1 = __importDefault(require("crypto"));
const env_1 = require("../config/env");
const LoggerManager_1 = require("../logger/LoggerManager");
const log = LoggerManager_1.LoggerManager.getLogger("FacebookConnection");
var ConnectionState;
(function (ConnectionState) {
    ConnectionState["CONNECTED"] = "CONNECTED";
    ConnectionState["DISCONNECTED"] = "DISCONNECTED";
})(ConnectionState || (exports.ConnectionState = ConnectionState = {}));
class FacebookConnection {
    static API_VERSION = "v19.0";
    static BASE_URL = `https://graph.facebook.com/${FacebookConnection.API_VERSION}`;
    state = ConnectionState.DISCONNECTED;
    get accessToken() {
        return env_1.config.facebook.pageAccessToken;
    }
    get verifyToken() {
        return env_1.config.facebook.verifyToken;
    }
    verifyWebhookChallenge(mode, token, challenge) {
        if (mode === "subscribe" && token === this.verifyToken) {
            return String(challenge);
        }
        return null;
    }
    verifySignature(rawBody, signature) {
        try {
            const expected = `sha256=${crypto_1.default
                .createHmac("sha256", env_1.config.facebook.appSecret)
                .update(rawBody)
                .digest("hex")}`;
            return crypto_1.default.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
        }
        catch {
            return false;
        }
    }
    connect() {
        this.state = ConnectionState.CONNECTED;
        log.info("Connected.");
    }
    disconnect() {
        this.state = ConnectionState.DISCONNECTED;
        log.info("Disconnected.");
    }
    getState() {
        return this.state;
    }
    isConnected() {
        return this.state === ConnectionState.CONNECTED;
    }
}
exports.FacebookConnection = FacebookConnection;
