// @ts-nocheck
// ── Colony: Agent Runtime ────────────────────────────────
// Core agent loop: receives routed messages, assembles context,
// invokes LLM via CLI (which handles tool execution natively).
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
import * as fs from 'fs';
import * as path from 'path';
import { Logger } from '../utils/Logger.js';
import { EventBus } from '../utils/EventBus.js';
import { SkillManager } from './skills/SkillManager.js';
import { ModelRouter } from '../llm/ModelRouter.js';
import { ContextAssembler } from '../memory/ContextAssembler.js';
import { ShortTermMemory } from '../memory/ShortTermMemory.js';
import { ChatRoomManager } from '../conversation/ChatRoomManager.js';
import { SessionStore, getContextLimit } from '../session/SessionRecord.js';
import { TranscriptWriter } from '../session/TranscriptWriter.js';
import { logHealth, getHealthStatus } from '../session/ContextHealthBar.js';
import { SessionSealer, DEFAULT_SEAL_CONFIG } from '../session/SessionSealer.js';
import { DigestGenerator } from '../session/DigestGenerator.js';
import { SessionBootstrap } from '../session/SessionBootstrap.js';
import { MemoryClassifier } from '../memory/MemoryClassifier.js';
import type { AgentConfig, AgentStatus, Message } from '../types.js';
const log = new Logger(stryMutAct_9fa48("100") ? "" : (stryCov_9fa48("100"), 'Agent'));
interface AgentEventMap {
  'status_change': {
    agentId: string;
    status: AgentStatus;
  };
  'message_sent': Message;
}
export class Agent {
  readonly id: string;
  readonly name: string;
  readonly config: AgentConfig;
  readonly events = new EventBus<AgentEventMap>();
  private modelRouter: ModelRouter;
  private status: AgentStatus = stryMutAct_9fa48("101") ? "" : (stryCov_9fa48("101"), 'idle');
  private messageQueue: Message[] = stryMutAct_9fa48("102") ? ["Stryker was here"] : (stryCov_9fa48("102"), []);
  private processing = stryMutAct_9fa48("103") ? true : (stryCov_9fa48("103"), false);
  private lastProcessedTime = 0;

  // Session management
  private sessionStore: SessionStore;
  private transcriptWriter: TranscriptWriter;
  private sessionSealer: SessionSealer;
  private digestGenerator: DigestGenerator;
  private sessionBootstrap: SessionBootstrap;

  // Memory system
  private contextAssembler: ContextAssembler;
  private shortTermMemory: ShortTermMemory;
  private chatRoomManager: ChatRoomManager;
  private memoryClassifier = new MemoryClassifier();

  // Track active invocations per room
  private activeInvocations = new Map<string, AbortController>();
  constructor(config: AgentConfig, modelRouter: ModelRouter, contextAssembler: ContextAssembler, shortTermMemory: ShortTermMemory, chatRoomManager: ChatRoomManager) {
    if (stryMutAct_9fa48("104")) {
      {}
    } else {
      stryCov_9fa48("104");
      this.id = config.id;
      this.name = config.name;
      this.config = config;
      this.modelRouter = modelRouter;
      this.contextAssembler = contextAssembler;
      this.shortTermMemory = shortTermMemory;
      this.chatRoomManager = chatRoomManager;
      this.sessionStore = new SessionStore();
      this.transcriptWriter = new TranscriptWriter();
      this.sessionSealer = new SessionSealer(stryMutAct_9fa48("105") ? {} : (stryCov_9fa48("105"), {
        strategy: stryMutAct_9fa48("106") ? config.session.strategy : (stryCov_9fa48("106"), config.session?.strategy),
        thresholds: (stryMutAct_9fa48("107") ? config.session.thresholds : (stryCov_9fa48("107"), config.session?.thresholds)) ? stryMutAct_9fa48("108") ? {} : (stryCov_9fa48("108"), {
          warn: stryMutAct_9fa48("109") ? config.session.thresholds.warn && DEFAULT_SEAL_CONFIG.thresholds.warn : (stryCov_9fa48("109"), config.session.thresholds.warn ?? DEFAULT_SEAL_CONFIG.thresholds.warn),
          seal: stryMutAct_9fa48("110") ? config.session.thresholds.seal && DEFAULT_SEAL_CONFIG.thresholds.seal : (stryCov_9fa48("110"), config.session.thresholds.seal ?? DEFAULT_SEAL_CONFIG.thresholds.seal)
        }) : undefined
      }));
      this.digestGenerator = new DigestGenerator(this.transcriptWriter);
      this.sessionBootstrap = new SessionBootstrap();

      // Register this agent with the context assembler
      // Note: SkillManager is still used for context assembly (skill descriptions)
      // but actual skill execution is handled by CLI
      const skillManager = new SkillManager();
      this.contextAssembler.registerAgent(config, skillManager);
    }
  }

  // ── Public API ───────────────────────────────────────

  getStatus(): AgentStatus {
    if (stryMutAct_9fa48("111")) {
      {}
    } else {
      stryCov_9fa48("111");
      return this.status;
    }
  }

  /**
   * Cancel any active invocation for the given room.
   */
  abortRoomInvocation(roomId: string): void {
    if (stryMutAct_9fa48("112")) {
      {}
    } else {
      stryCov_9fa48("112");
      const controller = this.activeInvocations.get(roomId);
      if (stryMutAct_9fa48("114") ? false : stryMutAct_9fa48("113") ? true : (stryCov_9fa48("113", "114"), controller)) {
        if (stryMutAct_9fa48("115")) {
          {}
        } else {
          stryCov_9fa48("115");
          log.info(stryMutAct_9fa48("116") ? `` : (stryCov_9fa48("116"), `[${this.name}] Aborting invocation for room ${roomId}`));
          controller.abort();
          this.activeInvocations.delete(roomId);
          this.setStatus(stryMutAct_9fa48("117") ? "" : (stryCov_9fa48("117"), 'idle'));
        }
      }
    }
  }

  /**
   * Receive a message that has been routed to this agent.
   * The ChatRoom has already decided this agent should handle this message
   * (via @mention or default agent fallback).
   */
  async receiveMessage(message: Message): Promise<void> {
    if (stryMutAct_9fa48("118")) {
      {}
    } else {
      stryCov_9fa48("118");
      // Don't process own messages
      if (stryMutAct_9fa48("121") ? message.sender.id !== this.id : stryMutAct_9fa48("120") ? false : stryMutAct_9fa48("119") ? true : (stryCov_9fa48("119", "120", "121"), message.sender.id === this.id)) return;
      const isMentioned = message.mentions.includes(this.id);
      log.info(stryMutAct_9fa48("122") ? `` : (stryCov_9fa48("122"), `[${this.name}] Received routed message from ${message.sender.name}${isMentioned ? stryMutAct_9fa48("123") ? "" : (stryCov_9fa48("123"), ' (@mentioned)') : stryMutAct_9fa48("124") ? "" : (stryCov_9fa48("124"), ' (default)')}`));

      // Add message to short-term memory
      this.shortTermMemory.add(message.roomId, message);
      this.messageQueue.push(message);
      await this.processQueue();
    }
  }

