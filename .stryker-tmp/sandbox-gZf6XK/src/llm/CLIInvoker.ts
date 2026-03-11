// @ts-nocheck
// ── Colony: CLI Invoker ──────────────────────────────────
// TypeScript refactor of invoke.js — unified LLM CLI adapter.
// Supports Claude, Gemini, and CodeX CLIs via spawn.
function stryNS_9fa48() {
  var g = typeof globalThis === 'object' && globalThis && globalThis.Math === Math && globalThis || new Function("return this")();
  var ns = g.__stryker__ || (g.__stryker__ = {});
  if (ns.activeMutant === undefined && g.process && g.process.env && g.process.env.__STRYKER_ACTIVE_MUTANT__) {
    ns.activeMutant = g.process.env.__STRYKER_ACTIVE_MUTANT__;
  }
  function retrieveNS() {
    return ns;
  }
  stryNS_9fa48 = retrieveNS;
  return retrieveNS();
}
stryNS_9fa48();
function stryCov_9fa48() {
  var ns = stryNS_9fa48();
  var cov = ns.mutantCoverage || (ns.mutantCoverage = {
    static: {},
    perTest: {}
  });
  function cover() {
    var c = cov.static;
    if (ns.currentTestId) {
      c = cov.perTest[ns.currentTestId] = cov.perTest[ns.currentTestId] || {};
    }
    var a = arguments;
    for (var i = 0; i < a.length; i++) {
      c[a[i]] = (c[a[i]] || 0) + 1;
    }
  }
  stryCov_9fa48 = cover;
  cover.apply(null, arguments);
}
function stryMutAct_9fa48(id) {
  var ns = stryNS_9fa48();
  function isActive(id) {
    if (ns.activeMutant === id) {
      if (ns.hitCount !== void 0 && ++ns.hitCount > ns.hitLimit) {
        throw new Error('Stryker: Hit count limit reached (' + ns.hitCount + ')');
      }
      return true;
    }
    return false;
  }
  stryMutAct_9fa48 = isActive;
  return isActive(id);
}
import { spawn, execSync } from 'child_process';
import { createInterface } from 'readline';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as crypto from 'crypto';
import { Logger } from '../utils/Logger.js';
import type { SupportedCLI, InvokeOptions, InvokeResult, ToolUseEvent } from '../types.js';
const log = new Logger(stryMutAct_9fa48("2615") ? "" : (stryCov_9fa48("2615"), 'CLIInvoker'));

// ── Utilities for Attachments ─────────────────────────────

/**
 * Saves a base64 image data to a temporary file.
 */
function saveTempImage(base64Data: string, index: number): string {
  if (stryMutAct_9fa48("2616")) {
    {}
  } else {
    stryCov_9fa48("2616");
    const tempDir = path.join(os.tmpdir(), stryMutAct_9fa48("2617") ? "" : (stryCov_9fa48("2617"), 'colony-attachments'));
    if (stryMutAct_9fa48("2620") ? false : stryMutAct_9fa48("2619") ? true : stryMutAct_9fa48("2618") ? fs.existsSync(tempDir) : (stryCov_9fa48("2618", "2619", "2620"), !fs.existsSync(tempDir))) {
      if (stryMutAct_9fa48("2621")) {
        {}
      } else {
        stryCov_9fa48("2621");
        fs.mkdirSync(tempDir, stryMutAct_9fa48("2622") ? {} : (stryCov_9fa48("2622"), {
          recursive: stryMutAct_9fa48("2623") ? false : (stryCov_9fa48("2623"), true)
        }));
      }
    }

    // Extract MIME type and data
    // Format is usually: data:image/png;base64,iVBORw...
    const matches = base64Data.match(stryMutAct_9fa48("2628") ? /^data:image\/(\w+);base64,(.)$/ : stryMutAct_9fa48("2627") ? /^data:image\/(\W+);base64,(.+)$/ : stryMutAct_9fa48("2626") ? /^data:image\/(\w);base64,(.+)$/ : stryMutAct_9fa48("2625") ? /^data:image\/(\w+);base64,(.+)/ : stryMutAct_9fa48("2624") ? /data:image\/(\w+);base64,(.+)$/ : (stryCov_9fa48("2624", "2625", "2626", "2627", "2628"), /^data:image\/(\w+);base64,(.+)$/));
    if (stryMutAct_9fa48("2631") ? false : stryMutAct_9fa48("2630") ? true : stryMutAct_9fa48("2629") ? matches : (stryCov_9fa48("2629", "2630", "2631"), !matches)) throw new Error(stryMutAct_9fa48("2632") ? "" : (stryCov_9fa48("2632"), 'Invalid base64 image format'));
    const ext = matches[1];
    const data = matches[2];
    const filename = stryMutAct_9fa48("2633") ? `` : (stryCov_9fa48("2633"), `${crypto.randomUUID()}-${index}.${ext}`);
    const filepath = path.join(tempDir, filename);
    fs.writeFileSync(filepath, Buffer.from(data, stryMutAct_9fa48("2634") ? "" : (stryCov_9fa48("2634"), 'base64')));
    return filepath;
  }
}

/**
 * Deletes temporary files.
 */
function cleanupTempFiles(files: string[]): void {
  if (stryMutAct_9fa48("2635")) {
    {}
  } else {
    stryCov_9fa48("2635");
    for (const file of files) {
      if (stryMutAct_9fa48("2636")) {
        {}
      } else {
        stryCov_9fa48("2636");
        try {
          if (stryMutAct_9fa48("2637")) {
            {}
          } else {
            stryCov_9fa48("2637");
            if (stryMutAct_9fa48("2639") ? false : stryMutAct_9fa48("2638") ? true : (stryCov_9fa48("2638", "2639"), fs.existsSync(file))) fs.unlinkSync(file);
          }
        } catch (err) {
          if (stryMutAct_9fa48("2640")) {
            {}
          } else {
            stryCov_9fa48("2640");
            log.warn(stryMutAct_9fa48("2641") ? `` : (stryCov_9fa48("2641"), `Failed to cleanup temp file ${file}:`), err);
          }
        }
      }
    }
  }
}

// ── Structured Error ─────────────────────────────────────

export class InvokeError extends Error {
  type: 'spawn_error' | 'exit_error' | 'timeout';
  cli: SupportedCLI;
  code: number | null;
  stderr: string;
  constructor(message: string, detail: {
    type: 'spawn_error' | 'exit_error' | 'timeout';
    cli: SupportedCLI;
    code?: number;
    stderr?: string;
  }) {
    if (stryMutAct_9fa48("2642")) {
      {}
    } else {
      stryCov_9fa48("2642");
      super(message);
      this.name = stryMutAct_9fa48("2643") ? "" : (stryCov_9fa48("2643"), 'InvokeError');
      this.type = detail.type;
      this.cli = detail.cli;
      this.code = stryMutAct_9fa48("2644") ? detail.code && null : (stryCov_9fa48("2644"), detail.code ?? null);
      this.stderr = stryMutAct_9fa48("2645") ? detail.stderr && '' : (stryCov_9fa48("2645"), detail.stderr ?? (stryMutAct_9fa48("2646") ? "Stryker was here!" : (stryCov_9fa48("2646"), '')));
    }
  }
  get retryable(): boolean {
    if (stryMutAct_9fa48("2647")) {
      {}
    } else {
      stryCov_9fa48("2647");
      return stryMutAct_9fa48("2650") ? this.type === 'spawn_error' : stryMutAct_9fa48("2649") ? false : stryMutAct_9fa48("2648") ? true : (stryCov_9fa48("2648", "2649", "2650"), this.type !== (stryMutAct_9fa48("2651") ? "" : (stryCov_9fa48("2651"), 'spawn_error')));
    }
  }
}

// ── Global CLI Concurrency Limiter ───────────────────────
// Prevents too many CLI processes from running simultaneously,
// which could cause OOM kills (each gemini/claude CLI is heavy).

/**
 * Loads the maximum concurrency from environment variables.
 * Range: 1-5, Default: 2.
 */
