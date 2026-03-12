// @ts-nocheck
// ── Colony: Main Entry Point ─────────────────────────────
// Bootstraps the multi-agent system: loads configs, creates agents,
// sets up message routing, and exposes the top-level API.
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
import * as path from 'path';
import * as fs from 'fs';
import * as yaml from 'yaml';
import { Logger } from './utils/Logger.js';
import { RateLimitManager } from './llm/RateLimitManager.js';
import { ModelRouter } from './llm/ModelRouter.js';
import { AgentRegistry } from './agent/AgentRegistry.js';
import { MessageBus } from './conversation/MessageBus.js';
import { ChatRoomManager } from './conversation/ChatRoomManager.js';
import { SessionManager } from './conversation/SessionManager.js';
import { ShortTermMemory, ContextAssembler, ContextScheduler } from './memory/index.js';
import { Mem0LongTermMemory } from './memory/Mem0LongTermMemory.js';
import { DiscordManager } from './discord/index.js';
import type { Participant } from './types.js';
import type { LongTermMemory } from './memory/types.js';
import type { Mem0Config } from './memory/Mem0LongTermMemory.js';
const log = new Logger(stryMutAct_9fa48("0") ? "" : (stryCov_9fa48("0"), 'Colony'));
export interface ColonyOptions {
  agentConfigDir?: string;
  dataDir?: string;
  enableLongTermMemory?: boolean;
  mem0ConfigPath?: string;
  enableDiscord?: boolean;
  discordConfigPath?: string;
}
export class Colony {
  readonly messageBus: MessageBus;
  readonly agentRegistry: AgentRegistry;
  readonly chatRoomManager: ChatRoomManager;
  readonly rateLimitManager: RateLimitManager;
  readonly sessionManager: SessionManager;
  readonly shortTermMemory: ShortTermMemory;
  readonly longTermMemory?: LongTermMemory;
  readonly contextAssembler: ContextAssembler;
  readonly contextScheduler: ContextScheduler;
  readonly discordManager?: DiscordManager;
  private modelRouter: ModelRouter;
  constructor(options: ColonyOptions = {}) {
    if (stryMutAct_9fa48("1")) {
      {}
    } else {
      stryCov_9fa48("1");
      const agentConfigDir = stryMutAct_9fa48("2") ? options.agentConfigDir && path.join(process.cwd(), 'config', 'agents') : (stryCov_9fa48("2"), options.agentConfigDir ?? path.join(process.cwd(), stryMutAct_9fa48("3") ? "" : (stryCov_9fa48("3"), 'config'), stryMutAct_9fa48("4") ? "" : (stryCov_9fa48("4"), 'agents')));
      const dataDir = stryMutAct_9fa48("5") ? options.dataDir && path.join(process.cwd(), '.data', 'sessions') : (stryCov_9fa48("5"), options.dataDir ?? path.join(process.cwd(), stryMutAct_9fa48("6") ? "" : (stryCov_9fa48("6"), '.data'), stryMutAct_9fa48("7") ? "" : (stryCov_9fa48("7"), 'sessions')));
      const mem0ConfigPath = stryMutAct_9fa48("8") ? options.mem0ConfigPath && path.join(process.cwd(), 'config', 'mem0.yaml') : (stryCov_9fa48("8"), options.mem0ConfigPath ?? path.join(process.cwd(), stryMutAct_9fa48("9") ? "" : (stryCov_9fa48("9"), 'config'), stryMutAct_9fa48("10") ? "" : (stryCov_9fa48("10"), 'mem0.yaml')));
      const discordConfigPath = stryMutAct_9fa48("11") ? options.discordConfigPath && path.join(process.cwd(), 'config', 'discord.yaml') : (stryCov_9fa48("11"), options.discordConfigPath ?? path.join(process.cwd(), stryMutAct_9fa48("12") ? "" : (stryCov_9fa48("12"), 'config'), stryMutAct_9fa48("13") ? "" : (stryCov_9fa48("13"), 'discord.yaml')));

      // Initialize memory system
      this.shortTermMemory = new ShortTermMemory(stryMutAct_9fa48("14") ? {} : (stryCov_9fa48("14"), {
        windowSize: 50,
        maxTokens: 4000,
        compressionThreshold: 0.8
      }));

      // Initialize long-term memory if enabled (async initialization deferred)
      if (stryMutAct_9fa48("17") ? options.enableLongTermMemory !== false || fs.existsSync(mem0ConfigPath) : stryMutAct_9fa48("16") ? false : stryMutAct_9fa48("15") ? true : (stryCov_9fa48("15", "16", "17"), (stryMutAct_9fa48("19") ? options.enableLongTermMemory === false : stryMutAct_9fa48("18") ? true : (stryCov_9fa48("18", "19"), options.enableLongTermMemory !== (stryMutAct_9fa48("20") ? true : (stryCov_9fa48("20"), false)))) && fs.existsSync(mem0ConfigPath))) {
        if (stryMutAct_9fa48("21")) {
          {}
        } else {
          stryCov_9fa48("21");
          try {
            if (stryMutAct_9fa48("22")) {
              {}
            } else {
              stryCov_9fa48("22");
              log.info(stryMutAct_9fa48("23") ? "" : (stryCov_9fa48("23"), 'Loading Mem0 configuration...'));

              // Load Mem0 configuration from YAML
              const configContent = fs.readFileSync(mem0ConfigPath, stryMutAct_9fa48("24") ? "" : (stryCov_9fa48("24"), 'utf-8'));
              const mem0Config = yaml.parse(configContent) as Mem0Config;
              this.longTermMemory = new Mem0LongTermMemory(mem0Config);
              log.info(stryMutAct_9fa48("25") ? "" : (stryCov_9fa48("25"), 'Mem0 long-term memory created (will initialize on first use)'));
            }
          } catch (error) {
            if (stryMutAct_9fa48("26")) {
              {}
            } else {
              stryCov_9fa48("26");
              log.error(stryMutAct_9fa48("27") ? "" : (stryCov_9fa48("27"), 'Failed to load Mem0 configuration:'), error);
              log.warn(stryMutAct_9fa48("28") ? "" : (stryCov_9fa48("28"), 'Continuing without long-term memory'));
            }
          }
        }
      }
      this.contextAssembler = new ContextAssembler(this.shortTermMemory, this.longTermMemory);
      this.contextScheduler = new ContextScheduler(this.shortTermMemory);

      // Initialize components
      this.rateLimitManager = new RateLimitManager();
      this.modelRouter = new ModelRouter(this.rateLimitManager);
      this.messageBus = new MessageBus();
      this.sessionManager = new SessionManager(dataDir);

      // Initialize chatRoomManager first (needed by agentRegistry)
      this.chatRoomManager = new ChatRoomManager(this.messageBus, null as any,
      // Will be set after agentRegistry is created
      this.sessionManager);

      // Now initialize agentRegistry with chatRoomManager
      this.agentRegistry = new AgentRegistry(this.modelRouter, this.contextAssembler, this.shortTermMemory, this.chatRoomManager);

      // Set agentRegistry in chatRoomManager
      (this.chatRoomManager as any).agentRegistry = this.agentRegistry;

      // Load agent configs
      const agents = this.agentRegistry.loadFromDirectory(agentConfigDir);
      log.info(stryMutAct_9fa48("29") ? `` : (stryCov_9fa48("29"), `Colony initialized with ${agents.length} agents`));

      // Initialize Discord integration if enabled
      if (stryMutAct_9fa48("32") ? options.enableDiscord !== false || fs.existsSync(discordConfigPath) : stryMutAct_9fa48("31") ? false : stryMutAct_9fa48("30") ? true : (stryCov_9fa48("30", "31", "32"), (stryMutAct_9fa48("34") ? options.enableDiscord === false : stryMutAct_9fa48("33") ? true : (stryCov_9fa48("33", "34"), options.enableDiscord !== (stryMutAct_9fa48("35") ? true : (stryCov_9fa48("35"), false)))) && fs.existsSync(discordConfigPath))) {
        if (stryMutAct_9fa48("36")) {
          {}
        } else {
          stryCov_9fa48("36");
          try {
            if (stryMutAct_9fa48("37")) {
              {}
            } else {
              stryCov_9fa48("37");
              log.info(stryMutAct_9fa48("38") ? "" : (stryCov_9fa48("38"), 'Initializing Discord integration...'));
              this.discordManager = new DiscordManager(this, discordConfigPath);
              log.info(stryMutAct_9fa48("39") ? "" : (stryCov_9fa48("39"), 'Discord integration initialized'));
            }
          } catch (error) {
            if (stryMutAct_9fa48("40")) {
              {}
            } else {
              stryCov_9fa48("40");
              log.error(stryMutAct_9fa48("41") ? "" : (stryCov_9fa48("41"), 'Failed to initialize Discord:'), error);
              log.warn(stryMutAct_9fa48("42") ? "" : (stryCov_9fa48("42"), 'Continuing without Discord integration'));
            }
          }
        }
      }

      // Forward rate limit events
      this.rateLimitManager.events.on(stryMutAct_9fa48("43") ? "" : (stryCov_9fa48("43"), 'quota_exhausted'), ({
        model
      }) => {
        if (stryMutAct_9fa48("44")) {
          {}
        } else {
          stryCov_9fa48("44");
          log.warn(stryMutAct_9fa48("45") ? `` : (stryCov_9fa48("45"), `Quota exhausted for model: ${model}`));
          this.messageBus.events.emit(stryMutAct_9fa48("46") ? "" : (stryCov_9fa48("46"), 'colony_event'), stryMutAct_9fa48("47") ? {} : (stryCov_9fa48("47"), {
            type: stryMutAct_9fa48("48") ? "" : (stryCov_9fa48("48"), 'rate_limit'),
            model,
            remaining: 0,
            total: 0
          }));
        }
      });
    }
  }