  /**
   * Get the session health status for a specific room.
   * Returns a default empty health object if there is no active session.
   */
  getSessionHealth(roomId: string) {
    if (stryMutAct_9fa48("125")) {
      {}
    } else {
      stryCov_9fa48("125");
      const activeSession = this.sessionStore.getActive(this.id, roomId);
      if (stryMutAct_9fa48("128") ? false : stryMutAct_9fa48("127") ? true : stryMutAct_9fa48("126") ? activeSession : (stryCov_9fa48("126", "127", "128"), !activeSession)) {
        if (stryMutAct_9fa48("129")) {
          {}
        } else {
          stryCov_9fa48("129");
          return stryMutAct_9fa48("130") ? {} : (stryCov_9fa48("130"), {
            fillRatio: 0,
            tokensUsed: 0,
            contextLimit: getContextLimit(this.config.model.primary, stryMutAct_9fa48("131") ? this.config.session.contextLimit : (stryCov_9fa48("131"), this.config.session?.contextLimit)),
            invocationCount: 0,
            label: stryMutAct_9fa48("132") ? "" : (stryCov_9fa48("132"), '🟢 healthy'),
            chainIndex: 0
          });
        }
      }
      return getHealthStatus(activeSession);
    }
  }

  /**
   * Set the session ID for a specific room.
   */
  setRoomSession(roomId: string, sessionId: string): void {
    if (stryMutAct_9fa48("133")) {
      {}
    } else {
      stryCov_9fa48("133");
      // Create or update the session record in SessionStore
      const existing = this.sessionStore.getActive(this.id, roomId);
      if (stryMutAct_9fa48("136") ? false : stryMutAct_9fa48("135") ? true : stryMutAct_9fa48("134") ? existing : (stryCov_9fa48("134", "135", "136"), !existing)) {
        if (stryMutAct_9fa48("137")) {
          {}
        } else {
          stryCov_9fa48("137");
          this.sessionStore.create(stryMutAct_9fa48("138") ? {} : (stryCov_9fa48("138"), {
            id: sessionId,
            agentId: this.id,
            roomId,
            cli: this.config.model.primary
          }));
        }
      }
    }
  }

  // ── Internal Processing ──────────────────────────────

  private async processQueue(): Promise<void> {
    if (stryMutAct_9fa48("139")) {
      {}
    } else {
      stryCov_9fa48("139");
      if (stryMutAct_9fa48("141") ? false : stryMutAct_9fa48("140") ? true : (stryCov_9fa48("140", "141"), this.processing)) return;
      this.processing = stryMutAct_9fa48("142") ? false : (stryCov_9fa48("142"), true);
      try {
        if (stryMutAct_9fa48("143")) {
          {}
        } else {
          stryCov_9fa48("143");
          while (stryMutAct_9fa48("146") ? this.messageQueue.length <= 0 : stryMutAct_9fa48("145") ? this.messageQueue.length >= 0 : stryMutAct_9fa48("144") ? false : (stryCov_9fa48("144", "145", "146"), this.messageQueue.length > 0)) {
            if (stryMutAct_9fa48("147")) {
              {}
            } else {
              stryCov_9fa48("147");
              // Ensure at least 1s cooldown since last message finished
              const now = Date.now();
              const elapsed = stryMutAct_9fa48("148") ? now + this.lastProcessedTime : (stryCov_9fa48("148"), now - this.lastProcessedTime);
              if (stryMutAct_9fa48("152") ? elapsed >= 1000 : stryMutAct_9fa48("151") ? elapsed <= 1000 : stryMutAct_9fa48("150") ? false : stryMutAct_9fa48("149") ? true : (stryCov_9fa48("149", "150", "151", "152"), elapsed < 1000)) {
                if (stryMutAct_9fa48("153")) {
                  {}
                } else {
                  stryCov_9fa48("153");
                  const delay = stryMutAct_9fa48("154") ? 1000 + elapsed : (stryCov_9fa48("154"), 1000 - elapsed);
                  log.info(stryMutAct_9fa48("155") ? `` : (stryCov_9fa48("155"), `[${this.name}] Cooling down for ${delay}ms before processing next message...`));
                  await new Promise(stryMutAct_9fa48("156") ? () => undefined : (stryCov_9fa48("156"), resolve => setTimeout(resolve, delay)));
                }
              }
              const message = this.messageQueue.shift()!;
              try {
                if (stryMutAct_9fa48("157")) {
                  {}
                } else {
                  stryCov_9fa48("157");
                  await this.handleMessage(message);
                }
              } catch (error) {
                if (stryMutAct_9fa48("158")) {
                  {}
                } else {
                  stryCov_9fa48("158");
                  log.error(stryMutAct_9fa48("159") ? `` : (stryCov_9fa48("159"), `[${this.name}] Error handling message ${message.id}:`), error);
                }
              } finally {
                if (stryMutAct_9fa48("160")) {
                  {}
                } else {
                  stryCov_9fa48("160");
                  this.lastProcessedTime = Date.now();
                }
              }
            }
          }
        }
      } finally {
        if (stryMutAct_9fa48("161")) {
          {}
        } else {
          stryCov_9fa48("161");
          this.processing = stryMutAct_9fa48("162") ? true : (stryCov_9fa48("162"), false);
        }
      }
    }
  }