function getMaxConcurrency(): number {
  if (stryMutAct_9fa48("2652")) {
    {}
  } else {
    stryCov_9fa48("2652");
    const val = parseInt(stryMutAct_9fa48("2655") ? process.env.COLONY_MAX_CLI_CONCURRENCY && '' : stryMutAct_9fa48("2654") ? false : stryMutAct_9fa48("2653") ? true : (stryCov_9fa48("2653", "2654", "2655"), process.env.COLONY_MAX_CLI_CONCURRENCY || (stryMutAct_9fa48("2656") ? "Stryker was here!" : (stryCov_9fa48("2656"), ''))), 10);
    const DEFAULT = 2;
    if (stryMutAct_9fa48("2659") ? (isNaN(val) || val < 1) && val > 5 : stryMutAct_9fa48("2658") ? false : stryMutAct_9fa48("2657") ? true : (stryCov_9fa48("2657", "2658", "2659"), (stryMutAct_9fa48("2661") ? isNaN(val) && val < 1 : stryMutAct_9fa48("2660") ? false : (stryCov_9fa48("2660", "2661"), isNaN(val) || (stryMutAct_9fa48("2664") ? val >= 1 : stryMutAct_9fa48("2663") ? val <= 1 : stryMutAct_9fa48("2662") ? false : (stryCov_9fa48("2662", "2663", "2664"), val < 1)))) || (stryMutAct_9fa48("2667") ? val <= 5 : stryMutAct_9fa48("2666") ? val >= 5 : stryMutAct_9fa48("2665") ? false : (stryCov_9fa48("2665", "2666", "2667"), val > 5)))) {
      if (stryMutAct_9fa48("2668")) {
        {}
      } else {
        stryCov_9fa48("2668");
        if (stryMutAct_9fa48("2670") ? false : stryMutAct_9fa48("2669") ? true : (stryCov_9fa48("2669", "2670"), process.env.COLONY_MAX_CLI_CONCURRENCY)) {
          if (stryMutAct_9fa48("2671")) {
            {}
          } else {
            stryCov_9fa48("2671");
            log.warn(stryMutAct_9fa48("2672") ? `` : (stryCov_9fa48("2672"), `Invalid COLONY_MAX_CLI_CONCURRENCY "${process.env.COLONY_MAX_CLI_CONCURRENCY}". Using default: ${DEFAULT}`));
          }
        }
        return DEFAULT;
      }
    }
    return val;
  }
}
const MAX_CONCURRENT_CLI = getMaxConcurrency();
let activeCLICount = 0;
const cliWaiters: Array<{
  resolve: () => void;
  reject: (err: Error) => void;
}> = stryMutAct_9fa48("2673") ? ["Stryker was here"] : (stryCov_9fa48("2673"), []);
async function acquireCLISlot(signal?: AbortSignal): Promise<void> {
  if (stryMutAct_9fa48("2674")) {
    {}
  } else {
    stryCov_9fa48("2674");
    if (stryMutAct_9fa48("2677") ? signal.aborted : stryMutAct_9fa48("2676") ? false : stryMutAct_9fa48("2675") ? true : (stryCov_9fa48("2675", "2676", "2677"), signal?.aborted)) {
      if (stryMutAct_9fa48("2678")) {
        {}
      } else {
        stryCov_9fa48("2678");
        throw new InvokeError(stryMutAct_9fa48("2679") ? "" : (stryCov_9fa48("2679"), 'Invocation aborted while waiting for CLI slot'), stryMutAct_9fa48("2680") ? {} : (stryCov_9fa48("2680"), {
          type: stryMutAct_9fa48("2681") ? "" : (stryCov_9fa48("2681"), 'exit_error'),
          cli: stryMutAct_9fa48("2682") ? "" : (stryCov_9fa48("2682"), 'gemini')
        }));
      }
    }
    if (stryMutAct_9fa48("2686") ? activeCLICount >= MAX_CONCURRENT_CLI : stryMutAct_9fa48("2685") ? activeCLICount <= MAX_CONCURRENT_CLI : stryMutAct_9fa48("2684") ? false : stryMutAct_9fa48("2683") ? true : (stryCov_9fa48("2683", "2684", "2685", "2686"), activeCLICount < MAX_CONCURRENT_CLI)) {
      if (stryMutAct_9fa48("2687")) {
        {}
      } else {
        stryCov_9fa48("2687");
        stryMutAct_9fa48("2688") ? activeCLICount-- : (stryCov_9fa48("2688"), activeCLICount++);
        log.debug(stryMutAct_9fa48("2689") ? `` : (stryCov_9fa48("2689"), `CLI slot acquired (${activeCLICount}/${MAX_CONCURRENT_CLI} active)`));
        return;
      }
    }
    log.info(stryMutAct_9fa48("2690") ? `` : (stryCov_9fa48("2690"), `CLI slot full (${activeCLICount}/${MAX_CONCURRENT_CLI}), queuing...`));
    return new Promise<void>((resolve, reject) => {
      if (stryMutAct_9fa48("2691")) {
        {}
      } else {
        stryCov_9fa48("2691");
        const waiter = stryMutAct_9fa48("2692") ? {} : (stryCov_9fa48("2692"), {
          resolve: () => {
            if (stryMutAct_9fa48("2693")) {
              {}
            } else {
              stryCov_9fa48("2693");
              stryMutAct_9fa48("2694") ? activeCLICount-- : (stryCov_9fa48("2694"), activeCLICount++);
              log.debug(stryMutAct_9fa48("2695") ? `` : (stryCov_9fa48("2695"), `CLI slot acquired from queue (${activeCLICount}/${MAX_CONCURRENT_CLI} active)`));
              resolve();
            }
          },
          reject
        });
        cliWaiters.push(waiter);

        // If abort signal fires while waiting, reject and remove from queue
        if (stryMutAct_9fa48("2697") ? false : stryMutAct_9fa48("2696") ? true : (stryCov_9fa48("2696", "2697"), signal)) {
          if (stryMutAct_9fa48("2698")) {
            {}
          } else {
            stryCov_9fa48("2698");
            const onAbort = () => {
              if (stryMutAct_9fa48("2699")) {
                {}
              } else {
                stryCov_9fa48("2699");
                const idx = cliWaiters.indexOf(waiter);
                if (stryMutAct_9fa48("2702") ? idx === -1 : stryMutAct_9fa48("2701") ? false : stryMutAct_9fa48("2700") ? true : (stryCov_9fa48("2700", "2701", "2702"), idx !== (stryMutAct_9fa48("2703") ? +1 : (stryCov_9fa48("2703"), -1)))) {
                  if (stryMutAct_9fa48("2704")) {
                    {}
                  } else {
                    stryCov_9fa48("2704");
                    cliWaiters.splice(idx, 1);
                    reject(new InvokeError(stryMutAct_9fa48("2705") ? "" : (stryCov_9fa48("2705"), 'Invocation aborted while waiting for CLI slot'), stryMutAct_9fa48("2706") ? {} : (stryCov_9fa48("2706"), {
                      type: stryMutAct_9fa48("2707") ? "" : (stryCov_9fa48("2707"), 'exit_error'),
                      cli: stryMutAct_9fa48("2708") ? "" : (stryCov_9fa48("2708"), 'gemini')
                    })));
                  }
                }
              }
            };
            signal.addEventListener(stryMutAct_9fa48("2709") ? "" : (stryCov_9fa48("2709"), 'abort'), onAbort, stryMutAct_9fa48("2710") ? {} : (stryCov_9fa48("2710"), {
              once: stryMutAct_9fa48("2711") ? false : (stryCov_9fa48("2711"), true)
            }));
          }
        }
      }
    });
  }
}
function releaseCLISlot(): void {
  if (stryMutAct_9fa48("2712")) {
    {}
  } else {
    stryCov_9fa48("2712");
    stryMutAct_9fa48("2713") ? activeCLICount++ : (stryCov_9fa48("2713"), activeCLICount--);
    log.debug(stryMutAct_9fa48("2714") ? `` : (stryCov_9fa48("2714"), `CLI slot released (${activeCLICount}/${MAX_CONCURRENT_CLI} active, ${cliWaiters.length} waiting)`));
    const next = cliWaiters.shift();
    if (stryMutAct_9fa48("2716") ? false : stryMutAct_9fa48("2715") ? true : (stryCov_9fa48("2715", "2716"), next)) next.resolve();
  }
}

// ── Session Storage ──────────────────────────────────────

const DATA_DIR = stryMutAct_9fa48("2719") ? process.env.COLONY_DATA_DIR && path.join(process.cwd(), '.data') : stryMutAct_9fa48("2718") ? false : stryMutAct_9fa48("2717") ? true : (stryCov_9fa48("2717", "2718", "2719"), process.env.COLONY_DATA_DIR || path.join(process.cwd(), stryMutAct_9fa48("2720") ? "" : (stryCov_9fa48("2720"), '.data')));
const SESSIONS_FILE = path.join(DATA_DIR, stryMutAct_9fa48("2721") ? "" : (stryCov_9fa48("2721"), 'sessions.json'));
interface SessionRecord {
  sessionId: string;
  cli: SupportedCLI;
  updatedAt: string;
}
function ensureDataDir(): void {
  if (stryMutAct_9fa48("2722")) {
    {}
  } else {
    stryCov_9fa48("2722");
    if (stryMutAct_9fa48("2725") ? false : stryMutAct_9fa48("2724") ? true : stryMutAct_9fa48("2723") ? fs.existsSync(DATA_DIR) : (stryCov_9fa48("2723", "2724", "2725"), !fs.existsSync(DATA_DIR))) fs.mkdirSync(DATA_DIR, stryMutAct_9fa48("2726") ? {} : (stryCov_9fa48("2726"), {
      recursive: stryMutAct_9fa48("2727") ? false : (stryCov_9fa48("2727"), true)
    }));
  }
}
export function loadSessions(): Record<string, SessionRecord> {
  if (stryMutAct_9fa48("2728")) {
    {}
  } else {
    stryCov_9fa48("2728");
    try {
      if (stryMutAct_9fa48("2729")) {
        {}
      } else {
        stryCov_9fa48("2729");
        return JSON.parse(fs.readFileSync(SESSIONS_FILE, 'utf-8')) as Record<string, SessionRecord>;
      }
    } catch {
      if (stryMutAct_9fa48("2730")) {
        {}
      } else {
        stryCov_9fa48("2730");
        return {};
      }
    }
  }
}
export function saveSession(name: string, sessionId: string, cli: SupportedCLI): void {
  if (stryMutAct_9fa48("2731")) {
    {}
  } else {
    stryCov_9fa48("2731");
    ensureDataDir();
    const sessions = loadSessions();
    sessions[name] = stryMutAct_9fa48("2732") ? {} : (stryCov_9fa48("2732"), {
      sessionId,
      cli,
      updatedAt: new Date().toISOString()
    });
    fs.writeFileSync(SESSIONS_FILE, JSON.stringify(sessions, null, 2));
  }
}
export function getSession(name: string): SessionRecord | null {
  if (stryMutAct_9fa48("2733")) {
    {}
  } else {
    stryCov_9fa48("2733");
    return stryMutAct_9fa48("2734") ? loadSessions()[name] && null : (stryCov_9fa48("2734"), loadSessions()[name] ?? null);
  }
}

// ── CLI Configurations ───────────────────────────────────