  /**
   * Initialize Colony (restore saved sessions, verify CLI health, and start Discord).
   */
  async initialize(): Promise<void> {
    if (stryMutAct_9fa48("49")) {
      {}
    } else {
      stryCov_9fa48("49");
      // Restore saved sessions
      await this.chatRoomManager.restoreAllSessions();

      // Verify CLI health for all agents
      log.info(stryMutAct_9fa48("50") ? "" : (stryCov_9fa48("50"), 'Environment check: Verifying CLI health for agents...'));
      await this.agentRegistry.verifyAllAgents();

      // Start Discord integration if enabled
      if (stryMutAct_9fa48("52") ? false : stryMutAct_9fa48("51") ? true : (stryCov_9fa48("51", "52"), this.discordManager)) {
        if (stryMutAct_9fa48("53")) {
          {}
        } else {
          stryCov_9fa48("53");
          await this.discordManager.start();
        }
      }
    }
  }

  /**
   * Create a new chat session with agents.
   * @param workingDir - Optional working directory for CLI tools (defaults to current directory)
   * @param options - Optional flags (e.g. skipDiscordSync)
   */
  createSession(name: string, agentIds?: string[], workingDir?: string, options: {
    skipDiscordSync?: boolean;
  } = {}): string {
    if (stryMutAct_9fa48("54")) {
      {}
    } else {
      stryCov_9fa48("54");
      const room = this.chatRoomManager.createRoom(name, agentIds, workingDir);

      // Sync to Discord: create a bound channel for this session (fire-and-forget)
      if (stryMutAct_9fa48("57") ? this.discordManager || !options.skipDiscordSync : stryMutAct_9fa48("56") ? false : stryMutAct_9fa48("55") ? true : (stryCov_9fa48("55", "56", "57"), this.discordManager && (stryMutAct_9fa48("58") ? options.skipDiscordSync : (stryCov_9fa48("58"), !options.skipDiscordSync)))) {
        if (stryMutAct_9fa48("59")) {
          {}
        } else {
          stryCov_9fa48("59");
          const agentNames = stryMutAct_9fa48("60") ? room.getInfo().participants.map(p => p.name) : (stryCov_9fa48("60"), room.getInfo().participants.filter(stryMutAct_9fa48("61") ? () => undefined : (stryCov_9fa48("61"), p => stryMutAct_9fa48("64") ? p.type !== 'agent' : stryMutAct_9fa48("63") ? false : stryMutAct_9fa48("62") ? true : (stryCov_9fa48("62", "63", "64"), p.type === (stryMutAct_9fa48("65") ? "" : (stryCov_9fa48("65"), 'agent'))))).map(stryMutAct_9fa48("66") ? () => undefined : (stryCov_9fa48("66"), p => p.name)));
          this.discordManager.createChannelForSession(room.id, name, agentNames).catch(stryMutAct_9fa48("67") ? () => undefined : (stryCov_9fa48("67"), err => log.warn(stryMutAct_9fa48("68") ? `` : (stryCov_9fa48("68"), `Discord channel sync failed for session "${name}":`), err)));
        }
      }
      return room.id;
    }
  }