  /**
   * Maximum follow-up rounds when skills return data that needs
   * to be fed back to the LLM (e.g. get_messages → send_message).
   */
  private static readonly MAX_FOLLOW_UP_ROUNDS = 5;
  private async handleMessage(message: Message): Promise<void> {
    if (stryMutAct_9fa48("163")) {
      {}
    } else {
      stryCov_9fa48("163");
      this.setStatus(stryMutAct_9fa48("164") ? "" : (stryCov_9fa48("164"), 'thinking'));

      // Retrieve the ChatRoom instance outside try-catch to allow error logging
      const chatRoom = this.chatRoomManager.getRoom(message.roomId);
      if (stryMutAct_9fa48("167") ? false : stryMutAct_9fa48("166") ? true : stryMutAct_9fa48("165") ? chatRoom : (stryCov_9fa48("165", "166", "167"), !chatRoom)) {
        if (stryMutAct_9fa48("168")) {
          {}
        } else {
          stryCov_9fa48("168");
          log.error(stryMutAct_9fa48("169") ? `` : (stryCov_9fa48("169"), `[${this.name}] ChatRoom ${message.roomId} not found for message processing.`));
          this.setStatus(stryMutAct_9fa48("170") ? "" : (stryCov_9fa48("170"), 'error'));
          return;
        }
      }
      try {
        if (stryMutAct_9fa48("171")) {
          {}
        } else {
          stryCov_9fa48("171");
          const sessionName = stryMutAct_9fa48("172") ? `` : (stryCov_9fa48("172"), `agent-${this.id}-room-${message.roomId}`);
          let round = 0;

          // Setup working directory and skills symlinks if needed
          const workingDir = chatRoom.workingDir;
          if (stryMutAct_9fa48("174") ? false : stryMutAct_9fa48("173") ? true : (stryCov_9fa48("173", "174"), workingDir)) {
            if (stryMutAct_9fa48("175")) {
              {}
            } else {
              stryCov_9fa48("175");
              await this.ensureSkillsSymlinks(workingDir);
            }
          }

          // Use ContextAssembler to build the initial prompt
          let currentPrompt = await this.contextAssembler.assemble(stryMutAct_9fa48("176") ? {} : (stryCov_9fa48("176"), {
            agentId: this.id,
            roomId: message.roomId,
            currentMessage: message,
            tokenBudget: 32000,
            // Increased budget for better context retention
            includeHistory: stryMutAct_9fa48("177") ? false : (stryCov_9fa48("177"), true),
            includeLongTerm: stryMutAct_9fa48("178") ? false : (stryCov_9fa48("178"), true),
            // ✅ Enable long-term memory (Mem0)
            chatRoom: chatRoom // Pass the chatRoom instance
          }));
          while (stryMutAct_9fa48("181") ? round >= Agent.MAX_FOLLOW_UP_ROUNDS : stryMutAct_9fa48("180") ? round <= Agent.MAX_FOLLOW_UP_ROUNDS : stryMutAct_9fa48("179") ? false : (stryCov_9fa48("179", "180", "181"), round < Agent.MAX_FOLLOW_UP_ROUNDS)) {
            if (stryMutAct_9fa48("182")) {
              {}
            } else {
              stryCov_9fa48("182");
              stryMutAct_9fa48("183") ? round-- : (stryCov_9fa48("183"), round++);
              const activeSession = this.sessionStore.getActive(this.id, message.roomId);

              // ── Phase 2: Check if session needs sealing ──
              let promptForThisRound = currentPrompt;
              if (stryMutAct_9fa48("185") ? false : stryMutAct_9fa48("184") ? true : (stryCov_9fa48("184", "185"), activeSession)) {
                if (stryMutAct_9fa48("186")) {
                  {}
                } else {
                  stryCov_9fa48("186");
                  const action = this.sessionSealer.shouldTakeAction(activeSession);
                  if (stryMutAct_9fa48("189") ? action.type !== 'seal' : stryMutAct_9fa48("188") ? false : stryMutAct_9fa48("187") ? true : (stryCov_9fa48("187", "188", "189"), action.type === (stryMutAct_9fa48("190") ? "" : (stryCov_9fa48("190"), 'seal')))) {
                    if (stryMutAct_9fa48("191")) {
                      {}
                    } else {
                      stryCov_9fa48("191");
                      log.info(stryMutAct_9fa48("192") ? `` : (stryCov_9fa48("192"), `[${this.name}] Sealing session ${activeSession.id} (${(stryMutAct_9fa48("193") ? action.fillRatio / 100 : (stryCov_9fa48("193"), action.fillRatio * 100)).toFixed(1)}%)`));
                      const sealed = this.sessionStore.seal(this.id, message.roomId, activeSession.id);
                      if (stryMutAct_9fa48("195") ? false : stryMutAct_9fa48("194") ? true : (stryCov_9fa48("194", "195"), sealed)) {
                        if (stryMutAct_9fa48("196")) {
                          {}
                        } else {
                          stryCov_9fa48("196");
                          activeSession.status = stryMutAct_9fa48("197") ? "" : (stryCov_9fa48("197"), 'sealed'); // Invalidate active state so a new session is started
                          // Generate digest asynchronously (don't block the current invoke)
                          this.digestGenerator.generate(sealed).then(digest => {
                            if (stryMutAct_9fa48("198")) {
                              {}
                            } else {
                              stryCov_9fa48("198");
                              this.sessionStore.setDigest(this.id, message.roomId, sealed.id, digest);
                              log.info(stryMutAct_9fa48("199") ? `` : (stryCov_9fa48("199"), `[${this.name}] Digest stored for session ${sealed.id}`));
                            }
                          }).catch(err => {
                            if (stryMutAct_9fa48("200")) {
                              {}
                            } else {
                              stryCov_9fa48("200");
                              log.error(stryMutAct_9fa48("201") ? `` : (stryCov_9fa48("201"), `[${this.name}] Failed to generate digest:`), err);
                            }
                          });

                          // Inject bootstrap preamble: new session starts fresh (no --resume)
                          // Create a placeholder new record — it will get real ID after first invoke
                          promptForThisRound = this.sessionBootstrap.injectInto(currentPrompt, stryMutAct_9fa48("202") ? {} : (stryCov_9fa48("202"), {
                            ...activeSession,
                            chainIndex: stryMutAct_9fa48("203") ? activeSession.chainIndex - 1 : (stryCov_9fa48("203"), activeSession.chainIndex + 1),
                            id: stryMutAct_9fa48("204") ? "" : (stryCov_9fa48("204"), 'pending'),
                            status: stryMutAct_9fa48("205") ? "" : (stryCov_9fa48("205"), 'active'),
                            tokenUsage: stryMutAct_9fa48("206") ? {} : (stryCov_9fa48("206"), {
                              input: 0,
                              output: 0,
                              cacheRead: 0,
                              cacheCreation: 0,
                              cumulative: 0
                            }),
                            invocationCount: 0,
                            createdAt: new Date().toISOString(),
                            previousSessionId: activeSession.id
                          }), sealed);
                        }
                      }
                    }
                  } else if (stryMutAct_9fa48("209") ? action.type !== 'warn' : stryMutAct_9fa48("208") ? false : stryMutAct_9fa48("207") ? true : (stryCov_9fa48("207", "208", "209"), action.type === (stryMutAct_9fa48("210") ? "" : (stryCov_9fa48("210"), 'warn')))) {
                    if (stryMutAct_9fa48("211")) {
                      {}
                    } else {
                      stryCov_9fa48("211");
                      log.warn(stryMutAct_9fa48("212") ? `` : (stryCov_9fa48("212"), `[${this.name}] Context at ${(stryMutAct_9fa48("213") ? action.fillRatio / 100 : (stryCov_9fa48("213"), action.fillRatio * 100)).toFixed(1)}% — approaching seal threshold`));
                    }
                  }
                }
              }
              const existingSession = (stryMutAct_9fa48("216") ? activeSession?.status !== 'active' : stryMutAct_9fa48("215") ? false : stryMutAct_9fa48("214") ? true : (stryCov_9fa48("214", "215", "216"), (stryMutAct_9fa48("217") ? activeSession.status : (stryCov_9fa48("217"), activeSession?.status)) === (stryMutAct_9fa48("218") ? "" : (stryCov_9fa48("218"), 'active')))) ? activeSession.id : undefined;
              log.info(stryMutAct_9fa48("219") ? `` : (stryCov_9fa48("219"), `[${this.name}] Invoking LLM (round ${round}) for message from ${message.sender.name}...`));

              // Send a pending placeholder message — will be updated in-place
              const pendingMsg = chatRoom.sendAgentMessage(this.id, stryMutAct_9fa48("220") ? `` : (stryCov_9fa48("220"), `正在思考...`), stryMutAct_9fa48("221") ? ["Stryker was here"] : (stryCov_9fa48("221"), []), stryMutAct_9fa48("222") ? {} : (stryCov_9fa48("222"), {
                isMonologue: stryMutAct_9fa48("223") ? false : (stryCov_9fa48("223"), true),
                isPending: stryMutAct_9fa48("224") ? false : (stryCov_9fa48("224"), true)
              }));
              const pendingId = pendingMsg.id;
              const controller = new AbortController();
              this.activeInvocations.set(message.roomId, controller);
              try {
                if (stryMutAct_9fa48("225")) {
                  {}
                } else {
                  stryCov_9fa48("225");
                  const result = await this.modelRouter.invoke(this.config.model.primary, promptForThisRound, stryMutAct_9fa48("226") ? {} : (stryCov_9fa48("226"), {
                    sessionName,
                    sessionId: stryMutAct_9fa48("227") ? existingSession && undefined : (stryCov_9fa48("227"), existingSession ?? undefined),
                    cwd: workingDir,
                    // Set working directory for CLI
                    signal: controller.signal,
                    attachments: stryMutAct_9fa48("228") ? message.metadata.attachments : (stryCov_9fa48("228"), message.metadata?.attachments),
                    env: stryMutAct_9fa48("229") ? {} : (stryCov_9fa48("229"), {
                      COLONY_AGENT_ID: this.id,
                      COLONY_ROOM_ID: message.roomId,
                      COLONY_API: stryMutAct_9fa48("230") ? process.env.COLONY_API && 'http://localhost:3001' : (stryCov_9fa48("230"), process.env.COLONY_API ?? (stryMutAct_9fa48("231") ? "" : (stryCov_9fa48("231"), 'http://localhost:3001'))),
                      CLAUDE_CODE_SESSION_ACCESS_TOKEN: stryMutAct_9fa48("232") ? process.env.CLAUDE_CODE_SESSION_ACCESS_TOKEN && '' : (stryCov_9fa48("232"), process.env.CLAUDE_CODE_SESSION_ACCESS_TOKEN ?? (stryMutAct_9fa48("233") ? "Stryker was here!" : (stryCov_9fa48("233"), '')))
                    })
                  }), this.config.model.fallback, stryMutAct_9fa48("234") ? {} : (stryCov_9fa48("234"), {
                    onStatusUpdate: (statusMsg: string) => {
                      if (stryMutAct_9fa48("235")) {
                        {}
                      } else {
                        stryCov_9fa48("235");
                        // Update the pending message with status (e.g. "429, switching...")
                        chatRoom.updateMessage(pendingId, statusMsg, stryMutAct_9fa48("236") ? {} : (stryCov_9fa48("236"), {
                          isPending: stryMutAct_9fa48("237") ? false : (stryCov_9fa48("237"), true),
                          isMonologue: stryMutAct_9fa48("238") ? false : (stryCov_9fa48("238"), true)
                        }));
                      }
                    }
                  }));

                  // ── Log full raw LLM response for debugging ──
                  log.info(stryMutAct_9fa48("239") ? `` : (stryCov_9fa48("239"), `[${this.name}] ── LLM Response round ${round} (${result.text.length} chars) ──`));
                  log.info(stryMutAct_9fa48("240") ? `` : (stryCov_9fa48("240"), `[${this.name}] ${result.text}`));
                  log.info(stryMutAct_9fa48("241") ? `` : (stryCov_9fa48("241"), `[${this.name}] ── End Response ──`));

                  // Save session ID to SessionStore
                  if (stryMutAct_9fa48("243") ? false : stryMutAct_9fa48("242") ? true : (stryCov_9fa48("242", "243"), result.sessionId)) {
                    if (stryMutAct_9fa48("244")) {
                      {}
                    } else {
                      stryCov_9fa48("244");
                      const actualCli = stryMutAct_9fa48("245") ? result.actualModel && this.config.model.primary : (stryCov_9fa48("245"), result.actualModel ?? this.config.model.primary);
                      // Look up by exact session ID first, then fall back to any active
                      let existing = this.sessionStore.getBySessionId(this.id, message.roomId, result.sessionId);
                      if (stryMutAct_9fa48("248") ? false : stryMutAct_9fa48("247") ? true : stryMutAct_9fa48("246") ? existing : (stryCov_9fa48("246", "247", "248"), !existing)) {
                        if (stryMutAct_9fa48("249")) {
                          {}
                        } else {
                          stryCov_9fa48("249");
                          // New session ID (either first invocation or fallback model created one)
                          existing = this.sessionStore.create(stryMutAct_9fa48("250") ? {} : (stryCov_9fa48("250"), {
                            id: result.sessionId,
                            agentId: this.id,
                            roomId: message.roomId,
                            cli: actualCli
                          }));
                        }
                      }

                      // Record transcript entry
                      this.transcriptWriter.append(this.id, message.roomId, result.sessionId, stryMutAct_9fa48("251") ? {} : (stryCov_9fa48("251"), {
                        invocationIndex: stryMutAct_9fa48("252") ? (existing?.invocationCount ?? 0) - 1 : (stryCov_9fa48("252"), (stryMutAct_9fa48("253") ? existing?.invocationCount && 0 : (stryCov_9fa48("253"), (stryMutAct_9fa48("254") ? existing.invocationCount : (stryCov_9fa48("254"), existing?.invocationCount)) ?? 0)) + 1),
                        timestamp: new Date().toISOString(),
                        prompt: stryMutAct_9fa48("255") ? currentPrompt : (stryCov_9fa48("255"), currentPrompt.substring(0, 2000)),
                        response: result.text,
                        toolCalls: result.toolCalls,
                        tokenUsage: result.tokenUsage
                      }));

                      // Update token usage for this specific session and log context health
                      if (stryMutAct_9fa48("257") ? false : stryMutAct_9fa48("256") ? true : (stryCov_9fa48("256", "257"), result.tokenUsage)) {
                        if (stryMutAct_9fa48("258")) {
                          {}
                        } else {
                          stryCov_9fa48("258");
                          const updated = this.sessionStore.updateUsage(this.id, message.roomId, result.tokenUsage, result.sessionId);
                          if (stryMutAct_9fa48("260") ? false : stryMutAct_9fa48("259") ? true : (stryCov_9fa48("259", "260"), updated)) {
                            if (stryMutAct_9fa48("261")) {
                              {}
                            } else {
                              stryCov_9fa48("261");
                              logHealth(this.name, updated);
                            }
                          }
                        }
                      }
                    }
                  }

                  // Update pending message with actual response content
                  if (stryMutAct_9fa48("264") ? result.text && result.toolCalls && result.toolCalls.length > 0 : stryMutAct_9fa48("263") ? false : stryMutAct_9fa48("262") ? true : (stryCov_9fa48("262", "263", "264"), result.text || (stryMutAct_9fa48("266") ? result.toolCalls || result.toolCalls.length > 0 : stryMutAct_9fa48("265") ? false : (stryCov_9fa48("265", "266"), result.toolCalls && (stryMutAct_9fa48("269") ? result.toolCalls.length <= 0 : stryMutAct_9fa48("268") ? result.toolCalls.length >= 0 : stryMutAct_9fa48("267") ? true : (stryCov_9fa48("267", "268", "269"), result.toolCalls.length > 0)))))) {
                    if (stryMutAct_9fa48("270")) {
                      {}
                    } else {
                      stryCov_9fa48("270");
                      chatRoom.updateMessage(pendingId, stryMutAct_9fa48("273") ? result.text && '(Silent Execution)' : stryMutAct_9fa48("272") ? false : stryMutAct_9fa48("271") ? true : (stryCov_9fa48("271", "272", "273"), result.text || (stryMutAct_9fa48("274") ? "" : (stryCov_9fa48("274"), '(Silent Execution)'))), stryMutAct_9fa48("275") ? {} : (stryCov_9fa48("275"), {
                        isMonologue: stryMutAct_9fa48("276") ? false : (stryCov_9fa48("276"), true),
                        isPending: stryMutAct_9fa48("277") ? true : (stryCov_9fa48("277"), false),
                        toolCalls: stryMutAct_9fa48("280") ? result.toolCalls && [] : stryMutAct_9fa48("279") ? false : stryMutAct_9fa48("278") ? true : (stryCov_9fa48("278", "279", "280"), result.toolCalls || (stryMutAct_9fa48("281") ? ["Stryker was here"] : (stryCov_9fa48("281"), [])))
                      }));
                    }
                  } else {
                    if (stryMutAct_9fa48("282")) {
                      {}
                    } else {
                      stryCov_9fa48("282");
                      // No content — just clear pending state
                      chatRoom.updateMessage(pendingId, stryMutAct_9fa48("283") ? "" : (stryCov_9fa48("283"), '(无输出)'), stryMutAct_9fa48("284") ? {} : (stryCov_9fa48("284"), {
                        isMonologue: stryMutAct_9fa48("285") ? false : (stryCov_9fa48("285"), true),
                        isPending: stryMutAct_9fa48("286") ? true : (stryCov_9fa48("286"), false)
                      }));
                    }
                  }

                  // Check if CLI executed any tools
                  const toolCalls = stryMutAct_9fa48("289") ? result.toolCalls && [] : stryMutAct_9fa48("288") ? false : stryMutAct_9fa48("287") ? true : (stryCov_9fa48("287", "288", "289"), result.toolCalls || (stryMutAct_9fa48("290") ? ["Stryker was here"] : (stryCov_9fa48("290"), [])));
                  const hasSendMessage = stryMutAct_9fa48("291") ? toolCalls.every(t => {
                    const name = t.name?.toLowerCase() ?? '';
                    const input = t.input ?? {};
                    // 1. Direct name match
                    if (name === 'send-message' || name === 'send_message') return true;
                    // 2. CLI 'Skill' wrapper — check known input field variants
                    if (name === 'skill' || name === 'activate_skill') {
                      const skillName = (input.name ?? input.skill ?? input.skill_name ?? '') as string;
                      if (skillName.includes('send-message') || skillName.includes('send_message')) return true;
                    }
                    // 3. Bash/shell tool executing handler.sh
                    if (name === 'bash' || name === 'shell' || name === 'run_shell_command') {
                      const cmd = (input.command ?? input.cmd ?? input.script ?? '') as string;
                      if (cmd.includes('send-message') || cmd.includes('handler.sh')) return true;
                    }
                    // 4. Fallback: deep search the entire input JSON for send-message
                    try {
                      const inputStr = JSON.stringify(input).toLowerCase();
                      if (inputStr.includes('send-message') || inputStr.includes('send_message')) return true;
                    } catch {/* ignore */}
                    return false;
                  }) : (stryCov_9fa48("291"), toolCalls.some(t => {
                    if (stryMutAct_9fa48("292")) {
                      {}
                    } else {
                      stryCov_9fa48("292");
                      const name = stryMutAct_9fa48("293") ? t.name?.toLowerCase() && '' : (stryCov_9fa48("293"), (stryMutAct_9fa48("295") ? t.name.toLowerCase() : stryMutAct_9fa48("294") ? t.name?.toUpperCase() : (stryCov_9fa48("294", "295"), t.name?.toLowerCase())) ?? (stryMutAct_9fa48("296") ? "Stryker was here!" : (stryCov_9fa48("296"), '')));
                      const input = stryMutAct_9fa48("297") ? t.input && {} : (stryCov_9fa48("297"), t.input ?? {});
                      // 1. Direct name match
                      if (stryMutAct_9fa48("300") ? name === 'send-message' && name === 'send_message' : stryMutAct_9fa48("299") ? false : stryMutAct_9fa48("298") ? true : (stryCov_9fa48("298", "299", "300"), (stryMutAct_9fa48("302") ? name !== 'send-message' : stryMutAct_9fa48("301") ? false : (stryCov_9fa48("301", "302"), name === (stryMutAct_9fa48("303") ? "" : (stryCov_9fa48("303"), 'send-message')))) || (stryMutAct_9fa48("305") ? name !== 'send_message' : stryMutAct_9fa48("304") ? false : (stryCov_9fa48("304", "305"), name === (stryMutAct_9fa48("306") ? "" : (stryCov_9fa48("306"), 'send_message')))))) return stryMutAct_9fa48("307") ? false : (stryCov_9fa48("307"), true);
                      // 2. CLI 'Skill' wrapper — check known input field variants
                      if (stryMutAct_9fa48("310") ? name === 'skill' && name === 'activate_skill' : stryMutAct_9fa48("309") ? false : stryMutAct_9fa48("308") ? true : (stryCov_9fa48("308", "309", "310"), (stryMutAct_9fa48("312") ? name !== 'skill' : stryMutAct_9fa48("311") ? false : (stryCov_9fa48("311", "312"), name === (stryMutAct_9fa48("313") ? "" : (stryCov_9fa48("313"), 'skill')))) || (stryMutAct_9fa48("315") ? name !== 'activate_skill' : stryMutAct_9fa48("314") ? false : (stryCov_9fa48("314", "315"), name === (stryMutAct_9fa48("316") ? "" : (stryCov_9fa48("316"), 'activate_skill')))))) {
                        if (stryMutAct_9fa48("317")) {
                          {}
                        } else {
                          stryCov_9fa48("317");
                          const skillName = (input.name ?? input.skill ?? input.skill_name ?? '') as string;
                          if (stryMutAct_9fa48("320") ? skillName.includes('send-message') && skillName.includes('send_message') : stryMutAct_9fa48("319") ? false : stryMutAct_9fa48("318") ? true : (stryCov_9fa48("318", "319", "320"), skillName.includes(stryMutAct_9fa48("321") ? "" : (stryCov_9fa48("321"), 'send-message')) || skillName.includes(stryMutAct_9fa48("322") ? "" : (stryCov_9fa48("322"), 'send_message')))) return stryMutAct_9fa48("323") ? false : (stryCov_9fa48("323"), true);
                        }
                      }
                      // 3. Bash/shell tool executing handler.sh
                      if (stryMutAct_9fa48("326") ? (name === 'bash' || name === 'shell') && name === 'run_shell_command' : stryMutAct_9fa48("325") ? false : stryMutAct_9fa48("324") ? true : (stryCov_9fa48("324", "325", "326"), (stryMutAct_9fa48("328") ? name === 'bash' && name === 'shell' : stryMutAct_9fa48("327") ? false : (stryCov_9fa48("327", "328"), (stryMutAct_9fa48("330") ? name !== 'bash' : stryMutAct_9fa48("329") ? false : (stryCov_9fa48("329", "330"), name === (stryMutAct_9fa48("331") ? "" : (stryCov_9fa48("331"), 'bash')))) || (stryMutAct_9fa48("333") ? name !== 'shell' : stryMutAct_9fa48("332") ? false : (stryCov_9fa48("332", "333"), name === (stryMutAct_9fa48("334") ? "" : (stryCov_9fa48("334"), 'shell')))))) || (stryMutAct_9fa48("336") ? name !== 'run_shell_command' : stryMutAct_9fa48("335") ? false : (stryCov_9fa48("335", "336"), name === (stryMutAct_9fa48("337") ? "" : (stryCov_9fa48("337"), 'run_shell_command')))))) {
                        if (stryMutAct_9fa48("338")) {
                          {}
                        } else {
                          stryCov_9fa48("338");
                          const cmd = (input.command ?? input.cmd ?? input.script ?? '') as string;
                          if (stryMutAct_9fa48("341") ? cmd.includes('send-message') && cmd.includes('handler.sh') : stryMutAct_9fa48("340") ? false : stryMutAct_9fa48("339") ? true : (stryCov_9fa48("339", "340", "341"), cmd.includes(stryMutAct_9fa48("342") ? "" : (stryCov_9fa48("342"), 'send-message')) || cmd.includes(stryMutAct_9fa48("343") ? "" : (stryCov_9fa48("343"), 'handler.sh')))) return stryMutAct_9fa48("344") ? false : (stryCov_9fa48("344"), true);
                        }
                      }
                      // 4. Fallback: deep search the entire input JSON for send-message
                      try {
                        if (stryMutAct_9fa48("345")) {
                          {}
                        } else {
                          stryCov_9fa48("345");
                          const inputStr = stryMutAct_9fa48("346") ? JSON.stringify(input).toUpperCase() : (stryCov_9fa48("346"), JSON.stringify(input).toLowerCase());
                          if (stryMutAct_9fa48("349") ? inputStr.includes('send-message') && inputStr.includes('send_message') : stryMutAct_9fa48("348") ? false : stryMutAct_9fa48("347") ? true : (stryCov_9fa48("347", "348", "349"), inputStr.includes(stryMutAct_9fa48("350") ? "" : (stryCov_9fa48("350"), 'send-message')) || inputStr.includes(stryMutAct_9fa48("351") ? "" : (stryCov_9fa48("351"), 'send_message')))) return stryMutAct_9fa48("352") ? false : (stryCov_9fa48("352"), true);
                        }
                      } catch {/* ignore */}
                      return stryMutAct_9fa48("353") ? true : (stryCov_9fa48("353"), false);
                    }
                  }));
                  if (stryMutAct_9fa48("356") ? !hasSendMessage || toolCalls.length > 0 : stryMutAct_9fa48("355") ? false : stryMutAct_9fa48("354") ? true : (stryCov_9fa48("354", "355", "356"), (stryMutAct_9fa48("357") ? hasSendMessage : (stryCov_9fa48("357"), !hasSendMessage)) && (stryMutAct_9fa48("360") ? toolCalls.length <= 0 : stryMutAct_9fa48("359") ? toolCalls.length >= 0 : stryMutAct_9fa48("358") ? true : (stryCov_9fa48("358", "359", "360"), toolCalls.length > 0)))) {
                    if (stryMutAct_9fa48("361")) {
                      {}
                    } else {
                      stryCov_9fa48("361");
                      log.debug(stryMutAct_9fa48("362") ? `` : (stryCov_9fa48("362"), `[${this.name}] Tool call details: ${JSON.stringify(toolCalls.map(stryMutAct_9fa48("363") ? () => undefined : (stryCov_9fa48("363"), t => stryMutAct_9fa48("364") ? {} : (stryCov_9fa48("364"), {
                        name: t.name,
                        input: t.input
                      }))))}`));
                    }
                  }
                  if (stryMutAct_9fa48("366") ? false : stryMutAct_9fa48("365") ? true : (stryCov_9fa48("365", "366"), hasSendMessage)) {
                    if (stryMutAct_9fa48("367")) {
                      {}
                    } else {
                      stryCov_9fa48("367");
                      // Agent has spoken - done with this message
                      await this.storeToLongTermMemory(message, result.text);
                      break;
                    }
                  }
                  if (stryMutAct_9fa48("370") ? toolCalls.length !== 0 : stryMutAct_9fa48("369") ? false : stryMutAct_9fa48("368") ? true : (stryCov_9fa48("368", "369", "370"), toolCalls.length === 0)) {
                    if (stryMutAct_9fa48("371")) {
                      {}
                    } else {
                      stryCov_9fa48("371");
                      // No tools called AND no message sent? 
                      // This usually means the LLM just gave a text response without using send-message.
                      // We'll consider this done to avoid infinite loops, though ideally they should speak.
                      await this.storeToLongTermMemory(message, result.text);
                      break;
                    }
                  }

                  // Tools were called but no send-message. 
                  // Continue to next round to let LLM see tool outputs and potentially speak.
                  log.info(stryMutAct_9fa48("372") ? `` : (stryCov_9fa48("372"), `[${this.name}] Tools called (${toolCalls.map(stryMutAct_9fa48("373") ? () => undefined : (stryCov_9fa48("373"), t => t.name)).join(stryMutAct_9fa48("374") ? "" : (stryCov_9fa48("374"), ', '))}), continuing to round ${stryMutAct_9fa48("375") ? round - 1 : (stryCov_9fa48("375"), round + 1)}...`));

                  // Tell the agent why it's being re-invoked
                  currentPrompt = stryMutAct_9fa48("376") ? `` : (stryCov_9fa48("376"), `[系统提示] 你在上一轮执行了以下工具：${toolCalls.map(stryMutAct_9fa48("377") ? () => undefined : (stryCov_9fa48("377"), t => t.name)).join(stryMutAct_9fa48("378") ? "" : (stryCov_9fa48("378"), ', '))}，但没有调用 send-message 发送回复。用户看不到你的内心独白，你必须调用 send-message 工具将你的分析结果或回复发送出去。请现在就调用 send-message。`);
                  continue;
                }
              } catch (innerErr) {
                if (stryMutAct_9fa48("379")) {
                  {}
                } else {
                  stryCov_9fa48("379");
                  const innerErrMsg = stryMutAct_9fa48("380") ? (innerErr as Error).message && '' : (stryCov_9fa48("380"), (innerErr as Error).message ?? (stryMutAct_9fa48("381") ? "Stryker was here!" : (stryCov_9fa48("381"), '')));

                  // ONLY check the signal itself — don't match error text to avoid
                  // false positives from CLI errors that contain the word 'aborted'.
                  if (stryMutAct_9fa48("383") ? false : stryMutAct_9fa48("382") ? true : (stryCov_9fa48("382", "383"), controller.signal.aborted)) {
                    if (stryMutAct_9fa48("384")) {
                      {}
                    } else {
                      stryCov_9fa48("384");
                      // Clear stale session so next message starts fresh
                      // Session aborted — don't delete, let it resume next time
                      chatRoom.updateMessage(pendingId, stryMutAct_9fa48("385") ? `` : (stryCov_9fa48("385"), `⏹️ 已停止执行`), stryMutAct_9fa48("386") ? {} : (stryCov_9fa48("386"), {
                        isMonologue: stryMutAct_9fa48("387") ? false : (stryCov_9fa48("387"), true),
                        isPending: stryMutAct_9fa48("388") ? true : (stryCov_9fa48("388"), false)
                      }));
                      this.setStatus(stryMutAct_9fa48("389") ? "" : (stryCov_9fa48("389"), 'idle'));
                      return;
                    }
                  }
                  if (stryMutAct_9fa48("392") ? (innerErrMsg.includes('exhausted') || innerErrMsg.includes('rate') || innerErrMsg.includes('429')) && innerErrMsg.includes('capacity') : stryMutAct_9fa48("391") ? false : stryMutAct_9fa48("390") ? true : (stryCov_9fa48("390", "391", "392"), (stryMutAct_9fa48("394") ? (innerErrMsg.includes('exhausted') || innerErrMsg.includes('rate')) && innerErrMsg.includes('429') : stryMutAct_9fa48("393") ? false : (stryCov_9fa48("393", "394"), (stryMutAct_9fa48("396") ? innerErrMsg.includes('exhausted') && innerErrMsg.includes('rate') : stryMutAct_9fa48("395") ? false : (stryCov_9fa48("395", "396"), innerErrMsg.includes(stryMutAct_9fa48("397") ? "" : (stryCov_9fa48("397"), 'exhausted')) || innerErrMsg.includes(stryMutAct_9fa48("398") ? "" : (stryCov_9fa48("398"), 'rate')))) || innerErrMsg.includes(stryMutAct_9fa48("399") ? "" : (stryCov_9fa48("399"), '429')))) || innerErrMsg.includes(stryMutAct_9fa48("400") ? "" : (stryCov_9fa48("400"), 'capacity')))) {
                    if (stryMutAct_9fa48("401")) {
                      {}
                    } else {
                      stryCov_9fa48("401");
                      chatRoom.updateMessage(pendingId, stryMutAct_9fa48("402") ? `` : (stryCov_9fa48("402"), `⚠️ 模型调用受限: ${innerErrMsg}`), stryMutAct_9fa48("403") ? {} : (stryCov_9fa48("403"), {
                        isMonologue: stryMutAct_9fa48("404") ? false : (stryCov_9fa48("404"), true),
                        isPending: stryMutAct_9fa48("405") ? true : (stryCov_9fa48("405"), false),
                        error: innerErrMsg
                      }));
                      this.setStatus(stryMutAct_9fa48("406") ? "" : (stryCov_9fa48("406"), 'rate_limited'));
                      return;
                    }
                  }

                  // Other errors — update pending and re-throw to outer catch
                  chatRoom.updateMessage(pendingId, stryMutAct_9fa48("407") ? `` : (stryCov_9fa48("407"), `❌ 调用出错: ${innerErrMsg}`), stryMutAct_9fa48("408") ? {} : (stryCov_9fa48("408"), {
                    isMonologue: stryMutAct_9fa48("409") ? false : (stryCov_9fa48("409"), true),
                    isPending: stryMutAct_9fa48("410") ? true : (stryCov_9fa48("410"), false),
                    error: innerErrMsg
                  }));
                  throw innerErr;
                }
              } finally {
                if (stryMutAct_9fa48("411")) {
                  {}
                } else {
                  stryCov_9fa48("411");
                  this.activeInvocations.delete(message.roomId);
                }
              }
            }
          }
        }
      } catch (err) {
        if (stryMutAct_9fa48("412")) {
          {}
        } else {
          stryCov_9fa48("412");
          log.error(stryMutAct_9fa48("413") ? `` : (stryCov_9fa48("413"), `[${this.name}] Error handling message:`), err);
          this.setStatus(stryMutAct_9fa48("414") ? "" : (stryCov_9fa48("414"), 'error'));
          const errMsg = stryMutAct_9fa48("415") ? (err as Error).message && '' : (stryCov_9fa48("415"), (err as Error).message ?? (stryMutAct_9fa48("416") ? "Stryker was here!" : (stryCov_9fa48("416"), '')));
          stryMutAct_9fa48("417") ? chatRoom.sendAgentMessage(this.id, `❌ 调用出错: ${errMsg}`, [], {
            isMonologue: true,
            error: errMsg
          } as any) : (stryCov_9fa48("417"), chatRoom?.sendAgentMessage(this.id, stryMutAct_9fa48("418") ? `` : (stryCov_9fa48("418"), `❌ 调用出错: ${errMsg}`), stryMutAct_9fa48("419") ? ["Stryker was here"] : (stryCov_9fa48("419"), []), {
            isMonologue: true,
            error: errMsg
          } as any));
          return;
        }
      }
      this.setStatus(stryMutAct_9fa48("420") ? "" : (stryCov_9fa48("420"), 'idle'));
    }
  }