interface CLIConfigEntry {
  buildArgs: (prompt: string, sessionId: string | null, files?: string[]) => string[];
  extractText: (event: Record<string, unknown>) => string | null;
  extractSessionId: (event: Record<string, unknown>) => string | null;
  extractToolUse: (event: Record<string, unknown>) => ToolUseEvent[];
  extractTokenUsage: (event: Record<string, unknown>) => {
    input: number;
    output: number;
  } | null;
}
const CLI_CONFIG: Record<SupportedCLI, CLIConfigEntry> = stryMutAct_9fa48("2735") ? {} : (stryCov_9fa48("2735"), {
  claude: stryMutAct_9fa48("2736") ? {} : (stryCov_9fa48("2736"), {
    // ...
    buildArgs: (prompt, sessionId, files) => {
      if (stryMutAct_9fa48("2737")) {
        {}
      } else {
        stryCov_9fa48("2737");
        const args = stryMutAct_9fa48("2738") ? [] : (stryCov_9fa48("2738"), [stryMutAct_9fa48("2739") ? "" : (stryCov_9fa48("2739"), '-p'), prompt, stryMutAct_9fa48("2740") ? "" : (stryCov_9fa48("2740"), '--output-format'), stryMutAct_9fa48("2741") ? "" : (stryCov_9fa48("2741"), 'stream-json'), stryMutAct_9fa48("2742") ? "" : (stryCov_9fa48("2742"), '--verbose'), stryMutAct_9fa48("2743") ? "" : (stryCov_9fa48("2743"), '--dangerously-skip-permissions')]);
        if (stryMutAct_9fa48("2745") ? false : stryMutAct_9fa48("2744") ? true : (stryCov_9fa48("2744", "2745"), sessionId)) args.push(stryMutAct_9fa48("2746") ? "" : (stryCov_9fa48("2746"), '--resume'), sessionId);
        if (stryMutAct_9fa48("2749") ? files || files.length > 0 : stryMutAct_9fa48("2748") ? false : stryMutAct_9fa48("2747") ? true : (stryCov_9fa48("2747", "2748", "2749"), files && (stryMutAct_9fa48("2752") ? files.length <= 0 : stryMutAct_9fa48("2751") ? files.length >= 0 : stryMutAct_9fa48("2750") ? true : (stryCov_9fa48("2750", "2751", "2752"), files.length > 0)))) {
          if (stryMutAct_9fa48("2753")) {
            {}
          } else {
            stryCov_9fa48("2753");
            for (const file of files) {
              if (stryMutAct_9fa48("2754")) {
                {}
              } else {
                stryCov_9fa48("2754");
                args.push(stryMutAct_9fa48("2755") ? "" : (stryCov_9fa48("2755"), '--file'), file);
              }
            }
          }
        }
        return args;
      }
    },
    extractText: event => {
      if (stryMutAct_9fa48("2756")) {
        {}
      } else {
        stryCov_9fa48("2756");
        if (stryMutAct_9fa48("2759") ? event.type === 'assistant' : stryMutAct_9fa48("2758") ? false : stryMutAct_9fa48("2757") ? true : (stryCov_9fa48("2757", "2758", "2759"), event.type !== (stryMutAct_9fa48("2760") ? "" : (stryCov_9fa48("2760"), 'assistant')))) return null;
        const content = stryMutAct_9fa48("2761") ? (event.message as Record<string, unknown>).content : (stryCov_9fa48("2761"), (event.message as Record<string, unknown>)?.content);
        if (stryMutAct_9fa48("2764") ? false : stryMutAct_9fa48("2763") ? true : stryMutAct_9fa48("2762") ? Array.isArray(content) : (stryCov_9fa48("2762", "2763", "2764"), !Array.isArray(content))) return null;
        return stryMutAct_9fa48("2765") ? content.map((b: Record<string, unknown>) => b.text as string).join('') : (stryCov_9fa48("2765"), content.filter(stryMutAct_9fa48("2766") ? () => undefined : (stryCov_9fa48("2766"), (b: Record<string, unknown>) => stryMutAct_9fa48("2769") ? b.type !== 'text' : stryMutAct_9fa48("2768") ? false : stryMutAct_9fa48("2767") ? true : (stryCov_9fa48("2767", "2768", "2769"), b.type === (stryMutAct_9fa48("2770") ? "" : (stryCov_9fa48("2770"), 'text'))))).map(stryMutAct_9fa48("2771") ? () => undefined : (stryCov_9fa48("2771"), (b: Record<string, unknown>) => b.text as string)).join(stryMutAct_9fa48("2772") ? "Stryker was here!" : (stryCov_9fa48("2772"), '')));
      }
    },
    extractSessionId: event => {
      if (stryMutAct_9fa48("2773")) {
        {}
      } else {
        stryCov_9fa48("2773");
        if (stryMutAct_9fa48("2776") ? event.type === 'system' || event.type === 'result' || event.session_id : stryMutAct_9fa48("2775") ? false : stryMutAct_9fa48("2774") ? true : (stryCov_9fa48("2774", "2775", "2776"), (stryMutAct_9fa48("2778") ? event.type === 'system' && event.type === 'result' : stryMutAct_9fa48("2777") ? true : (stryCov_9fa48("2777", "2778"), (stryMutAct_9fa48("2780") ? event.type !== 'system' : stryMutAct_9fa48("2779") ? false : (stryCov_9fa48("2779", "2780"), event.type === (stryMutAct_9fa48("2781") ? "" : (stryCov_9fa48("2781"), 'system')))) || (stryMutAct_9fa48("2783") ? event.type !== 'result' : stryMutAct_9fa48("2782") ? false : (stryCov_9fa48("2782", "2783"), event.type === (stryMutAct_9fa48("2784") ? "" : (stryCov_9fa48("2784"), 'result')))))) && event.session_id)) {
          if (stryMutAct_9fa48("2785")) {
            {}
          } else {
            stryCov_9fa48("2785");
            return event.session_id as string;
          }
        }
        return null;
      }
    },
    extractToolUse: event => {
      if (stryMutAct_9fa48("2786")) {
        {}
      } else {
        stryCov_9fa48("2786");
        if (stryMutAct_9fa48("2789") ? event.type === 'assistant' : stryMutAct_9fa48("2788") ? false : stryMutAct_9fa48("2787") ? true : (stryCov_9fa48("2787", "2788", "2789"), event.type !== (stryMutAct_9fa48("2790") ? "" : (stryCov_9fa48("2790"), 'assistant')))) return stryMutAct_9fa48("2791") ? ["Stryker was here"] : (stryCov_9fa48("2791"), []);
        const content = stryMutAct_9fa48("2792") ? (event.message as Record<string, unknown>).content : (stryCov_9fa48("2792"), (event.message as Record<string, unknown>)?.content);
        if (stryMutAct_9fa48("2795") ? false : stryMutAct_9fa48("2794") ? true : stryMutAct_9fa48("2793") ? Array.isArray(content) : (stryCov_9fa48("2793", "2794", "2795"), !Array.isArray(content))) return stryMutAct_9fa48("2796") ? ["Stryker was here"] : (stryCov_9fa48("2796"), []);
        return stryMutAct_9fa48("2797") ? content.map((b: Record<string, unknown>) => ({
          name: b.name as string,
          input: b.input as Record<string, unknown>
        })) : (stryCov_9fa48("2797"), content.filter(stryMutAct_9fa48("2798") ? () => undefined : (stryCov_9fa48("2798"), (b: Record<string, unknown>) => stryMutAct_9fa48("2801") ? b.type !== 'tool_use' : stryMutAct_9fa48("2800") ? false : stryMutAct_9fa48("2799") ? true : (stryCov_9fa48("2799", "2800", "2801"), b.type === (stryMutAct_9fa48("2802") ? "" : (stryCov_9fa48("2802"), 'tool_use'))))).map(stryMutAct_9fa48("2803") ? () => undefined : (stryCov_9fa48("2803"), (b: Record<string, unknown>) => stryMutAct_9fa48("2804") ? {} : (stryCov_9fa48("2804"), {
          name: b.name as string,
          input: b.input as Record<string, unknown>
        }))));
      }
    },
    extractTokenUsage: event => {
      if (stryMutAct_9fa48("2805")) {
        {}
      } else {
        stryCov_9fa48("2805");
        if (stryMutAct_9fa48("2808") ? event.type === 'result' || event.usage : stryMutAct_9fa48("2807") ? false : stryMutAct_9fa48("2806") ? true : (stryCov_9fa48("2806", "2807", "2808"), (stryMutAct_9fa48("2810") ? event.type !== 'result' : stryMutAct_9fa48("2809") ? true : (stryCov_9fa48("2809", "2810"), event.type === (stryMutAct_9fa48("2811") ? "" : (stryCov_9fa48("2811"), 'result')))) && event.usage)) {
          if (stryMutAct_9fa48("2812")) {
            {}
          } else {
            stryCov_9fa48("2812");
            const usage = event.usage as Record<string, number>;
            return stryMutAct_9fa48("2813") ? {} : (stryCov_9fa48("2813"), {
              input: stryMutAct_9fa48("2814") ? usage.input_tokens && 0 : (stryCov_9fa48("2814"), usage.input_tokens ?? 0),
              output: stryMutAct_9fa48("2815") ? usage.output_tokens && 0 : (stryCov_9fa48("2815"), usage.output_tokens ?? 0),
              cacheRead: stryMutAct_9fa48("2816") ? usage.cache_read_input_tokens && 0 : (stryCov_9fa48("2816"), usage.cache_read_input_tokens ?? 0),
              cacheCreation: stryMutAct_9fa48("2817") ? usage.cache_creation_input_tokens && 0 : (stryCov_9fa48("2817"), usage.cache_creation_input_tokens ?? 0)
            });
          }
        }
        return null;
      }
    }
  }),
  gemini: stryMutAct_9fa48("2818") ? {} : (stryCov_9fa48("2818"), {
    buildArgs: (prompt, sessionId, files) => {
      if (stryMutAct_9fa48("2819")) {
        {}
      } else {
        stryCov_9fa48("2819");
        const args = stryMutAct_9fa48("2820") ? [] : (stryCov_9fa48("2820"), [stryMutAct_9fa48("2821") ? "" : (stryCov_9fa48("2821"), '-p'), prompt, stryMutAct_9fa48("2822") ? "" : (stryCov_9fa48("2822"), '--output-format'), stryMutAct_9fa48("2823") ? "" : (stryCov_9fa48("2823"), 'stream-json'), stryMutAct_9fa48("2824") ? "" : (stryCov_9fa48("2824"), '--yolo')]);
        if (stryMutAct_9fa48("2826") ? false : stryMutAct_9fa48("2825") ? true : (stryCov_9fa48("2825", "2826"), sessionId)) args.push(stryMutAct_9fa48("2827") ? "" : (stryCov_9fa48("2827"), '--resume'), sessionId);
        if (stryMutAct_9fa48("2830") ? files || files.length > 0 : stryMutAct_9fa48("2829") ? false : stryMutAct_9fa48("2828") ? true : (stryCov_9fa48("2828", "2829", "2830"), files && (stryMutAct_9fa48("2833") ? files.length <= 0 : stryMutAct_9fa48("2832") ? files.length >= 0 : stryMutAct_9fa48("2831") ? true : (stryCov_9fa48("2831", "2832", "2833"), files.length > 0)))) {
          if (stryMutAct_9fa48("2834")) {
            {}
          } else {
            stryCov_9fa48("2834");
            log.warn(stryMutAct_9fa48("2835") ? `` : (stryCov_9fa48("2835"), `Gemini CLI does not support --file parameter. Skipping ${files.length} attachment(s).`));
          }
        }
        return args;
      }
    },
    extractText: event => {
      if (stryMutAct_9fa48("2836")) {
        {}
      } else {
        stryCov_9fa48("2836");
        if (stryMutAct_9fa48("2839") ? event.type === 'message' || event.role === 'assistant' : stryMutAct_9fa48("2838") ? false : stryMutAct_9fa48("2837") ? true : (stryCov_9fa48("2837", "2838", "2839"), (stryMutAct_9fa48("2841") ? event.type !== 'message' : stryMutAct_9fa48("2840") ? true : (stryCov_9fa48("2840", "2841"), event.type === (stryMutAct_9fa48("2842") ? "" : (stryCov_9fa48("2842"), 'message')))) && (stryMutAct_9fa48("2844") ? event.role !== 'assistant' : stryMutAct_9fa48("2843") ? true : (stryCov_9fa48("2843", "2844"), event.role === (stryMutAct_9fa48("2845") ? "" : (stryCov_9fa48("2845"), 'assistant')))))) {
          if (stryMutAct_9fa48("2846")) {
            {}
          } else {
            stryCov_9fa48("2846");
            return stryMutAct_9fa48("2847") ? event.content as string && null : (stryCov_9fa48("2847"), event.content as string ?? null);
          }
        }
        return null;
      }
    },
    extractSessionId: event => {
      if (stryMutAct_9fa48("2848")) {
        {}
      } else {
        stryCov_9fa48("2848");
        if (stryMutAct_9fa48("2851") ? event.type === 'init' || event.session_id : stryMutAct_9fa48("2850") ? false : stryMutAct_9fa48("2849") ? true : (stryCov_9fa48("2849", "2850", "2851"), (stryMutAct_9fa48("2853") ? event.type !== 'init' : stryMutAct_9fa48("2852") ? true : (stryCov_9fa48("2852", "2853"), event.type === (stryMutAct_9fa48("2854") ? "" : (stryCov_9fa48("2854"), 'init')))) && event.session_id)) {
          if (stryMutAct_9fa48("2855")) {
            {}
          } else {
            stryCov_9fa48("2855");
            return event.session_id as string;
          }
        }
        return null;
      }
    },
    extractToolUse: event => {
      if (stryMutAct_9fa48("2856")) {
        {}
      } else {
        stryCov_9fa48("2856");
        if (stryMutAct_9fa48("2859") ? event.type !== 'tool_use' : stryMutAct_9fa48("2858") ? false : stryMutAct_9fa48("2857") ? true : (stryCov_9fa48("2857", "2858", "2859"), event.type === (stryMutAct_9fa48("2860") ? "" : (stryCov_9fa48("2860"), 'tool_use')))) {
          if (stryMutAct_9fa48("2861")) {
            {}
          } else {
            stryCov_9fa48("2861");
            return stryMutAct_9fa48("2862") ? [] : (stryCov_9fa48("2862"), [stryMutAct_9fa48("2863") ? {} : (stryCov_9fa48("2863"), {
              name: event.tool_name as string,
              input: (event.parameters ?? {}) as Record<string, unknown>
            })]);
          }
        }
        return stryMutAct_9fa48("2864") ? ["Stryker was here"] : (stryCov_9fa48("2864"), []);
      }
    },
    extractTokenUsage: event => {
      if (stryMutAct_9fa48("2865")) {
        {}
      } else {
        stryCov_9fa48("2865");
        if (stryMutAct_9fa48("2868") ? event.type === 'result' || event.usage || event.stats : stryMutAct_9fa48("2867") ? false : stryMutAct_9fa48("2866") ? true : (stryCov_9fa48("2866", "2867", "2868"), (stryMutAct_9fa48("2870") ? event.type !== 'result' : stryMutAct_9fa48("2869") ? true : (stryCov_9fa48("2869", "2870"), event.type === (stryMutAct_9fa48("2871") ? "" : (stryCov_9fa48("2871"), 'result')))) && (stryMutAct_9fa48("2873") ? event.usage && event.stats : stryMutAct_9fa48("2872") ? true : (stryCov_9fa48("2872", "2873"), event.usage || event.stats)))) {
          if (stryMutAct_9fa48("2874")) {
            {}
          } else {
            stryCov_9fa48("2874");
            const usage = (event.usage ?? event.stats) as Record<string, number>;
            return stryMutAct_9fa48("2875") ? {} : (stryCov_9fa48("2875"), {
              input: stryMutAct_9fa48("2876") ? usage.input_tokens && 0 : (stryCov_9fa48("2876"), usage.input_tokens ?? 0),
              output: stryMutAct_9fa48("2877") ? usage.output_tokens && 0 : (stryCov_9fa48("2877"), usage.output_tokens ?? 0)
            });
          }
        }
        return null;
      }
    }
  }),
  codex: stryMutAct_9fa48("2878") ? {} : (stryCov_9fa48("2878"), {
    buildArgs: (prompt, sessionId, files) => {
      if (stryMutAct_9fa48("2879")) {
        {}
      } else {
        stryCov_9fa48("2879");
        const args = stryMutAct_9fa48("2880") ? [] : (stryCov_9fa48("2880"), [stryMutAct_9fa48("2881") ? "" : (stryCov_9fa48("2881"), 'exec'), stryMutAct_9fa48("2882") ? "" : (stryCov_9fa48("2882"), '--dangerously-bypass-approvals-and-sandbox'), stryMutAct_9fa48("2883") ? "" : (stryCov_9fa48("2883"), '--json')]);
        if (stryMutAct_9fa48("2885") ? false : stryMutAct_9fa48("2884") ? true : (stryCov_9fa48("2884", "2885"), sessionId)) {
          if (stryMutAct_9fa48("2886")) {
            {}
          } else {
            stryCov_9fa48("2886");
            args.push(stryMutAct_9fa48("2887") ? "" : (stryCov_9fa48("2887"), 'resume'), sessionId);
          }
        }
        if (stryMutAct_9fa48("2890") ? files || files.length > 0 : stryMutAct_9fa48("2889") ? false : stryMutAct_9fa48("2888") ? true : (stryCov_9fa48("2888", "2889", "2890"), files && (stryMutAct_9fa48("2893") ? files.length <= 0 : stryMutAct_9fa48("2892") ? files.length >= 0 : stryMutAct_9fa48("2891") ? true : (stryCov_9fa48("2891", "2892", "2893"), files.length > 0)))) {
          if (stryMutAct_9fa48("2894")) {
            {}
          } else {
            stryCov_9fa48("2894");
            for (const file of files) {
              if (stryMutAct_9fa48("2895")) {
                {}
              } else {
                stryCov_9fa48("2895");
                args.push(stryMutAct_9fa48("2896") ? "" : (stryCov_9fa48("2896"), '-i'), file);
              }
            }
          }
        }

        // Note: prompt will be passed via stdin, not as argument
        return args;
      }
    },
    extractText: event => {
      if (stryMutAct_9fa48("2897")) {
        {}
      } else {
        stryCov_9fa48("2897");
        const item = event.item as Record<string, any> | undefined;
        if (stryMutAct_9fa48("2900") ? event.type === 'item.completed' || item?.type === 'agent_message' : stryMutAct_9fa48("2899") ? false : stryMutAct_9fa48("2898") ? true : (stryCov_9fa48("2898", "2899", "2900"), (stryMutAct_9fa48("2902") ? event.type !== 'item.completed' : stryMutAct_9fa48("2901") ? true : (stryCov_9fa48("2901", "2902"), event.type === (stryMutAct_9fa48("2903") ? "" : (stryCov_9fa48("2903"), 'item.completed')))) && (stryMutAct_9fa48("2905") ? item?.type !== 'agent_message' : stryMutAct_9fa48("2904") ? true : (stryCov_9fa48("2904", "2905"), (stryMutAct_9fa48("2906") ? item.type : (stryCov_9fa48("2906"), item?.type)) === (stryMutAct_9fa48("2907") ? "" : (stryCov_9fa48("2907"), 'agent_message')))))) {
          if (stryMutAct_9fa48("2908")) {
            {}
          } else {
            stryCov_9fa48("2908");
            return stryMutAct_9fa48("2909") ? item.text as string && null : (stryCov_9fa48("2909"), item.text as string ?? null);
          }
        }
        // Compatibility for old format or other event types
        if (stryMutAct_9fa48("2912") ? event.type === 'message' || event.role === 'assistant' : stryMutAct_9fa48("2911") ? false : stryMutAct_9fa48("2910") ? true : (stryCov_9fa48("2910", "2911", "2912"), (stryMutAct_9fa48("2914") ? event.type !== 'message' : stryMutAct_9fa48("2913") ? true : (stryCov_9fa48("2913", "2914"), event.type === (stryMutAct_9fa48("2915") ? "" : (stryCov_9fa48("2915"), 'message')))) && (stryMutAct_9fa48("2917") ? event.role !== 'assistant' : stryMutAct_9fa48("2916") ? true : (stryCov_9fa48("2916", "2917"), event.role === (stryMutAct_9fa48("2918") ? "" : (stryCov_9fa48("2918"), 'assistant')))))) {
          if (stryMutAct_9fa48("2919")) {
            {}
          } else {
            stryCov_9fa48("2919");
            return stryMutAct_9fa48("2920") ? event.content as string && null : (stryCov_9fa48("2920"), event.content as string ?? null);
          }
        }
        return null;
      }
    },
    extractSessionId: event => {
      if (stryMutAct_9fa48("2921")) {
        {}
      } else {
        stryCov_9fa48("2921");
        if (stryMutAct_9fa48("2924") ? event.type === 'thread.started' || event.thread_id : stryMutAct_9fa48("2923") ? false : stryMutAct_9fa48("2922") ? true : (stryCov_9fa48("2922", "2923", "2924"), (stryMutAct_9fa48("2926") ? event.type !== 'thread.started' : stryMutAct_9fa48("2925") ? true : (stryCov_9fa48("2925", "2926"), event.type === (stryMutAct_9fa48("2927") ? "" : (stryCov_9fa48("2927"), 'thread.started')))) && event.thread_id)) {
          if (stryMutAct_9fa48("2928")) {
            {}
          } else {
            stryCov_9fa48("2928");
            return event.thread_id as string;
          }
        }
        if (stryMutAct_9fa48("2931") ? event.type === 'init' || event.type === 'system' || event.session_id : stryMutAct_9fa48("2930") ? false : stryMutAct_9fa48("2929") ? true : (stryCov_9fa48("2929", "2930", "2931"), (stryMutAct_9fa48("2933") ? event.type === 'init' && event.type === 'system' : stryMutAct_9fa48("2932") ? true : (stryCov_9fa48("2932", "2933"), (stryMutAct_9fa48("2935") ? event.type !== 'init' : stryMutAct_9fa48("2934") ? false : (stryCov_9fa48("2934", "2935"), event.type === (stryMutAct_9fa48("2936") ? "" : (stryCov_9fa48("2936"), 'init')))) || (stryMutAct_9fa48("2938") ? event.type !== 'system' : stryMutAct_9fa48("2937") ? false : (stryCov_9fa48("2937", "2938"), event.type === (stryMutAct_9fa48("2939") ? "" : (stryCov_9fa48("2939"), 'system')))))) && event.session_id)) {
          if (stryMutAct_9fa48("2940")) {
            {}
          } else {
            stryCov_9fa48("2940");
            return event.session_id as string;
          }
        }
        return null;
      }
    },
    extractToolUse: event => {
      if (stryMutAct_9fa48("2941")) {
        {}
      } else {
        stryCov_9fa48("2941");
        if (stryMutAct_9fa48("2944") ? event.type === 'item.completed' || event.item : stryMutAct_9fa48("2943") ? false : stryMutAct_9fa48("2942") ? true : (stryCov_9fa48("2942", "2943", "2944"), (stryMutAct_9fa48("2946") ? event.type !== 'item.completed' : stryMutAct_9fa48("2945") ? true : (stryCov_9fa48("2945", "2946"), event.type === (stryMutAct_9fa48("2947") ? "" : (stryCov_9fa48("2947"), 'item.completed')))) && event.item)) {
          if (stryMutAct_9fa48("2948")) {
            {}
          } else {
            stryCov_9fa48("2948");
            const item = event.item as Record<string, any>;
            // Map Codex-native executions to ToolUseEvent so they appear in Colony logs/UI
            if (stryMutAct_9fa48("2950") ? false : stryMutAct_9fa48("2949") ? true : (stryCov_9fa48("2949", "2950"), (stryMutAct_9fa48("2951") ? [] : (stryCov_9fa48("2951"), [stryMutAct_9fa48("2952") ? "" : (stryCov_9fa48("2952"), 'command_execution'), stryMutAct_9fa48("2953") ? "" : (stryCov_9fa48("2953"), 'web_search'), stryMutAct_9fa48("2954") ? "" : (stryCov_9fa48("2954"), 'read_file'), stryMutAct_9fa48("2955") ? "" : (stryCov_9fa48("2955"), 'write_file'), stryMutAct_9fa48("2956") ? "" : (stryCov_9fa48("2956"), 'apply_patch')])).includes(item.type))) {
              if (stryMutAct_9fa48("2957")) {
                {}
              } else {
                stryCov_9fa48("2957");
                return stryMutAct_9fa48("2958") ? [] : (stryCov_9fa48("2958"), [stryMutAct_9fa48("2959") ? {} : (stryCov_9fa48("2959"), {
                  name: item.type,
                  input: item
                })]);
              }
            }
          }
        }
        if (stryMutAct_9fa48("2962") ? event.type !== 'tool_call' : stryMutAct_9fa48("2961") ? false : stryMutAct_9fa48("2960") ? true : (stryCov_9fa48("2960", "2961", "2962"), event.type === (stryMutAct_9fa48("2963") ? "" : (stryCov_9fa48("2963"), 'tool_call')))) {
          if (stryMutAct_9fa48("2964")) {
            {}
          } else {
            stryCov_9fa48("2964");
            return stryMutAct_9fa48("2965") ? [] : (stryCov_9fa48("2965"), [stryMutAct_9fa48("2966") ? {} : (stryCov_9fa48("2966"), {
              name: event.name as string,
              input: (event.arguments ?? {}) as Record<string, unknown>
            })]);
          }
        }
        return stryMutAct_9fa48("2967") ? ["Stryker was here"] : (stryCov_9fa48("2967"), []);
      }
    },
    extractTokenUsage: event => {
      if (stryMutAct_9fa48("2968")) {
        {}
      } else {
        stryCov_9fa48("2968");
        if (stryMutAct_9fa48("2971") ? event.type === 'turn.completed' || event.usage : stryMutAct_9fa48("2970") ? false : stryMutAct_9fa48("2969") ? true : (stryCov_9fa48("2969", "2970", "2971"), (stryMutAct_9fa48("2973") ? event.type !== 'turn.completed' : stryMutAct_9fa48("2972") ? true : (stryCov_9fa48("2972", "2973"), event.type === (stryMutAct_9fa48("2974") ? "" : (stryCov_9fa48("2974"), 'turn.completed')))) && event.usage)) {
          if (stryMutAct_9fa48("2975")) {
            {}
          } else {
            stryCov_9fa48("2975");
            const usage = event.usage as Record<string, number>;
            return stryMutAct_9fa48("2976") ? {} : (stryCov_9fa48("2976"), {
              input: stryMutAct_9fa48("2977") ? usage.input_tokens && 0 : (stryCov_9fa48("2977"), usage.input_tokens ?? 0),
              output: stryMutAct_9fa48("2978") ? usage.output_tokens && 0 : (stryCov_9fa48("2978"), usage.output_tokens ?? 0),
              cacheRead: stryMutAct_9fa48("2979") ? usage.cached_input_tokens && 0 : (stryCov_9fa48("2979"), usage.cached_input_tokens ?? 0)
            });
          }
        }
        if (stryMutAct_9fa48("2982") ? event.type === 'result' || event.usage : stryMutAct_9fa48("2981") ? false : stryMutAct_9fa48("2980") ? true : (stryCov_9fa48("2980", "2981", "2982"), (stryMutAct_9fa48("2984") ? event.type !== 'result' : stryMutAct_9fa48("2983") ? true : (stryCov_9fa48("2983", "2984"), event.type === (stryMutAct_9fa48("2985") ? "" : (stryCov_9fa48("2985"), 'result')))) && event.usage)) {
          if (stryMutAct_9fa48("2986")) {
            {}
          } else {
            stryCov_9fa48("2986");
            const usage = event.usage as Record<string, number>;
            return stryMutAct_9fa48("2987") ? {} : (stryCov_9fa48("2987"), {
              input: stryMutAct_9fa48("2988") ? usage.input_tokens && 0 : (stryCov_9fa48("2988"), usage.input_tokens ?? 0),
              output: stryMutAct_9fa48("2989") ? usage.output_tokens && 0 : (stryCov_9fa48("2989"), usage.output_tokens ?? 0),
              cacheRead: stryMutAct_9fa48("2990") ? usage.cache_read_input_tokens && 0 : (stryCov_9fa48("2990"), usage.cache_read_input_tokens ?? 0),
              cacheCreation: stryMutAct_9fa48("2991") ? usage.cache_creation_input_tokens && 0 : (stryCov_9fa48("2991"), usage.cache_creation_input_tokens ?? 0)
            });
          }
        }
        return null;
      }
    }
  })
});