  /**
   * Delete a session and cascade-delete the bound Discord channel (if any).
   */
  async deleteSession(sessionId: string): Promise<boolean> {
    if (stryMutAct_9fa48("69")) {
      {}
    } else {
      stryCov_9fa48("69");
      // Cascade: delete Discord channel first, before removing session record
      if (stryMutAct_9fa48("71") ? false : stryMutAct_9fa48("70") ? true : (stryCov_9fa48("70", "71"), this.discordManager)) {
        if (stryMutAct_9fa48("72")) {
          {}
        } else {
          stryCov_9fa48("72");
          await this.discordManager.deleteChannelForSession(sessionId).catch(stryMutAct_9fa48("73") ? () => undefined : (stryCov_9fa48("73"), err => log.warn(stryMutAct_9fa48("74") ? `` : (stryCov_9fa48("74"), `Discord channel cleanup failed for session "${sessionId}":`), err)));
        }
      }
      return this.chatRoomManager.deleteRoom(sessionId);
    }
  }

  /**
   * Send a message from a human into a room.
   */
  sendMessage(roomId: string, senderId: string, content: string, mentions?: string[]): void {
    if (stryMutAct_9fa48("75")) {
      {}
    } else {
      stryCov_9fa48("75");
      const room = this.chatRoomManager.getRoom(roomId);
      if (stryMutAct_9fa48("78") ? false : stryMutAct_9fa48("77") ? true : stryMutAct_9fa48("76") ? room : (stryCov_9fa48("76", "77", "78"), !room)) throw new Error(stryMutAct_9fa48("79") ? `` : (stryCov_9fa48("79"), `Room not found: ${roomId}`));
      room.sendHumanMessage(senderId, content, mentions);
    }
  }