  /**
   * Store important context to long-term memory.
   */
  private async storeToLongTermMemory(message: Message, response: string): Promise<void> {
    if (stryMutAct_9fa48("421")) {
      {}
    } else {
      stryCov_9fa48("421");
      const longTermMemory = (this.contextAssembler as any).longTermMemory;
      if (stryMutAct_9fa48("424") ? false : stryMutAct_9fa48("423") ? true : stryMutAct_9fa48("422") ? longTermMemory : (stryCov_9fa48("422", "423", "424"), !longTermMemory)) {
        if (stryMutAct_9fa48("425")) {
          {}
        } else {
          stryCov_9fa48("425");
          return; // Long-term memory not enabled
        }
      }

      // Run classification and storage in background
      Promise.resolve().then(async () => {
        if (stryMutAct_9fa48("426")) {
          {}
        } else {
          stryCov_9fa48("426");
          try {
            if (stryMutAct_9fa48("427")) {
              {}
            } else {
              stryCov_9fa48("427");
              // Classify the memory
              const classification = this.memoryClassifier.classify(message, response);

              // Combine user message and agent response for context
              const conversationContext = stryMutAct_9fa48("428") ? `` : (stryCov_9fa48("428"), `用户 (${message.sender.name}): ${message.content}\n\n${this.name}: ${response}`);

              // Get current workflow stage if in workflow
              const workflowStage = await this.getCurrentWorkflowStage(message.roomId);
              await longTermMemory.retain(stryMutAct_9fa48("429") ? {} : (stryCov_9fa48("429"), {
                content: conversationContext,
                context: message,
                metadata: stryMutAct_9fa48("430") ? {} : (stryCov_9fa48("430"), {
                  type: 'conversation' as const,
                  subtype: classification.subtype,
                  importance: classification.importance,
                  agentId: this.id,
                  roomId: message.roomId,
                  tags: stryMutAct_9fa48("431") ? [] : (stryCov_9fa48("431"), [this.name, message.sender.name]),
                  participants: stryMutAct_9fa48("432") ? [] : (stryCov_9fa48("432"), [message.sender.id, this.id]),
                  workflowStage
                }),
                timestamp: new Date()
              }));
              log.debug(stryMutAct_9fa48("433") ? `` : (stryCov_9fa48("433"), `[${this.name}] Stored conversation to long-term memory (subtype: ${classification.subtype}, importance: ${classification.importance})`));
            }
          } catch (error) {
            if (stryMutAct_9fa48("434")) {
              {}
            } else {
              stryCov_9fa48("434");
              log.error(stryMutAct_9fa48("435") ? `` : (stryCov_9fa48("435"), `[${this.name}] Failed to store to long-term memory:`), error);
            }
          }
        }
      });
    }
  }

