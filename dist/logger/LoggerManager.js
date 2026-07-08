"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LoggerManager = void 0;
const ILogger_1 = require("./types/ILogger");
const Logger_1 = require("./Logger");
const ConsoleTransport_1 = require("./transports/ConsoleTransport");
const FileTransport_1 = require("./transports/FileTransport");
class LoggerManager {
    static instance = null;
    static configure(options = {}) {
        const { level = ILogger_1.LogLevel.INFO, logDir = "logs", enableFile = true, enableConsole = true, } = options;
        const transports = [];
        if (enableConsole) {
            transports.push(new ConsoleTransport_1.ConsoleTransport());
        }
        if (enableFile) {
            transports.push(new FileTransport_1.FileTransport({ dir: logDir }));
        }
        LoggerManager.instance = new Logger_1.Logger(transports, level);
    }
    static getLogger(context) {
        if (!LoggerManager.instance) {
            LoggerManager.configure();
        }
        return context
            ? LoggerManager.instance.child(context)
            : LoggerManager.instance;
    }
    static close() {
        LoggerManager.instance?.close();
        LoggerManager.instance = null;
    }
}
exports.LoggerManager = LoggerManager;