  /**
   * Add a human participant to a room.
   */
  joinSession(roomId: string, participant: Participant): void {
    if (stryMutAct_9fa48("80")) {
      {}
    } else {
      stryCov_9fa48("80");
      this.chatRoomManager.joinRoom(roomId, participant);
    }
  }

  /**
   * Update agents for a session.
   * @param sessionId - Session ID to update
   * @param agentIds - New list of agent IDs or names
   */
  async updateSessionAgents(sessionId: string, agentIds: string[]): Promise<void> {
    if (stryMutAct_9fa48("81")) {
      {}
    } else {
      stryCov_9fa48("81");
      log.info(stryMutAct_9fa48("82") ? `` : (stryCov_9fa48("82"), `Updating agents for session ${sessionId}...`));

      // 1. Update ChatRoom
      this.chatRoomManager.updateRoomAgents(sessionId, agentIds);

      // 2. Persist change
      await this.chatRoomManager.saveRoom(sessionId);

      // 3. Sync to Discord if applicable
      if (stryMutAct_9fa48("84") ? false : stryMutAct_9fa48("83") ? true : (stryCov_9fa48("83", "84"), this.discordManager)) {
        if (stryMutAct_9fa48("85")) {
          {}
        } else {
          stryCov_9fa48("85");
          const room = this.chatRoomManager.getRoom(sessionId);
          if (stryMutAct_9fa48("87") ? false : stryMutAct_9fa48("86") ? true : (stryCov_9fa48("86", "87"), room)) {
            if (stryMutAct_9fa48("88")) {
              {}
            } else {
              stryCov_9fa48("88");
              const agentNames = stryMutAct_9fa48("89") ? room.getInfo().participants.map(p => p.name) : (stryCov_9fa48("89"), room.getInfo().participants.filter(stryMutAct_9fa48("90") ? () => undefined : (stryCov_9fa48("90"), p => stryMutAct_9fa48("93") ? p.type !== 'agent' : stryMutAct_9fa48("92") ? false : stryMutAct_9fa48("91") ? true : (stryCov_9fa48("91", "92", "93"), p.type === (stryMutAct_9fa48("94") ? "" : (stryCov_9fa48("94"), 'agent'))))).map(stryMutAct_9fa48("95") ? () => undefined : (stryCov_9fa48("95"), p => p.name)));
              await this.discordManager.getBot().updateChannelTopic(sessionId, agentNames).catch(stryMutAct_9fa48("96") ? () => undefined : (stryCov_9fa48("96"), err => log.warn(stryMutAct_9fa48("97") ? `` : (stryCov_9fa48("97"), `Discord topic sync failed for session ${sessionId}:`), err)));
            }
          }
        }
      }
    }
  }

  /**
   * Get status summary.
   */
  getStatus(): object {
    if (stryMutAct_9fa48("98")) {
      {}
    } else {
      stryCov_9fa48("98");
      return stryMutAct_9fa48("99") ? {} : (stryCov_9fa48("99"), {
        agents: this.agentRegistry.getStatusSummary(),
        rooms: this.chatRoomManager.listRooms(),
        rateLimits: this.rateLimitManager.getAllStatus()
      });
    }
  }
}
export default Colony;