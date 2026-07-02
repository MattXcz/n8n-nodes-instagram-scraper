"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Utils = exports.InstagramClient = exports.InstagramCredentials = exports.Instagram = void 0;
const Instagram_node_1 = require("./nodes/Instagram.node");
Object.defineProperty(exports, "Instagram", { enumerable: true, get: function () { return Instagram_node_1.Instagram; } });
const InstagramCredentials_1 = require("./nodes/InstagramCredentials");
Object.defineProperty(exports, "InstagramCredentials", { enumerable: true, get: function () { return InstagramCredentials_1.InstagramCredentials; } });
var client_1 = require("./lib/client");
Object.defineProperty(exports, "InstagramClient", { enumerable: true, get: function () { return client_1.InstagramClient; } });
__exportStar(require("./lib/types"), exports);
var utils_1 = require("./lib/utils");
Object.defineProperty(exports, "Utils", { enumerable: true, get: function () { return utils_1.Utils; } });
//# sourceMappingURL=index.js.map