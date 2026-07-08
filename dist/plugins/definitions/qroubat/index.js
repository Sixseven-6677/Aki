"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * QroubatPlugin — stub
 *
 * The "قروبات" command and all group-control commands were moved to
 * ControlPlugin (src/plugins/definitions/control/index.ts).
 * This stub keeps the plugin directory discoverable without registering
 * any commands (which would conflict with ControlPlugin's registrations).
 */
class QroubatPlugin {
    manifest = {
        name: "qroubat",
        version: "2.0.0",
        description: "Stub — group commands moved to ControlPlugin.",
        author: "Sixseven-6677",
    };
    async onLoad(ctx) {
        ctx.logger.info("QroubatPlugin (stub): all commands handled by ControlPlugin.");
    }
    async onEnable() { }
    async onDisable() { }
    async onUnload() { }
}
exports.default = new QroubatPlugin();