  /**
   * Helper to get current workflow stage for a room.
   */
  private async getCurrentWorkflowStage(roomId: string): Promise<number | undefined> {
    if (stryMutAct_9fa48("436")) {
      {}
    } else {
      stryCov_9fa48("436");
      try {
        if (stryMutAct_9fa48("437")) {
          {}
        } else {
          stryCov_9fa48("437");
          const workflowDir = path.join(process.cwd(), stryMutAct_9fa48("438") ? "" : (stryCov_9fa48("438"), '.data/workflows'));
          const workflowFile = path.join(workflowDir, stryMutAct_9fa48("439") ? `` : (stryCov_9fa48("439"), `${roomId}.json`));
          if (stryMutAct_9fa48("442") ? false : stryMutAct_9fa48("441") ? true : stryMutAct_9fa48("440") ? fs.existsSync(workflowFile) : (stryCov_9fa48("440", "441", "442"), !fs.existsSync(workflowFile))) return undefined;
          const data = fs.readFileSync(workflowFile, stryMutAct_9fa48("443") ? "" : (stryCov_9fa48("443"), 'utf8'));
          const workflow = JSON.parse(data);
          return workflow.current_stage;
        }
      } catch (error) {
        if (stryMutAct_9fa48("444")) {
          {}
        } else {
          stryCov_9fa48("444");
          log.warn(stryMutAct_9fa48("445") ? `` : (stryCov_9fa48("445"), `Failed to read workflow stage for room ${roomId}:`), error);
          return undefined;
        }
      }
    }
  }

