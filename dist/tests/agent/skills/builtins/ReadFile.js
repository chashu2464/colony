"use strict";
// ── Colony: Built-in Skill — ReadFile ────────────────────
// Allows an agent to read a file from the local filesystem.
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
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.ReadFileSkill = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const Skill_js_1 = require("../Skill.js");
class ReadFileSkill extends Skill_js_1.Skill {
    async execute(params, _context) {
        const filePath = path.resolve(params.path);
        try {
            if (!fs.existsSync(filePath)) {
                return { success: false, error: `File not found: ${filePath}` };
            }
            let content = fs.readFileSync(filePath, 'utf-8');
            const startLine = params.start_line;
            const endLine = params.end_line;
            if (startLine || endLine) {
                const lines = content.split('\n');
                const start = (startLine ?? 1) - 1;
                const end = endLine ?? lines.length;
                content = lines.slice(start, end).join('\n');
            }
            return { success: true, output: content };
        }
        catch (err) {
            return { success: false, error: `Failed to read file: ${err.message}` };
        }
    }
}
exports.ReadFileSkill = ReadFileSkill;
