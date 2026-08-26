"use strict";
// Public API type definitions for node-firebird.
//
// These types were previously maintained by hand in lib/index.d.ts
// (originally contributed by Marco Warm <https://github.com/MarcusCalidus>).
// They now live in the TypeScript source tree and are compiled into the
// published declaration files.
Object.defineProperty(exports, "__esModule", { value: true });
exports.ShutdownKind = exports.ShutdownMode = void 0;
var ShutdownMode;
(function (ShutdownMode) {
    ShutdownMode[ShutdownMode["NORMAL"] = 0] = "NORMAL";
    ShutdownMode[ShutdownMode["MULTI"] = 1] = "MULTI";
    ShutdownMode[ShutdownMode["SINGLE"] = 2] = "SINGLE";
    ShutdownMode[ShutdownMode["FULL"] = 3] = "FULL";
})(ShutdownMode || (exports.ShutdownMode = ShutdownMode = {}));
var ShutdownKind;
(function (ShutdownKind) {
    ShutdownKind[ShutdownKind["FORCED"] = 0] = "FORCED";
    ShutdownKind[ShutdownKind["DENY_TRANSACTION"] = 1] = "DENY_TRANSACTION";
    ShutdownKind[ShutdownKind["DENY_ATTACHMENT"] = 2] = "DENY_ATTACHMENT";
})(ShutdownKind || (exports.ShutdownKind = ShutdownKind = {}));
