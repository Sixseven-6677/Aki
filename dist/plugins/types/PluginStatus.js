"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PluginStatus = void 0;
var PluginStatus;
(function (PluginStatus) {
    PluginStatus["UNLOADED"] = "UNLOADED";
    PluginStatus["LOADING"] = "LOADING";
    PluginStatus["LOADED"] = "LOADED";
    PluginStatus["ENABLING"] = "ENABLING";
    PluginStatus["ENABLED"] = "ENABLED";
    PluginStatus["DISABLING"] = "DISABLING";
    PluginStatus["DISABLED"] = "DISABLED";
    PluginStatus["UNLOADING"] = "UNLOADING";
    PluginStatus["FAILED"] = "FAILED";
})(PluginStatus || (exports.PluginStatus = PluginStatus = {}));