// ── Core Invoke Function ─────────────────────────────────

export async function invoke(cli: SupportedCLI, prompt: string, options: InvokeOptions = {}): Promise<InvokeResult> {
  if (stryMutAct_9fa48("2992")) {
    {}
  } else {
    stryCov_9fa48("2992");
    const config = CLI_CONFIG[cli];
    if (stryMutAct_9fa48("2995") ? false : stryMutAct_9fa48("2994") ? true : stryMutAct_9fa48("2993") ? config : (stryCov_9fa48("2993", "2994", "2995"), !config)) {
      if (stryMutAct_9fa48("2996")) {
        {}
      } else {
        stryCov_9fa48("2996");
        throw new InvokeError(stryMutAct_9fa48("2997") ? `` : (stryCov_9fa48("2997"), `Unsupported CLI: "${cli}", available: ${Object.keys(CLI_CONFIG).join(stryMutAct_9fa48("2998") ? "" : (stryCov_9fa48("2998"), ', '))}`), stryMutAct_9fa48("2999") ? {} : (stryCov_9fa48("2999"), {
          type: stryMutAct_9fa48("3000") ? "" : (stryCov_9fa48("3000"), 'spawn_error'),
          cli
        }));
      }
    }
    const idleTimeoutMs = stryMutAct_9fa48("3001") ? options.idleTimeoutMs && 5 * 60 * 1000 : (stryCov_9fa48("3001"), options.idleTimeoutMs ?? (stryMutAct_9fa48("3002") ? 5 * 60 / 1000 : (stryCov_9fa48("3002"), (stryMutAct_9fa48("3003") ? 5 / 60 : (stryCov_9fa48("3003"), 5 * 60)) * 1000)));

    // Resolve session ID
    let sessionId = stryMutAct_9fa48("3004") ? options.sessionId && null : (stryCov_9fa48("3004"), options.sessionId ?? null);
    if (stryMutAct_9fa48("3007") ? !sessionId || options.sessionName : stryMutAct_9fa48("3006") ? false : stryMutAct_9fa48("3005") ? true : (stryCov_9fa48("3005", "3006", "3007"), (stryMutAct_9fa48("3008") ? sessionId : (stryCov_9fa48("3008"), !sessionId)) && options.sessionName)) {
      if (stryMutAct_9fa48("3009")) {
        {}
      } else {
        stryCov_9fa48("3009");
        const saved = getSession(options.sessionName);
        if (stryMutAct_9fa48("3012") ? saved || saved.cli === cli : stryMutAct_9fa48("3011") ? false : stryMutAct_9fa48("3010") ? true : (stryCov_9fa48("3010", "3011", "3012"), saved && (stryMutAct_9fa48("3014") ? saved.cli !== cli : stryMutAct_9fa48("3013") ? true : (stryCov_9fa48("3013", "3014"), saved.cli === cli)))) {
          if (stryMutAct_9fa48("3015")) {
            {}
          } else {
            stryCov_9fa48("3015");
            sessionId = saved.sessionId;
            log.debug(stryMutAct_9fa48("3016") ? `` : (stryCov_9fa48("3016"), `Resuming session "${options.sessionName}" → ${sessionId}`));
          }
        }
      }
    }

    // Find CLI binary
    let cliPath: string;
    try {
      if (stryMutAct_9fa48("3017")) {
        {}
      } else {
        stryCov_9fa48("3017");
        cliPath = stryMutAct_9fa48("3018") ? execSync(`which ${cli}`, {
          encoding: 'utf-8'
        }) : (stryCov_9fa48("3018"), execSync(stryMutAct_9fa48("3019") ? `` : (stryCov_9fa48("3019"), `which ${cli}`), stryMutAct_9fa48("3020") ? {} : (stryCov_9fa48("3020"), {
          encoding: stryMutAct_9fa48("3021") ? "" : (stryCov_9fa48("3021"), 'utf-8')
        })).trim());
      }
    } catch {
      if (stryMutAct_9fa48("3022")) {
        {}
      } else {
        stryCov_9fa48("3022");
        throw new InvokeError(stryMutAct_9fa48("3023") ? `` : (stryCov_9fa48("3023"), `CLI "${cli}" not found in PATH`), stryMutAct_9fa48("3024") ? {} : (stryCov_9fa48("3024"), {
          type: stryMutAct_9fa48("3025") ? "" : (stryCov_9fa48("3025"), 'spawn_error'),
          cli
        }));
      }
    }
    const args = config.buildArgs(prompt, sessionId, stryMutAct_9fa48("3026") ? ["Stryker was here"] : (stryCov_9fa48("3026"), [])); // Initial empty call to find binary
    log.debug(stryMutAct_9fa48("3027") ? `` : (stryCov_9fa48("3027"), `CLI path resolution for ${cli}`));
    let tempFiles: string[] = stryMutAct_9fa48("3028") ? ["Stryker was here"] : (stryCov_9fa48("3028"), []);

    // Acquire a CLI slot before spawning (blocks if MAX_CONCURRENT_CLI reached)
    await acquireCLISlot(options.signal);
    try {
      if (stryMutAct_9fa48("3029")) {
        {}
      } else {
        stryCov_9fa48("3029");
        // Handle attachments
        if (stryMutAct_9fa48("3032") ? options.attachments || options.attachments.length > 0 : stryMutAct_9fa48("3031") ? false : stryMutAct_9fa48("3030") ? true : (stryCov_9fa48("3030", "3031", "3032"), options.attachments && (stryMutAct_9fa48("3035") ? options.attachments.length <= 0 : stryMutAct_9fa48("3034") ? options.attachments.length >= 0 : stryMutAct_9fa48("3033") ? true : (stryCov_9fa48("3033", "3034", "3035"), options.attachments.length > 0)))) {
          if (stryMutAct_9fa48("3036")) {
            {}
          } else {
            stryCov_9fa48("3036");
            tempFiles = options.attachments.map(stryMutAct_9fa48("3037") ? () => undefined : (stryCov_9fa48("3037"), (att, idx) => saveTempImage(att.url, idx)));
            log.info(stryMutAct_9fa48("3038") ? `` : (stryCov_9fa48("3038"), `Saved ${tempFiles.length} temp image(s) for ${cli}`));
          }
        }
        const argsWithFiles = config.buildArgs(prompt, sessionId, tempFiles);

        // Enhanced logging: record full spawn parameters for debugging
        const sanitizedEnv = Object.keys(stryMutAct_9fa48("3039") ? options.env && {} : (stryCov_9fa48("3039"), options.env ?? {})).reduce((acc, key) => {
          if (stryMutAct_9fa48("3040")) {
            {}
          } else {
            stryCov_9fa48("3040");
            // Sanitize sensitive values (API keys, tokens)
            if (stryMutAct_9fa48("3043") ? (key.toLowerCase().includes('key') || key.toLowerCase().includes('token')) && key.toLowerCase().includes('secret') : stryMutAct_9fa48("3042") ? false : stryMutAct_9fa48("3041") ? true : (stryCov_9fa48("3041", "3042", "3043"), (stryMutAct_9fa48("3045") ? key.toLowerCase().includes('key') && key.toLowerCase().includes('token') : stryMutAct_9fa48("3044") ? false : (stryCov_9fa48("3044", "3045"), (stryMutAct_9fa48("3046") ? key.toUpperCase().includes('key') : (stryCov_9fa48("3046"), key.toLowerCase().includes(stryMutAct_9fa48("3047") ? "" : (stryCov_9fa48("3047"), 'key')))) || (stryMutAct_9fa48("3048") ? key.toUpperCase().includes('token') : (stryCov_9fa48("3048"), key.toLowerCase().includes(stryMutAct_9fa48("3049") ? "" : (stryCov_9fa48("3049"), 'token')))))) || (stryMutAct_9fa48("3050") ? key.toUpperCase().includes('secret') : (stryCov_9fa48("3050"), key.toLowerCase().includes(stryMutAct_9fa48("3051") ? "" : (stryCov_9fa48("3051"), 'secret')))))) {
              if (stryMutAct_9fa48("3052")) {
                {}
              } else {
                stryCov_9fa48("3052");
                acc[key] = stryMutAct_9fa48("3053") ? "" : (stryCov_9fa48("3053"), '***');
              }
            } else {
              if (stryMutAct_9fa48("3054")) {
                {}
              } else {
                stryCov_9fa48("3054");
                acc[key] = (stryMutAct_9fa48("3055") ? options.env && {} : (stryCov_9fa48("3055"), options.env ?? {}))[key];
              }
            }
            return acc;
          }
        }, {} as Record<string, string | undefined>);
        log.info(stryMutAct_9fa48("3056") ? `` : (stryCov_9fa48("3056"), `Invoking ${cli}`), stryMutAct_9fa48("3057") ? {} : (stryCov_9fa48("3057"), {
          sessionId: stryMutAct_9fa48("3058") ? sessionId && 'new' : (stryCov_9fa48("3058"), sessionId ?? (stryMutAct_9fa48("3059") ? "" : (stryCov_9fa48("3059"), 'new'))),
          cwd: stryMutAct_9fa48("3060") ? options.cwd && 'default' : (stryCov_9fa48("3060"), options.cwd ?? (stryMutAct_9fa48("3061") ? "" : (stryCov_9fa48("3061"), 'default'))),
          fileCount: tempFiles.length
        }));
        log.debug(stryMutAct_9fa48("3062") ? `` : (stryCov_9fa48("3062"), `${cli} spawn parameters`), stryMutAct_9fa48("3063") ? {} : (stryCov_9fa48("3063"), {
          args: argsWithFiles,
          env: sanitizedEnv,
          cwd: options.cwd
        }));
        return await new Promise<InvokeResult>((resolve, reject) => {
          if (stryMutAct_9fa48("3064")) {
            {}
          } else {
            stryCov_9fa48("3064");
            let settled = stryMutAct_9fa48("3065") ? true : (stryCov_9fa48("3065"), false);
            let childExitCode: number | null = null;
            let rlClosed = stryMutAct_9fa48("3066") ? true : (stryCov_9fa48("3066"), false);
            const child = spawn(cliPath, argsWithFiles, stryMutAct_9fa48("3067") ? {} : (stryCov_9fa48("3067"), {
              stdio: (stryMutAct_9fa48("3070") ? cli !== 'codex' : stryMutAct_9fa48("3069") ? false : stryMutAct_9fa48("3068") ? true : (stryCov_9fa48("3068", "3069", "3070"), cli === (stryMutAct_9fa48("3071") ? "" : (stryCov_9fa48("3071"), 'codex')))) ? stryMutAct_9fa48("3072") ? [] : (stryCov_9fa48("3072"), [stryMutAct_9fa48("3073") ? "" : (stryCov_9fa48("3073"), 'pipe'), stryMutAct_9fa48("3074") ? "" : (stryCov_9fa48("3074"), 'pipe'), stryMutAct_9fa48("3075") ? "" : (stryCov_9fa48("3075"), 'pipe')]) : stryMutAct_9fa48("3076") ? [] : (stryCov_9fa48("3076"), [stryMutAct_9fa48("3077") ? "" : (stryCov_9fa48("3077"), 'ignore'), stryMutAct_9fa48("3078") ? "" : (stryCov_9fa48("3078"), 'pipe'), stryMutAct_9fa48("3079") ? "" : (stryCov_9fa48("3079"), 'pipe')]),
              env: stryMutAct_9fa48("3080") ? {} : (stryCov_9fa48("3080"), {
                ...process.env,
                ...options.env
              }),
              cwd: options.cwd // Set working directory
            }));

            // For codex CLI, write prompt to stdin
            if (stryMutAct_9fa48("3083") ? cli === 'codex' || child.stdin : stryMutAct_9fa48("3082") ? false : stryMutAct_9fa48("3081") ? true : (stryCov_9fa48("3081", "3082", "3083"), (stryMutAct_9fa48("3085") ? cli !== 'codex' : stryMutAct_9fa48("3084") ? true : (stryCov_9fa48("3084", "3085"), cli === (stryMutAct_9fa48("3086") ? "" : (stryCov_9fa48("3086"), 'codex')))) && child.stdin)) {
              if (stryMutAct_9fa48("3087")) {
                {}
              } else {
                stryCov_9fa48("3087");
                child.stdin.write(prompt + (stryMutAct_9fa48("3088") ? "" : (stryCov_9fa48("3088"), '\n')));
                child.stdin.end();
              }
            }
            const textChunks: string[] = stryMutAct_9fa48("3089") ? ["Stryker was here"] : (stryCov_9fa48("3089"), []);
            let capturedSessionId: string | null = null;
            let stderr = stryMutAct_9fa48("3090") ? "Stryker was here!" : (stryCov_9fa48("3090"), '');
            let tokenUsage: {
              input: number;
              output: number;
            } | undefined;
            const toolCalls: ToolUseEvent[] = stryMutAct_9fa48("3091") ? ["Stryker was here"] : (stryCov_9fa48("3091"), []);

            // ── Idle timeout ───────────────────────────────────
            let lastActivity = Date.now();
            const resetActivity = () => {
              if (stryMutAct_9fa48("3092")) {
                {}
              } else {
                stryCov_9fa48("3092");
                lastActivity = Date.now();
              }
            };
            if (stryMutAct_9fa48("3094") ? false : stryMutAct_9fa48("3093") ? true : (stryCov_9fa48("3093", "3094"), child.stdout)) child.stdout.on(stryMutAct_9fa48("3095") ? "" : (stryCov_9fa48("3095"), 'data'), resetActivity);
            if (stryMutAct_9fa48("3097") ? false : stryMutAct_9fa48("3096") ? true : (stryCov_9fa48("3096", "3097"), child.stderr)) child.stderr.on(stryMutAct_9fa48("3098") ? "" : (stryCov_9fa48("3098"), 'data'), resetActivity);
            const idleChecker = setInterval(() => {
              if (stryMutAct_9fa48("3099")) {
                {}
              } else {
                stryCov_9fa48("3099");
                if (stryMutAct_9fa48("3103") ? Date.now() - lastActivity <= idleTimeoutMs : stryMutAct_9fa48("3102") ? Date.now() - lastActivity >= idleTimeoutMs : stryMutAct_9fa48("3101") ? false : stryMutAct_9fa48("3100") ? true : (stryCov_9fa48("3100", "3101", "3102", "3103"), (stryMutAct_9fa48("3104") ? Date.now() + lastActivity : (stryCov_9fa48("3104"), Date.now() - lastActivity)) > idleTimeoutMs)) {
                  if (stryMutAct_9fa48("3105")) {
                    {}
                  } else {
                    stryCov_9fa48("3105");
                    clearInterval(idleChecker);
                    child.kill(stryMutAct_9fa48("3106") ? "" : (stryCov_9fa48("3106"), 'SIGTERM'));
                    setTimeout(() => {
                      if (stryMutAct_9fa48("3107")) {
                        {}
                      } else {
                        stryCov_9fa48("3107");
                        if (stryMutAct_9fa48("3110") ? false : stryMutAct_9fa48("3109") ? true : stryMutAct_9fa48("3108") ? child.killed : (stryCov_9fa48("3108", "3109", "3110"), !child.killed)) child.kill(stryMutAct_9fa48("3111") ? "" : (stryCov_9fa48("3111"), 'SIGKILL'));
                      }
                    }, 5000);
                    settle(stryMutAct_9fa48("3112") ? "" : (stryCov_9fa48("3112"), 'reject'), new InvokeError(stryMutAct_9fa48("3113") ? `` : (stryCov_9fa48("3113"), `${cli} timeout (${Math.round(stryMutAct_9fa48("3114") ? idleTimeoutMs * 1000 : (stryCov_9fa48("3114"), idleTimeoutMs / 1000))}s idle)`), stryMutAct_9fa48("3115") ? {} : (stryCov_9fa48("3115"), {
                      type: stryMutAct_9fa48("3116") ? "" : (stryCov_9fa48("3116"), 'timeout'),
                      cli,
                      stderr
                    })));
                  }
                }
              }
            }, 5000);

            // ── Process cleanup ────────────────────────────────
            const cleanup = () => {
              if (stryMutAct_9fa48("3117")) {
                {}
              } else {
                stryCov_9fa48("3117");
                if (stryMutAct_9fa48("3120") ? false : stryMutAct_9fa48("3119") ? true : stryMutAct_9fa48("3118") ? child.killed : (stryCov_9fa48("3118", "3119", "3120"), !child.killed)) child.kill(stryMutAct_9fa48("3121") ? "" : (stryCov_9fa48("3121"), 'SIGTERM'));
              }
            };
            process.on(stryMutAct_9fa48("3122") ? "" : (stryCov_9fa48("3122"), 'SIGINT'), cleanup);
            process.on(stryMutAct_9fa48("3123") ? "" : (stryCov_9fa48("3123"), 'SIGTERM'), cleanup);
            const removeCleanupListeners = () => {
              if (stryMutAct_9fa48("3124")) {
                {}
              } else {
                stryCov_9fa48("3124");
                process.off(stryMutAct_9fa48("3125") ? "" : (stryCov_9fa48("3125"), 'SIGINT'), cleanup);
                process.off(stryMutAct_9fa48("3126") ? "" : (stryCov_9fa48("3126"), 'SIGTERM'), cleanup);
              }
            };

            // ── AbortSignal ────────────────────────────────────
            const onAbort = () => {
              if (stryMutAct_9fa48("3127")) {
                {}
              } else {
                stryCov_9fa48("3127");
                if (stryMutAct_9fa48("3129") ? false : stryMutAct_9fa48("3128") ? true : (stryCov_9fa48("3128", "3129"), settled)) return;
                child.kill(stryMutAct_9fa48("3130") ? "" : (stryCov_9fa48("3130"), 'SIGTERM'));
                setTimeout(() => {
                  if (stryMutAct_9fa48("3131")) {
                    {}
                  } else {
                    stryCov_9fa48("3131");
                    if (stryMutAct_9fa48("3134") ? false : stryMutAct_9fa48("3133") ? true : stryMutAct_9fa48("3132") ? child.killed : (stryCov_9fa48("3132", "3133", "3134"), !child.killed)) child.kill(stryMutAct_9fa48("3135") ? "" : (stryCov_9fa48("3135"), 'SIGKILL'));
                  }
                }, 2000);
                settle(stryMutAct_9fa48("3136") ? "" : (stryCov_9fa48("3136"), 'reject'), new InvokeError(stryMutAct_9fa48("3137") ? "" : (stryCov_9fa48("3137"), 'Invocation aborted'), stryMutAct_9fa48("3138") ? {} : (stryCov_9fa48("3138"), {
                  type: stryMutAct_9fa48("3139") ? "" : (stryCov_9fa48("3139"), 'exit_error'),
                  cli,
                  stderr
                })));
              }
            };
            if (stryMutAct_9fa48("3141") ? false : stryMutAct_9fa48("3140") ? true : (stryCov_9fa48("3140", "3141"), options.signal)) {
              if (stryMutAct_9fa48("3142")) {
                {}
              } else {
                stryCov_9fa48("3142");
                if (stryMutAct_9fa48("3144") ? false : stryMutAct_9fa48("3143") ? true : (stryCov_9fa48("3143", "3144"), options.signal.aborted)) {
                  if (stryMutAct_9fa48("3145")) {
                    {}
                  } else {
                    stryCov_9fa48("3145");
                    onAbort();
                    return;
                  }
                }
                options.signal.addEventListener(stryMutAct_9fa48("3146") ? "" : (stryCov_9fa48("3146"), 'abort'), onAbort);
              }
            }

            // ── Settle logic ───────────────────────────────────
            function settle(action: 'resolve' | 'reject', value: InvokeResult | InvokeError): void {
              if (stryMutAct_9fa48("3147")) {
                {}
              } else {
                stryCov_9fa48("3147");
                if (stryMutAct_9fa48("3149") ? false : stryMutAct_9fa48("3148") ? true : (stryCov_9fa48("3148", "3149"), settled)) return;
                settled = stryMutAct_9fa48("3150") ? false : (stryCov_9fa48("3150"), true);
                clearInterval(idleChecker);
                removeCleanupListeners();
                if (stryMutAct_9fa48("3152") ? false : stryMutAct_9fa48("3151") ? true : (stryCov_9fa48("3151", "3152"), options.signal)) {
                  if (stryMutAct_9fa48("3153")) {
                    {}
                  } else {
                    stryCov_9fa48("3153");
                    options.signal.removeEventListener(stryMutAct_9fa48("3154") ? "" : (stryCov_9fa48("3154"), 'abort'), onAbort);
                  }
                }
                if (stryMutAct_9fa48("3157") ? action !== 'resolve' : stryMutAct_9fa48("3156") ? false : stryMutAct_9fa48("3155") ? true : (stryCov_9fa48("3155", "3156", "3157"), action === (stryMutAct_9fa48("3158") ? "" : (stryCov_9fa48("3158"), 'resolve')))) resolve(value as InvokeResult);else reject(value as InvokeError);
              }
            }
            if (stryMutAct_9fa48("3161") ? false : stryMutAct_9fa48("3160") ? true : stryMutAct_9fa48("3159") ? child.stdout : (stryCov_9fa48("3159", "3160", "3161"), !child.stdout)) {
              if (stryMutAct_9fa48("3162")) {
                {}
              } else {
                stryCov_9fa48("3162");
                settle(stryMutAct_9fa48("3163") ? "" : (stryCov_9fa48("3163"), 'reject'), new InvokeError(stryMutAct_9fa48("3164") ? "" : (stryCov_9fa48("3164"), 'Child process stdout is null'), stryMutAct_9fa48("3165") ? {} : (stryCov_9fa48("3165"), {
                  type: stryMutAct_9fa48("3166") ? "" : (stryCov_9fa48("3166"), 'exit_error'),
                  cli,
                  stderr
                })));
                return;
              }
            }

            // ── Parse stdout line by line ──────────────────────
            const rl = createInterface(stryMutAct_9fa48("3167") ? {} : (stryCov_9fa48("3167"), {
              input: child.stdout
            }));
            rl.on(stryMutAct_9fa48("3168") ? "" : (stryCov_9fa48("3168"), 'line'), line => {
              if (stryMutAct_9fa48("3169")) {
                {}
              } else {
                stryCov_9fa48("3169");
                if (stryMutAct_9fa48("3172") ? false : stryMutAct_9fa48("3171") ? true : stryMutAct_9fa48("3170") ? line.trim() : (stryCov_9fa48("3170", "3171", "3172"), !(stryMutAct_9fa48("3173") ? line : (stryCov_9fa48("3173"), line.trim())))) return;
                let event: Record<string, unknown>;
                try {
                  if (stryMutAct_9fa48("3174")) {
                    {}
                  } else {
                    stryCov_9fa48("3174");
                    event = JSON.parse(line) as Record<string, unknown>;
                  }
                } catch {
                  if (stryMutAct_9fa48("3175")) {
                    {}
                  } else {
                    stryCov_9fa48("3175");
                    return;
                  }
                }
                const sid = config.extractSessionId(event);
                if (stryMutAct_9fa48("3177") ? false : stryMutAct_9fa48("3176") ? true : (stryCov_9fa48("3176", "3177"), sid)) capturedSessionId = sid;

                // ── Extract errors from stdout JSON events ──────
                // Some CLIs (notably Claude) report errors as JSON on stdout
                // (e.g. type=result with is_error=true) instead of writing to stderr.
                // Capture these so the InvokeError message includes the real error text.
                if (stryMutAct_9fa48("3180") ? event.is_error === true || Array.isArray(event.errors) : stryMutAct_9fa48("3179") ? false : stryMutAct_9fa48("3178") ? true : (stryCov_9fa48("3178", "3179", "3180"), (stryMutAct_9fa48("3182") ? event.is_error !== true : stryMutAct_9fa48("3181") ? true : (stryCov_9fa48("3181", "3182"), event.is_error === (stryMutAct_9fa48("3183") ? false : (stryCov_9fa48("3183"), true)))) && Array.isArray(event.errors))) {
                  if (stryMutAct_9fa48("3184")) {
                    {}
                  } else {
                    stryCov_9fa48("3184");
                    const errTexts = (event.errors as string[]).join(stryMutAct_9fa48("3185") ? "" : (stryCov_9fa48("3185"), '; '));
                    stryMutAct_9fa48("3186") ? stderr -= (stderr ? '\n' : '') + errTexts : (stryCov_9fa48("3186"), stderr += stryMutAct_9fa48("3187") ? (stderr ? '\n' : '') - errTexts : (stryCov_9fa48("3187"), (stderr ? stryMutAct_9fa48("3188") ? "" : (stryCov_9fa48("3188"), '\n') : stryMutAct_9fa48("3189") ? "Stryker was here!" : (stryCov_9fa48("3189"), '')) + errTexts));
                  }
                }
                const text = config.extractText(event);
                if (stryMutAct_9fa48("3191") ? false : stryMutAct_9fa48("3190") ? true : (stryCov_9fa48("3190", "3191"), text)) {
                  if (stryMutAct_9fa48("3192")) {
                    {}
                  } else {
                    stryCov_9fa48("3192");
                    textChunks.push(text);
                    stryMutAct_9fa48("3193") ? options.onToken(text) : (stryCov_9fa48("3193"), options.onToken?.(text));
                  }
                }
                const extractedTools = config.extractToolUse(event);
                for (const toolUse of extractedTools) {
                  if (stryMutAct_9fa48("3194")) {
                    {}
                  } else {
                    stryCov_9fa48("3194");
                    toolCalls.push(toolUse);
                    stryMutAct_9fa48("3195") ? options.onToolUse(toolUse) : (stryCov_9fa48("3195"), options.onToolUse?.(toolUse));
                  }
                }
                const usage = config.extractTokenUsage(event);
                if (stryMutAct_9fa48("3197") ? false : stryMutAct_9fa48("3196") ? true : (stryCov_9fa48("3196", "3197"), usage)) {
                  if (stryMutAct_9fa48("3198")) {
                    {}
                  } else {
                    stryCov_9fa48("3198");
                    tokenUsage = usage;
                  }
                }
              }
            });

            // ── Collect stderr ─────────────────────────────────
            if (stryMutAct_9fa48("3200") ? false : stryMutAct_9fa48("3199") ? true : (stryCov_9fa48("3199", "3200"), child.stderr)) {
              if (stryMutAct_9fa48("3201")) {
                {}
              } else {
                stryCov_9fa48("3201");
                child.stderr.on(stryMutAct_9fa48("3202") ? "" : (stryCov_9fa48("3202"), 'data'), d => {
                  if (stryMutAct_9fa48("3203")) {
                    {}
                  } else {
                    stryCov_9fa48("3203");
                    stryMutAct_9fa48("3204") ? stderr -= d.toString() : (stryCov_9fa48("3204"), stderr += d.toString());
                  }
                });
              }
            }

            // ── Finalize ───────────────────────────────────────
            function tryFinalize(): void {
              if (stryMutAct_9fa48("3205")) {
                {}
              } else {
                stryCov_9fa48("3205");
                if (stryMutAct_9fa48("3208") ? childExitCode === null && !rlClosed : stryMutAct_9fa48("3207") ? false : stryMutAct_9fa48("3206") ? true : (stryCov_9fa48("3206", "3207", "3208"), (stryMutAct_9fa48("3210") ? childExitCode !== null : stryMutAct_9fa48("3209") ? false : (stryCov_9fa48("3209", "3210"), childExitCode === null)) || (stryMutAct_9fa48("3211") ? rlClosed : (stryCov_9fa48("3211"), !rlClosed)))) return;
                if (stryMutAct_9fa48("3214") ? childExitCode === 0 : stryMutAct_9fa48("3213") ? false : stryMutAct_9fa48("3212") ? true : (stryCov_9fa48("3212", "3213", "3214"), childExitCode !== 0)) {
                  if (stryMutAct_9fa48("3215")) {
                    {}
                  } else {
                    stryCov_9fa48("3215");
                    // Enhanced error logging: explicitly indicate when no error output was captured
                    const errorDetail = stderr ? stryMutAct_9fa48("3216") ? `` : (stryCov_9fa48("3216"), `: ${stryMutAct_9fa48("3217") ? stderr : (stryCov_9fa48("3217"), stderr.trim())}`) : stryMutAct_9fa48("3218") ? "" : (stryCov_9fa48("3218"), ' (no error output captured - CLI may have crashed before producing diagnostics)');
                    log.error(stryMutAct_9fa48("3219") ? `` : (stryCov_9fa48("3219"), `CLI invocation failed: ${cliPath} ${argsWithFiles.join(stryMutAct_9fa48("3220") ? "" : (stryCov_9fa48("3220"), ' '))}`));
                    log.error(stryMutAct_9fa48("3221") ? `` : (stryCov_9fa48("3221"), `${cli} finished with exit code ${childExitCode}${errorDetail}`));
                    settle(stryMutAct_9fa48("3222") ? "" : (stryCov_9fa48("3222"), 'reject'), new InvokeError(stryMutAct_9fa48("3223") ? `` : (stryCov_9fa48("3223"), `${cli} exited with code ${childExitCode}${errorDetail}`), stryMutAct_9fa48("3224") ? {} : (stryCov_9fa48("3224"), {
                      type: stryMutAct_9fa48("3225") ? "" : (stryCov_9fa48("3225"), 'exit_error'),
                      cli,
                      code: childExitCode,
                      stderr
                    })));
                    return;
                  }
                }
                const finalSessionId = stryMutAct_9fa48("3228") ? capturedSessionId && sessionId : stryMutAct_9fa48("3227") ? false : stryMutAct_9fa48("3226") ? true : (stryCov_9fa48("3226", "3227", "3228"), capturedSessionId || sessionId);
                if (stryMutAct_9fa48("3231") ? options.sessionName || finalSessionId : stryMutAct_9fa48("3230") ? false : stryMutAct_9fa48("3229") ? true : (stryCov_9fa48("3229", "3230", "3231"), options.sessionName && finalSessionId)) {
                  if (stryMutAct_9fa48("3232")) {
                    {}
                  } else {
                    stryCov_9fa48("3232");
                    saveSession(options.sessionName, finalSessionId, cli);
                  }
                }
                log.info(stryMutAct_9fa48("3233") ? `` : (stryCov_9fa48("3233"), `${cli} finished successfully (${textChunks.join(stryMutAct_9fa48("3234") ? "Stryker was here!" : (stryCov_9fa48("3234"), '')).length} chars, ${toolCalls.length} tools)`));
                settle(stryMutAct_9fa48("3235") ? "" : (stryCov_9fa48("3235"), 'resolve'), stryMutAct_9fa48("3236") ? {} : (stryCov_9fa48("3236"), {
                  text: textChunks.join(stryMutAct_9fa48("3237") ? "Stryker was here!" : (stryCov_9fa48("3237"), '')),
                  sessionId: finalSessionId,
                  tokenUsage,
                  toolCalls
                }));
              }
            }
            rl.on(stryMutAct_9fa48("3238") ? "" : (stryCov_9fa48("3238"), 'close'), () => {
              if (stryMutAct_9fa48("3239")) {
                {}
              } else {
                stryCov_9fa48("3239");
                rlClosed = stryMutAct_9fa48("3240") ? false : (stryCov_9fa48("3240"), true);
                tryFinalize();
              }
            });
            child.on(stryMutAct_9fa48("3241") ? "" : (stryCov_9fa48("3241"), 'close'), code => {
              if (stryMutAct_9fa48("3242")) {
                {}
              } else {
                stryCov_9fa48("3242");
                childExitCode = stryMutAct_9fa48("3243") ? code && 1 : (stryCov_9fa48("3243"), code ?? 1);
                tryFinalize();
              }
            });
            child.on(stryMutAct_9fa48("3244") ? "" : (stryCov_9fa48("3244"), 'error'), err => {
              if (stryMutAct_9fa48("3245")) {
                {}
              } else {
                stryCov_9fa48("3245");
                stryMutAct_9fa48("3246") ? options.onError(err) : (stryCov_9fa48("3246"), options.onError?.(err));
                log.error(stryMutAct_9fa48("3247") ? `` : (stryCov_9fa48("3247"), `CLI spawn failed: ${cliPath} ${argsWithFiles.join(stryMutAct_9fa48("3248") ? "" : (stryCov_9fa48("3248"), ' '))}`));
                log.error(stryMutAct_9fa48("3249") ? `` : (stryCov_9fa48("3249"), `Error: ${err.message}`));
                settle(stryMutAct_9fa48("3250") ? "" : (stryCov_9fa48("3250"), 'reject'), new InvokeError(stryMutAct_9fa48("3251") ? `` : (stryCov_9fa48("3251"), `Failed to start ${cli}: ${err.message}`), stryMutAct_9fa48("3252") ? {} : (stryCov_9fa48("3252"), {
                  type: stryMutAct_9fa48("3253") ? "" : (stryCov_9fa48("3253"), 'spawn_error'),
                  cli
                })));
              }
            });
          }
        });
      }
    } finally {
      if (stryMutAct_9fa48("3254")) {
        {}
      } else {
        stryCov_9fa48("3254");
        releaseCLISlot();
        if (stryMutAct_9fa48("3258") ? tempFiles.length <= 0 : stryMutAct_9fa48("3257") ? tempFiles.length >= 0 : stryMutAct_9fa48("3256") ? false : stryMutAct_9fa48("3255") ? true : (stryCov_9fa48("3255", "3256", "3257", "3258"), tempFiles.length > 0)) {
          if (stryMutAct_9fa48("3259")) {
            {}
          } else {
            stryCov_9fa48("3259");
            cleanupTempFiles(tempFiles);
          }
        }
      }
    }
  }
}

