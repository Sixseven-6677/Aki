"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Bot = exports.BotState = void 0;
const ISystem_1 = require("./interfaces/ISystem");
const InitializationManager_1 = require("./InitializationManager");
const SystemLoader_1 = require("./SystemLoader");
const startup_1 = require("./lifecycle/startup");
const shutdown_1 = require("./lifecycle/shutdown");
const LoggerManager_1 = require("../logger/LoggerManager");
const log = LoggerManager_1.LoggerManager.getLogger("Bot");
var BotState;
(function (BotState) {
    BotState["IDLE"] = "IDLE";
    BotState["STARTING"] = "STARTING";
    BotState["RUNNING"] = "RUNNING";
    BotState["STOPPING"] = "STOPPING";
    BotState["STOPPED"] = "STOPPED";
})(BotState || (exports.BotState = BotState = {}));
class Bot {
    state = BotState.IDLE;
    loader;
    constructor() {
        const manager = new InitializationManager_1.InitializationManager();
        this.loader = new SystemLoader_1.SystemLoader(manager);
    }
    register(system) {
        if (this.state !== BotState.IDLE) {
            throw new Error("Cannot register systems after bot has started.");
        }
        this.loader.register(system);
        return this;
    }
    getSystem(name) {
        return this.loader.get(name);
    }
    async start() {
        if (this.state !== BotState.IDLE) {
            throw new Error(`Cannot start bot from state: ${this.state}`);
        }
        this.state = BotState.STARTING;
        log.info("Starting...");
        const systems = this.loader.getResolved();
        const steps = (0, startup_1.buildStartupSteps)(systems, (name) => {
            this.loader.setStatus(name, ISystem_1.SystemStatus.INITIALIZING);
            log.info(`Initializing system: ${name}`);
        });
        try {
            await (0, startup_1.runStartupSteps)(steps);
            for (const system of systems) {
                this.loader.setStatus(system.name, ISystem_1.SystemStatus.READY);
            }
            this.state = BotState.RUNNING;
            log.info("All systems ready.", this.loader.summary());
        }
        catch (err) {
            this.state = BotState.STOPPED;
            throw new Error(`Startup failed: ${err instanceof Error ? err.message : String(err)}`);
        }
        this.registerShutdownSignals();
    }
    async stop() {
        if (this.state !== BotState.RUNNING)
            return;
        this.state = BotState.STOPPING;
        log.info("Shutting down...");
        const systems = this.loader.getResolved();
        const steps = (0, shutdown_1.buildShutdownSteps)(systems, (name) => {
            this.loader.setStatus(name, ISystem_1.SystemStatus.DESTROYING);
            log.info(`Destroying system: ${name}`);
        });
        try {
            await (0, shutdown_1.runShutdownSteps)(steps);
            for (const system of systems) {
                this.loader.setStatus(system.name, ISystem_1.SystemStatus.DESTROYED);
            }
        }
        catch (err) {
            log.error("Error during shutdown.", err);
        }
        finally {
            this.state = BotState.STOPPED;
            log.info("Stopped.");
            LoggerManager_1.LoggerManager.close();
        }
    }
    getState() {
        return this.state;
    }
    registerShutdownSignals() {
        const handler = async (signal) => {
            log.info(`Received ${signal}.`);
            await this.stop();
            process.exit(0);
        };
        process.once("SIGINT", () => handler("SIGINT"));
        process.once("SIGTERM", () => handler("SIGTERM"));
    }
}
exports.Bot = Bot;