  /**
   * Ensure skills symlinks exist in the working directory.
   * Creates .claude/skills and .gemini/skills pointing to Colony's skills directory.
   */
  private async ensureSkillsSymlinks(workingDir: string): Promise<void> {
    if (stryMutAct_9fa48("446")) {
      {}
    } else {
      stryCov_9fa48("446");
      const colonySkillsDir = path.join(process.cwd(), stryMutAct_9fa48("447") ? "" : (stryCov_9fa48("447"), 'skills'));

      // Check if Colony skills directory exists
      if (stryMutAct_9fa48("450") ? false : stryMutAct_9fa48("449") ? true : stryMutAct_9fa48("448") ? fs.existsSync(colonySkillsDir) : (stryCov_9fa48("448", "449", "450"), !fs.existsSync(colonySkillsDir))) {
        if (stryMutAct_9fa48("451")) {
          {}
        } else {
          stryCov_9fa48("451");
          log.warn(stryMutAct_9fa48("452") ? `` : (stryCov_9fa48("452"), `Colony skills directory not found: ${colonySkillsDir}`));
          return;
        }
      }

      // Ensure working directory exists
      if (stryMutAct_9fa48("455") ? false : stryMutAct_9fa48("454") ? true : stryMutAct_9fa48("453") ? fs.existsSync(workingDir) : (stryCov_9fa48("453", "454", "455"), !fs.existsSync(workingDir))) {
        if (stryMutAct_9fa48("456")) {
          {}
        } else {
          stryCov_9fa48("456");
          log.warn(stryMutAct_9fa48("457") ? `` : (stryCov_9fa48("457"), `Working directory does not exist: ${workingDir}`));
          return;
        }
      }

      // Create symlinks for both Claude and Gemini
      for (const cliDir of stryMutAct_9fa48("458") ? [] : (stryCov_9fa48("458"), [stryMutAct_9fa48("459") ? "" : (stryCov_9fa48("459"), '.claude'), stryMutAct_9fa48("460") ? "" : (stryCov_9fa48("460"), '.gemini')])) {
        if (stryMutAct_9fa48("461")) {
          {}
        } else {
          stryCov_9fa48("461");
          const targetDir = path.join(workingDir, cliDir);
          const skillsLink = path.join(targetDir, stryMutAct_9fa48("462") ? "" : (stryCov_9fa48("462"), 'skills'));
          try {
            if (stryMutAct_9fa48("463")) {
              {}
            } else {
              stryCov_9fa48("463");
              // Create CLI directory if it doesn't exist
              if (stryMutAct_9fa48("466") ? false : stryMutAct_9fa48("465") ? true : stryMutAct_9fa48("464") ? fs.existsSync(targetDir) : (stryCov_9fa48("464", "465", "466"), !fs.existsSync(targetDir))) {
                if (stryMutAct_9fa48("467")) {
                  {}
                } else {
                  stryCov_9fa48("467");
                  fs.mkdirSync(targetDir, stryMutAct_9fa48("468") ? {} : (stryCov_9fa48("468"), {
                    recursive: stryMutAct_9fa48("469") ? false : (stryCov_9fa48("469"), true)
                  }));
                }
              }

              // Check if symlink already exists and is valid
              if (stryMutAct_9fa48("471") ? false : stryMutAct_9fa48("470") ? true : (stryCov_9fa48("470", "471"), fs.existsSync(skillsLink))) {
                if (stryMutAct_9fa48("472")) {
                  {}
                } else {
                  stryCov_9fa48("472");
                  const stats = fs.lstatSync(skillsLink);
                  if (stryMutAct_9fa48("474") ? false : stryMutAct_9fa48("473") ? true : (stryCov_9fa48("473", "474"), stats.isSymbolicLink())) {
                    if (stryMutAct_9fa48("475")) {
                      {}
                    } else {
                      stryCov_9fa48("475");
                      const linkTarget = fs.readlinkSync(skillsLink);
                      if (stryMutAct_9fa48("478") ? path.resolve(workingDir, linkTarget) !== colonySkillsDir : stryMutAct_9fa48("477") ? false : stryMutAct_9fa48("476") ? true : (stryCov_9fa48("476", "477", "478"), path.resolve(workingDir, linkTarget) === colonySkillsDir)) {
                        if (stryMutAct_9fa48("479")) {
                          {}
                        } else {
                          stryCov_9fa48("479");
                          // Symlink already correct
                          continue;
                        }
                      }
                      // Remove incorrect symlink
                      fs.unlinkSync(skillsLink);
                    }
                  } else {
                    if (stryMutAct_9fa48("480")) {
                      {}
                    } else {
                      stryCov_9fa48("480");
                      log.warn(stryMutAct_9fa48("481") ? `` : (stryCov_9fa48("481"), `${skillsLink} exists but is not a symlink, skipping`));
                      continue;
                    }
                  }
                }
              }

              // Create symlink
              fs.symlinkSync(colonySkillsDir, skillsLink, stryMutAct_9fa48("482") ? "" : (stryCov_9fa48("482"), 'dir'));
              log.info(stryMutAct_9fa48("483") ? `` : (stryCov_9fa48("483"), `Created skills symlink: ${skillsLink} -> ${colonySkillsDir}`));
            }
          } catch (error) {
            if (stryMutAct_9fa48("484")) {
              {}
            } else {
              stryCov_9fa48("484");
              log.error(stryMutAct_9fa48("485") ? `` : (stryCov_9fa48("485"), `Failed to create skills symlink for ${cliDir}:`), error);
            }
          }
        }
      }
    }
  }
  private setStatus(status: AgentStatus): void {
    if (stryMutAct_9fa48("486")) {
      {}
    } else {
      stryCov_9fa48("486");
      if (stryMutAct_9fa48("489") ? this.status !== status : stryMutAct_9fa48("488") ? false : stryMutAct_9fa48("487") ? true : (stryCov_9fa48("487", "488", "489"), this.status === status)) return;
      this.status = status;
      this.events.emit(stryMutAct_9fa48("490") ? "" : (stryCov_9fa48("490"), 'status_change'), stryMutAct_9fa48("491") ? {} : (stryCov_9fa48("491"), {
        agentId: this.id,
        status
      }));
    }
  }
}