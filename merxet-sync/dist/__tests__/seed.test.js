"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = __importDefault(require("node:test"));
const strict_1 = __importDefault(require("node:assert/strict"));
const seed_js_1 = require("../seed.js");
(0, node_test_1.default)('seedStringToBytes32 pads with zeros and bytes32ToSeedString strips trailing zeros', () => {
    const seed = 'hello';
    const b32 = (0, seed_js_1.seedStringToBytes32)(seed);
    strict_1.default.equal(b32.length, 66);
    strict_1.default.equal((0, seed_js_1.bytes32ToSeedString)(b32), seed);
});
(0, node_test_1.default)('seedStringToBytes32 truncates to 32 bytes', () => {
    const seed = 'a'.repeat(40);
    const b32 = (0, seed_js_1.seedStringToBytes32)(seed);
    strict_1.default.equal((0, seed_js_1.bytes32ToSeedString)(b32), 'a'.repeat(32));
});
//# sourceMappingURL=seed.test.js.map