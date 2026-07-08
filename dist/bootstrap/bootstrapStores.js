"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.bootstrapStores = bootstrapStores;
const banned_middleware_1 = require("../middleware/built-in/banned.middleware");
const lockdown_middleware_1 = require("../middleware/built-in/lockdown.middleware");
const admin_store_1 = require("../middleware/built-in/admin-store");
const user_repository_1 = require("../database/repositories/user.repository");
const UserService_1 = require("../users/UserService");
const LoggerManager_1 = require("../logger/LoggerManager");
const log = LoggerManager_1.LoggerManager.getLogger("Boot.Stores");
function bootstrapStores(adminIds, cache) {
    const banStore = new banned_middleware_1.BanStore();
    const lockdownStore = new lockdown_middleware_1.LockdownStore();
    const adminStore = new admin_store_1.AdminStore(adminIds);
    log.info("Stores: AdminStore ready.", { adminCount: adminStore.size() });
    const userRepo = new user_repository_1.UserRepository();
    const userSvc = new UserService_1.UserService(userRepo, cache.store("users"));
    return { banStore, lockdownStore, adminStore, userSvc };
}