/**
 * Health check: Verify if a CLI is working correctly by sending a simple test prompt.
 */
export async function verifyCLI(cli: SupportedCLI): Promise<boolean> {
  if (stryMutAct_9fa48("3260")) {
    {}
  } else {
    stryCov_9fa48("3260");
    try {
      if (stryMutAct_9fa48("3261")) {
        {}
      } else {
        stryCov_9fa48("3261");
        log.info(stryMutAct_9fa48("3262") ? `` : (stryCov_9fa48("3262"), `Health check: Verifying ${cli}...`));
        const result = await invoke(cli, stryMutAct_9fa48("3263") ? "" : (stryCov_9fa48("3263"), 'respond with "ok" and only "ok"'), stryMutAct_9fa48("3264") ? {} : (stryCov_9fa48("3264"), {
          idleTimeoutMs: 15000 // 15s timeout for health check
        }));
        const isHealthy = stryMutAct_9fa48("3265") ? result.text.toUpperCase().includes('ok') : (stryCov_9fa48("3265"), result.text.toLowerCase().includes(stryMutAct_9fa48("3266") ? "" : (stryCov_9fa48("3266"), 'ok')));
        if (stryMutAct_9fa48("3268") ? false : stryMutAct_9fa48("3267") ? true : (stryCov_9fa48("3267", "3268"), isHealthy)) {
          if (stryMutAct_9fa48("3269")) {
            {}
          } else {
            stryCov_9fa48("3269");
            log.info(stryMutAct_9fa48("3270") ? `` : (stryCov_9fa48("3270"), `Health check: ${cli} is healthy.`));
          }
        } else {
          if (stryMutAct_9fa48("3271")) {
            {}
          } else {
            stryCov_9fa48("3271");
            log.warn(stryMutAct_9fa48("3272") ? `` : (stryCov_9fa48("3272"), `Health check: ${cli} returned unexpected response: ${result.text}`));
          }
        }
        return isHealthy;
      }
    } catch (err) {
      if (stryMutAct_9fa48("3273")) {
        {}
      } else {
        stryCov_9fa48("3273");
        log.error(stryMutAct_9fa48("3274") ? `` : (stryCov_9fa48("3274"), `Health check: ${cli} is NOT healthy.`), (err as Error).message);
        return stryMutAct_9fa48("3275") ? true : (stryCov_9fa48("3275"), false);
      }
    }
  }
}