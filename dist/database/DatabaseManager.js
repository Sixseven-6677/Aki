"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DatabaseManager = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const env_1 = require("../config/env");
const LoggerManager_1 = require("../logger/LoggerManager");
const log = LoggerManager_1.LoggerManager.getLogger("DatabaseManager");
const CONNECT_OPTIONS = {
    serverSelectionTimeoutMS: 15_000,
    socketTimeoutMS: 45_000,
    connectTimeoutMS: 15_000,
    maxPoolSize: 10,
    minPoolSize: 2,
    retryWrites: true,
    w: "majority",
};
class DatabaseManager {
    name = "database";
    connection = null;
    async initialize() {
        const uri = env_1.config.database.mongoUri;
        if (!uri) {
            log.warn("MONGODB_URI is not set — skipping database connection. " +
                "Features requiring DB will be unavailable.");
            return;
        }
        log.info("Connecting to MongoDB...");
        await this.connectWithRetry(uri, 1);
    }
    async destroy() {
        if (this.connection) {
            await mongoose_1.default.disconnect();
            this.connection = null;
            log.info("Disconnected from MongoDB.");
        }
    }
    isConnected() {
        return mongoose_1.default.connection.readyState === 1;
    }
    getConnection() {
        if (!this.connection || !this.isConnected()) {
            throw new Error("Not connected to MongoDB.");
        }
        return this.connection;
    }
    // ── Private ─────────────────────────────────────────────────────────────────
    setupEventListeners() {
        if (!this.connection)
            return;
        this.connection.on("disconnected", () => {
            log.warn("MongoDB disconnected. Mongoose will attempt automatic reconnection. " +
                "If this persists, check your MongoDB host and network.");
        });
        this.connection.on("reconnected", () => {
            log.info("MongoDB reconnected successfully.");
        });
        this.connection.on("error", (err) => {
            log.error("MongoDB connection error.", err);
        });
        this.connection.on("close", () => {
            log.warn("MongoDB connection closed.");
        });
    }
    async connectWithRetry(uri, attempt) {
        const maxAttempts = 3;
        try {
            await mongoose_1.default.connect(uri, CONNECT_OPTIONS);
            this.connection = mongoose_1.default.connection;
            this.setupEventListeners();
            log.info("Connected to MongoDB.", {
                host: mongoose_1.default.connection.host,
                name: mongoose_1.default.connection.name,
                readyState: mongoose_1.default.connection.readyState,
            });
        }
        catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            if (attempt < maxAttempts) {
                const delay = attempt * 5_000;
                log.warn(`MongoDB connection failed (attempt ${attempt}/${maxAttempts}) — ` +
                    `retrying in ${delay / 1_000}s.`, { error: msg });
                await new Promise((r) => setTimeout(r, delay));
                return this.connectWithRetry(uri, attempt + 1);
            }
            log.error(`MongoDB connection failed after ${maxAttempts} attempts. ` +
                "Bot will run without database persistence.", { error: msg });
        }
    }
}
exports.DatabaseManager = DatabaseManager;
