// @ts-nocheck
// ── Colony: Chat Room ────────────────────────────────────
// A chat room where agents and humans communicate.
// Layered message routing:
//   1. Explicit @mention → route to specified agent(s)
//   2. No @mention → route to the default agent
//   3. Non-routed agents can fetch messages via get_messages skill
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
import { randomUUID as uuid } from 'crypto';
import { Logger } from '../utils/Logger.js';
import { MessageBus } from './MessageBus.js';
import type { Agent } from '../agent/Agent.js';
import type { Message, Participant, ChatRoomInfo } from '../types.js';
const log = new Logger(stryMutAct_9fa48("941") ? "" : (stryCov_9fa48("941"), 'ChatRoom'));
export class ChatRoom {
  readonly id: string;
  readonly name: string;
  readonly createdAt: Date;
  readonly workingDir?: string;
  private agents = new Map<string, Agent>();
  private agentsByName = new Map<string, Agent>(); // name → agent for @name routing
  private humanParticipants = new Map<string, Participant>();
  private messageHistory: Message[] = stryMutAct_9fa48("942") ? ["Stryker was here"] : (stryCov_9fa48("942"), []);
  private messageBus: MessageBus;
  private unsubscribers: (() => void)[] = stryMutAct_9fa48("943") ? ["Stryker was here"] : (stryCov_9fa48("943"), []);
  private defaultAgentId: string | null = null;
  private autoSaveCallback?: (roomId: string) => Promise<void>;
  private isPaused: boolean = stryMutAct_9fa48("944") ? true : (stryCov_9fa48("944"), false);
  constructor(name: string, messageBus: MessageBus, id?: string, workingDir?: string) {
    if (stryMutAct_9fa48("945")) {
      {}
    } else {
      stryCov_9fa48("945");
      this.id = stryMutAct_9fa48("946") ? id && uuid() : (stryCov_9fa48("946"), id ?? uuid());
      this.name = name;
      this.createdAt = new Date();
      this.messageBus = messageBus;
      this.workingDir = workingDir;

      // Subscribe to messages on this room via the bus
      const unsub = this.messageBus.subscribe(this.id, message => {
        if (stryMutAct_9fa48("947")) {
          {}
        } else {
          stryCov_9fa48("947");
          this.onMessage(message);
        }
      });
      this.unsubscribers.push(unsub);
      log.info(stryMutAct_9fa48("948") ? `` : (stryCov_9fa48("948"), `ChatRoom created: "${name}" (${this.id})`));
    }
  }

  // ── Participant Management ───────────────────────────

  /**
   * Add an agent to this room.
   */
  addAgent(agent: Agent): void {
    if (stryMutAct_9fa48("949")) {
      {}
    } else {
      stryCov_9fa48("949");
      if (stryMutAct_9fa48("951") ? false : stryMutAct_9fa48("950") ? true : (stryCov_9fa48("950", "951"), this.agents.has(agent.id))) return;
      this.agents.set(agent.id, agent);
      this.agentsByName.set(agent.name, agent);

      // Auto-detect default agent from config
      if (stryMutAct_9fa48("953") ? false : stryMutAct_9fa48("952") ? true : (stryCov_9fa48("952", "953"), agent.config.isDefault)) {
        if (stryMutAct_9fa48("954")) {
          {}
        } else {
          stryCov_9fa48("954");
          this.setDefaultAgent(agent.id);
        }
      }
      log.info(stryMutAct_9fa48("955") ? `` : (stryCov_9fa48("955"), `Agent "${agent.name}" joined room "${this.name}"`));
    }
  }

  /**
   * Get all active agents in this room.
   */
  getAgents(): Agent[] {
    if (stryMutAct_9fa48("956")) {
      {}
    } else {
      stryCov_9fa48("956");
      return Array.from(this.agents.values());
    }
  }

  /**
   * Remove an agent from this room.
   */
  removeAgent(agentId: string): void {
    if (stryMutAct_9fa48("957")) {
      {}
    } else {
      stryCov_9fa48("957");
      const agent = this.agents.get(agentId);
      if (stryMutAct_9fa48("959") ? false : stryMutAct_9fa48("958") ? true : (stryCov_9fa48("958", "959"), agent)) {
        if (stryMutAct_9fa48("960")) {
          {}
        } else {
          stryCov_9fa48("960");
          this.agentsByName.delete(agent.name);
        }
      }
      this.agents.delete(agentId);
      if (stryMutAct_9fa48("963") ? this.defaultAgentId !== agentId : stryMutAct_9fa48("962") ? false : stryMutAct_9fa48("961") ? true : (stryCov_9fa48("961", "962", "963"), this.defaultAgentId === agentId)) {
        if (stryMutAct_9fa48("964")) {
          {}
        } else {
          stryCov_9fa48("964");
          this.defaultAgentId = null;
        }
      }
    }
  }

  /**
   * Set the default agent for this room (receives messages when no @ is used).
   */
  setDefaultAgent(agentId: string): void {
    if (stryMutAct_9fa48("965")) {
      {}
    } else {
      stryCov_9fa48("965");
      if (stryMutAct_9fa48("968") ? false : stryMutAct_9fa48("967") ? true : stryMutAct_9fa48("966") ? this.agents.has(agentId) : (stryCov_9fa48("966", "967", "968"), !this.agents.has(agentId))) {
        if (stryMutAct_9fa48("969")) {
          {}
        } else {
          stryCov_9fa48("969");
          throw new Error(stryMutAct_9fa48("970") ? `` : (stryCov_9fa48("970"), `Agent "${agentId}" is not in this room`));
        }
      }
      this.defaultAgentId = agentId;
      log.info(stryMutAct_9fa48("971") ? `` : (stryCov_9fa48("971"), `Default agent for room "${this.name}": ${agentId}`));
    }
  }

  /**
   * Add a human participant.
   */
  addHuman(participant: Participant): void {
    if (stryMutAct_9fa48("972")) {
      {}
    } else {
      stryCov_9fa48("972");
      this.humanParticipants.set(participant.id, participant);
      log.info(stryMutAct_9fa48("973") ? `` : (stryCov_9fa48("973"), `Human "${participant.name}" joined room "${this.name}"`));
    }
  }

  /**
   * Remove a human participant.
   */
  removeHuman(participantId: string): void {
    if (stryMutAct_9fa48("974")) {
      {}
    } else {
      stryCov_9fa48("974");
      this.humanParticipants.delete(participantId);
    }
  }

  // ── Mention Resolution ──────────────────────────────

  /**
   * Resolve a mention string to an agent.
   * Matches by name first (e.g. @开发者), then by ID (e.g. @developer).
   */
  private resolveAgentMention(mention: string): Agent | undefined {
    if (stryMutAct_9fa48("975")) {
      {}
    } else {
      stryCov_9fa48("975");
      return stryMutAct_9fa48("976") ? this.agentsByName.get(mention) && this.agents.get(mention) : (stryCov_9fa48("976"), this.agentsByName.get(mention) ?? this.agents.get(mention));
    }
  }

  /**
   * Parse @mentions from message content text.
   * Extracts all @xxx tokens and resolves them to agent IDs.
   */
  private parseMentionsFromContent(content: string): string[] {
    if (stryMutAct_9fa48("977")) {
      {}
    } else {
      stryCov_9fa48("977");
      const mentionRegex = stryMutAct_9fa48("979") ? /@(\s+)/g : stryMutAct_9fa48("978") ? /@(\S)/g : (stryCov_9fa48("978", "979"), /@(\S+)/g);
      const resolved: string[] = stryMutAct_9fa48("980") ? ["Stryker was here"] : (stryCov_9fa48("980"), []);
      let match;
      while (stryMutAct_9fa48("982") ? (match = mentionRegex.exec(content)) === null : stryMutAct_9fa48("981") ? false : (stryCov_9fa48("981", "982"), (match = mentionRegex.exec(content)) !== null)) {
        if (stryMutAct_9fa48("983")) {
          {}
        } else {
          stryCov_9fa48("983");
          const agent = this.resolveAgentMention(match[1]);
          if (stryMutAct_9fa48("985") ? false : stryMutAct_9fa48("984") ? true : (stryCov_9fa48("984", "985"), agent)) {
            if (stryMutAct_9fa48("986")) {
              {}
            } else {
              stryCov_9fa48("986");
              resolved.push(agent.id);
            }
          }
        }
      }
      return resolved;
    }
  }

  // ── Messaging ────────────────────────────────────────

  /**
   * Send a message from a human into this room (publishes through bus).
   * The `mentions` param can contain agent names OR IDs — both work.
   */
  sendHumanMessage(senderId: string, content: string, mentions?: string[], metadata?: Message['metadata']): Message {
    if (stryMutAct_9fa48("987")) {
      {}
    } else {
      stryCov_9fa48("987");
      const sender = this.humanParticipants.get(senderId);
      if (stryMutAct_9fa48("990") ? false : stryMutAct_9fa48("989") ? true : stryMutAct_9fa48("988") ? sender : (stryCov_9fa48("988", "989", "990"), !sender)) {
        if (stryMutAct_9fa48("991")) {
          {}
        } else {
          stryCov_9fa48("991");
          throw new Error(stryMutAct_9fa48("992") ? `` : (stryCov_9fa48("992"), `Human "${senderId}" is not in this room`));
        }
      }

      // Resolve mentions: use provided list, or auto-parse from content
      let resolvedMentionIds: string[] = stryMutAct_9fa48("993") ? ["Stryker was here"] : (stryCov_9fa48("993"), []);
      if (stryMutAct_9fa48("996") ? mentions || mentions.length > 0 : stryMutAct_9fa48("995") ? false : stryMutAct_9fa48("994") ? true : (stryCov_9fa48("994", "995", "996"), mentions && (stryMutAct_9fa48("999") ? mentions.length <= 0 : stryMutAct_9fa48("998") ? mentions.length >= 0 : stryMutAct_9fa48("997") ? true : (stryCov_9fa48("997", "998", "999"), mentions.length > 0)))) {
        if (stryMutAct_9fa48("1000")) {
          {}
        } else {
          stryCov_9fa48("1000");
          // Resolve each mention by name or ID
          for (const m of mentions) {
            if (stryMutAct_9fa48("1001")) {
              {}
            } else {
              stryCov_9fa48("1001");
              const agent = this.resolveAgentMention(m);
              if (stryMutAct_9fa48("1003") ? false : stryMutAct_9fa48("1002") ? true : (stryCov_9fa48("1002", "1003"), agent)) resolvedMentionIds.push(agent.id);
            }
          }
        }
      }
      // Also parse from content to catch any @name in the text
      const parsedFromContent = this.parseMentionsFromContent(content);
      // Merge & deduplicate
      resolvedMentionIds = stryMutAct_9fa48("1004") ? [] : (stryCov_9fa48("1004"), [...new Set(stryMutAct_9fa48("1005") ? [] : (stryCov_9fa48("1005"), [...resolvedMentionIds, ...parsedFromContent]))]);
      const message: Message = stryMutAct_9fa48("1006") ? {} : (stryCov_9fa48("1006"), {
        id: uuid(),
        roomId: this.id,
        sender,
        content,
        mentions: resolvedMentionIds,
        timestamp: new Date(),
        ...(metadata ? stryMutAct_9fa48("1007") ? {} : (stryCov_9fa48("1007"), {
          metadata
        }) : {})
      });
      this.messageBus.publish(message);
      return message;
    }
  }

  /**
   * Send a message as an agent into this room (used by CLI skill scripts).
   * The agent must belong to this room.
   */
  sendAgentMessage(agentId: string, content: string, mentions?: string[], metadata?: Message['metadata']): Message {
    if (stryMutAct_9fa48("1008")) {
      {}
    } else {
      stryCov_9fa48("1008");
      const agent = this.agents.get(agentId);
      if (stryMutAct_9fa48("1011") ? false : stryMutAct_9fa48("1010") ? true : stryMutAct_9fa48("1009") ? agent : (stryCov_9fa48("1009", "1010", "1011"), !agent)) {
        if (stryMutAct_9fa48("1012")) {
          {}
        } else {
          stryCov_9fa48("1012");
          throw new Error(stryMutAct_9fa48("1013") ? `` : (stryCov_9fa48("1013"), `Agent "${agentId}" is not in this room`));
        }
      }
      let resolvedMentionIds: string[] = stryMutAct_9fa48("1014") ? ["Stryker was here"] : (stryCov_9fa48("1014"), []);
      if (stryMutAct_9fa48("1017") ? mentions || mentions.length > 0 : stryMutAct_9fa48("1016") ? false : stryMutAct_9fa48("1015") ? true : (stryCov_9fa48("1015", "1016", "1017"), mentions && (stryMutAct_9fa48("1020") ? mentions.length <= 0 : stryMutAct_9fa48("1019") ? mentions.length >= 0 : stryMutAct_9fa48("1018") ? true : (stryCov_9fa48("1018", "1019", "1020"), mentions.length > 0)))) {
        if (stryMutAct_9fa48("1021")) {
          {}
        } else {
          stryCov_9fa48("1021");
          for (const m of mentions) {
            if (stryMutAct_9fa48("1022")) {
              {}
            } else {
              stryCov_9fa48("1022");
              const resolved = this.resolveAgentMention(m);
              if (stryMutAct_9fa48("1024") ? false : stryMutAct_9fa48("1023") ? true : (stryCov_9fa48("1023", "1024"), resolved)) resolvedMentionIds.push(resolved.id);
            }
          }
        }
      }
      const parsedFromContent = this.parseMentionsFromContent(content);
      resolvedMentionIds = stryMutAct_9fa48("1025") ? [] : (stryCov_9fa48("1025"), [...new Set(stryMutAct_9fa48("1026") ? [] : (stryCov_9fa48("1026"), [...resolvedMentionIds, ...parsedFromContent]))]);
      const message: Message = stryMutAct_9fa48("1027") ? {} : (stryCov_9fa48("1027"), {
        id: uuid(),
        roomId: this.id,
        sender: stryMutAct_9fa48("1028") ? {} : (stryCov_9fa48("1028"), {
          id: agent.id,
          type: stryMutAct_9fa48("1029") ? "" : (stryCov_9fa48("1029"), 'agent'),
          name: agent.name
        }),
        content,
        mentions: resolvedMentionIds,
        timestamp: new Date(),
        metadata: stryMutAct_9fa48("1030") ? {} : (stryCov_9fa48("1030"), {
          skillInvocation: stryMutAct_9fa48("1031") ? false : (stryCov_9fa48("1031"), true),
          ...metadata
        })
      });
      this.messageBus.publish(message);
      return message;
    }
  }

  /**
   * Send a system notification message into this room.
   */
  sendSystemMessage(content: string, mentions?: string[]): Message {
    if (stryMutAct_9fa48("1032")) {
      {}
    } else {
      stryCov_9fa48("1032");
      let resolvedMentionIds: string[] = stryMutAct_9fa48("1033") ? ["Stryker was here"] : (stryCov_9fa48("1033"), []);
      if (stryMutAct_9fa48("1036") ? mentions || mentions.length > 0 : stryMutAct_9fa48("1035") ? false : stryMutAct_9fa48("1034") ? true : (stryCov_9fa48("1034", "1035", "1036"), mentions && (stryMutAct_9fa48("1039") ? mentions.length <= 0 : stryMutAct_9fa48("1038") ? mentions.length >= 0 : stryMutAct_9fa48("1037") ? true : (stryCov_9fa48("1037", "1038", "1039"), mentions.length > 0)))) {
        if (stryMutAct_9fa48("1040")) {
          {}
        } else {
          stryCov_9fa48("1040");
          for (const m of mentions) {
            if (stryMutAct_9fa48("1041")) {
              {}
            } else {
              stryCov_9fa48("1041");
              const agent = this.resolveAgentMention(m);
              if (stryMutAct_9fa48("1043") ? false : stryMutAct_9fa48("1042") ? true : (stryCov_9fa48("1042", "1043"), agent)) resolvedMentionIds.push(agent.id);
            }
          }
        }
      }
      const message: Message = stryMutAct_9fa48("1044") ? {} : (stryCov_9fa48("1044"), {
        id: uuid(),
        roomId: this.id,
        sender: stryMutAct_9fa48("1045") ? {} : (stryCov_9fa48("1045"), {
          id: stryMutAct_9fa48("1046") ? "" : (stryCov_9fa48("1046"), 'system'),
          type: stryMutAct_9fa48("1047") ? "" : (stryCov_9fa48("1047"), 'human'),
          name: stryMutAct_9fa48("1048") ? "" : (stryCov_9fa48("1048"), 'System')
        }),
        content,
        mentions: resolvedMentionIds,
        timestamp: new Date(),
        metadata: stryMutAct_9fa48("1049") ? {} : (stryCov_9fa48("1049"), {
          isSystem: stryMutAct_9fa48("1050") ? false : (stryCov_9fa48("1050"), true)
        })
      });
      this.messageBus.publish(message);
      return message;
    }
  }

  /**
   * Update an existing message in-place (used for thinking → response replacement).
   */
  updateMessage(messageId: string, content: string, metadata?: Partial<Message['metadata']>): void {
    if (stryMutAct_9fa48("1051")) {
      {}
    } else {
      stryCov_9fa48("1051");
      const msg = this.messageHistory.find(stryMutAct_9fa48("1052") ? () => undefined : (stryCov_9fa48("1052"), m => stryMutAct_9fa48("1055") ? m.id !== messageId : stryMutAct_9fa48("1054") ? false : stryMutAct_9fa48("1053") ? true : (stryCov_9fa48("1053", "1054", "1055"), m.id === messageId)));
      if (stryMutAct_9fa48("1058") ? false : stryMutAct_9fa48("1057") ? true : stryMutAct_9fa48("1056") ? msg : (stryCov_9fa48("1056", "1057", "1058"), !msg)) {
        if (stryMutAct_9fa48("1059")) {
          {}
        } else {
          stryCov_9fa48("1059");
          log.warn(stryMutAct_9fa48("1060") ? `` : (stryCov_9fa48("1060"), `updateMessage: message ${messageId} not found`));
          return;
        }
      }
      msg.content = content;
      if (stryMutAct_9fa48("1062") ? false : stryMutAct_9fa48("1061") ? true : (stryCov_9fa48("1061", "1062"), metadata)) {
        if (stryMutAct_9fa48("1063")) {
          {}
        } else {
          stryCov_9fa48("1063");
          msg.metadata = stryMutAct_9fa48("1064") ? {} : (stryCov_9fa48("1064"), {
            ...msg.metadata,
            ...metadata
          });
        }
      }
      // Emit update event (NOT a new message — frontend replaces in place)
      this.messageBus.emitColonyEvent(stryMutAct_9fa48("1065") ? {} : (stryCov_9fa48("1065"), {
        type: stryMutAct_9fa48("1066") ? "" : (stryCov_9fa48("1066"), 'message_updated'),
        data: stryMutAct_9fa48("1067") ? {} : (stryCov_9fa48("1067"), {
          ...msg
        })
      }));
    }
  }

  /**
   * Layered message routing:
   *   Layer 1: If message has @mentions → route only to mentioned agents
   *   Layer 2: If no @mentions AND sender is human → route to the default agent
   *   Layer 3: Non-routed agents are NOT notified, but can use
   *            get_messages skill to pull the message history themselves
   *
   * IMPORTANT: Agent-sent messages without @mentions do NOT trigger the
   * default agent. This prevents infinite agent-to-agent loops.
   */
  private onMessage(message: Message): void {
    if (stryMutAct_9fa48("1068")) {
      {}
    } else {
      stryCov_9fa48("1068");
      // Always add to history (all participants can access via get_messages)
      this.messageHistory.push(message);

      // Trigger auto-save callback if set
      if (stryMutAct_9fa48("1070") ? false : stryMutAct_9fa48("1069") ? true : (stryCov_9fa48("1069", "1070"), this.autoSaveCallback)) {
        if (stryMutAct_9fa48("1071")) {
          {}
        } else {
          stryCov_9fa48("1071");
          this.autoSaveCallback(this.id).catch(err => {
            if (stryMutAct_9fa48("1072")) {
              {}
            } else {
              stryCov_9fa48("1072");
              log.error(stryMutAct_9fa48("1073") ? `` : (stryCov_9fa48("1073"), `Auto-save failed for room ${this.id}:`), err);
            }
          });
        }
      }
      const senderId = message.sender.id;
      const senderIsAgent = this.agents.has(senderId);

      // Agent messages: only use explicit mentions array (from send-message skill param)
      // Human messages: also parse inline @name from message content
      let mentionIds = stryMutAct_9fa48("1074") ? [] : (stryCov_9fa48("1074"), [...message.mentions]);
      if (stryMutAct_9fa48("1077") ? false : stryMutAct_9fa48("1076") ? true : stryMutAct_9fa48("1075") ? senderIsAgent : (stryCov_9fa48("1075", "1076", "1077"), !senderIsAgent)) {
        if (stryMutAct_9fa48("1078")) {
          {}
        } else {
          stryCov_9fa48("1078");
          const parsedFromContent = this.parseMentionsFromContent(message.content);
          for (const id of parsedFromContent) {
            if (stryMutAct_9fa48("1079")) {
              {}
            } else {
              stryCov_9fa48("1079");
              if (stryMutAct_9fa48("1082") ? false : stryMutAct_9fa48("1081") ? true : stryMutAct_9fa48("1080") ? mentionIds.includes(id) : (stryCov_9fa48("1080", "1081", "1082"), !mentionIds.includes(id))) mentionIds.push(id);
            }
          }
        }
      }
      if (stryMutAct_9fa48("1086") ? mentionIds.length <= 0 : stryMutAct_9fa48("1085") ? mentionIds.length >= 0 : stryMutAct_9fa48("1084") ? false : stryMutAct_9fa48("1083") ? true : (stryCov_9fa48("1083", "1084", "1085", "1086"), mentionIds.length > 0)) {
        if (stryMutAct_9fa48("1087")) {
          {}
        } else {
          stryCov_9fa48("1087");
          // ── Layer 1: Explicit @mention routing ──
          // Agent messages: only route to the FIRST mentioned agent (prevent fan-out)
          // Human messages: route to ALL mentioned agents
          const otherIds = stryMutAct_9fa48("1088") ? mentionIds : (stryCov_9fa48("1088"), mentionIds.filter(stryMutAct_9fa48("1089") ? () => undefined : (stryCov_9fa48("1089"), id => stryMutAct_9fa48("1092") ? id === senderId : stryMutAct_9fa48("1091") ? false : stryMutAct_9fa48("1090") ? true : (stryCov_9fa48("1090", "1091", "1092"), id !== senderId))));
          const agentOnlyIds = stryMutAct_9fa48("1093") ? otherIds : (stryCov_9fa48("1093"), otherIds.filter(stryMutAct_9fa48("1094") ? () => undefined : (stryCov_9fa48("1094"), id => this.agents.has(id))));
          const routeTargets = senderIsAgent ? stryMutAct_9fa48("1095") ? agentOnlyIds : (stryCov_9fa48("1095"), agentOnlyIds.slice(0, 1)) // skip user mentions, pick first agent
          : otherIds;
          for (const mentionedId of routeTargets) {
            if (stryMutAct_9fa48("1096")) {
              {}
            } else {
              stryCov_9fa48("1096");
              const agent = this.agents.get(mentionedId);
              if (stryMutAct_9fa48("1098") ? false : stryMutAct_9fa48("1097") ? true : (stryCov_9fa48("1097", "1098"), agent)) {
                if (stryMutAct_9fa48("1099")) {
                  {}
                } else {
                  stryCov_9fa48("1099");
                  log.info(stryMutAct_9fa48("1100") ? `` : (stryCov_9fa48("1100"), `Routing message to @${agent.name} in "${this.name}"`));
                  agent.receiveMessage(message).catch(err => {
                    if (stryMutAct_9fa48("1101")) {
                      {}
                    } else {
                      stryCov_9fa48("1101");
                      log.error(stryMutAct_9fa48("1102") ? `` : (stryCov_9fa48("1102"), `Error routing to agent "${agent.name}":`), err);
                    }
                  });
                }
              }
            }
          }
          if (stryMutAct_9fa48("1105") ? senderIsAgent || mentionIds.filter(id => id !== senderId).length > 1 : stryMutAct_9fa48("1104") ? false : stryMutAct_9fa48("1103") ? true : (stryCov_9fa48("1103", "1104", "1105"), senderIsAgent && (stryMutAct_9fa48("1108") ? mentionIds.filter(id => id !== senderId).length <= 1 : stryMutAct_9fa48("1107") ? mentionIds.filter(id => id !== senderId).length >= 1 : stryMutAct_9fa48("1106") ? true : (stryCov_9fa48("1106", "1107", "1108"), (stryMutAct_9fa48("1109") ? mentionIds.length : (stryCov_9fa48("1109"), mentionIds.filter(stryMutAct_9fa48("1110") ? () => undefined : (stryCov_9fa48("1110"), id => stryMutAct_9fa48("1113") ? id === senderId : stryMutAct_9fa48("1112") ? false : stryMutAct_9fa48("1111") ? true : (stryCov_9fa48("1111", "1112", "1113"), id !== senderId))).length)) > 1)))) {
            if (stryMutAct_9fa48("1114")) {
              {}
            } else {
              stryCov_9fa48("1114");
              log.warn(stryMutAct_9fa48("1115") ? `` : (stryCov_9fa48("1115"), `Agent "${message.sender.name}" mentioned ${mentionIds.length} agents, only routing to first one`));
            }
          }
        }
      } else if (stryMutAct_9fa48("1118") ? false : stryMutAct_9fa48("1117") ? true : stryMutAct_9fa48("1116") ? senderIsAgent : (stryCov_9fa48("1116", "1117", "1118"), !senderIsAgent)) {
        if (stryMutAct_9fa48("1119")) {
          {}
        } else {
          stryCov_9fa48("1119");
          // ── Layer 2: Default agent fallback (human messages only) ──
          if (stryMutAct_9fa48("1122") ? this.defaultAgentId || this.defaultAgentId !== senderId : stryMutAct_9fa48("1121") ? false : stryMutAct_9fa48("1120") ? true : (stryCov_9fa48("1120", "1121", "1122"), this.defaultAgentId && (stryMutAct_9fa48("1124") ? this.defaultAgentId === senderId : stryMutAct_9fa48("1123") ? true : (stryCov_9fa48("1123", "1124"), this.defaultAgentId !== senderId)))) {
            if (stryMutAct_9fa48("1125")) {
              {}
            } else {
              stryCov_9fa48("1125");
              const defaultAgent = this.agents.get(this.defaultAgentId);
              if (stryMutAct_9fa48("1127") ? false : stryMutAct_9fa48("1126") ? true : (stryCov_9fa48("1126", "1127"), defaultAgent)) {
                if (stryMutAct_9fa48("1128")) {
                  {}
                } else {
                  stryCov_9fa48("1128");
                  log.info(stryMutAct_9fa48("1129") ? `` : (stryCov_9fa48("1129"), `Routing to default agent @${defaultAgent.name} in "${this.name}"`));
                  defaultAgent.receiveMessage(message).catch(err => {
                    if (stryMutAct_9fa48("1130")) {
                      {}
                    } else {
                      stryCov_9fa48("1130");
                      log.error(stryMutAct_9fa48("1131") ? `` : (stryCov_9fa48("1131"), `Error routing to default agent "${defaultAgent.name}":`), err);
                    }
                  });
                }
              }
            }
          } else {
            if (stryMutAct_9fa48("1132")) {
              {}
            } else {
              stryCov_9fa48("1132");
              log.debug(stryMutAct_9fa48("1133") ? `` : (stryCov_9fa48("1133"), `No default agent set for room "${this.name}", message not routed`));
            }
          }
        }
      } else {
        if (stryMutAct_9fa48("1134")) {
          {}
        } else {
          stryCov_9fa48("1134");
          // Agent-sent message with no @mentions → do not route to default
          log.debug(stryMutAct_9fa48("1135") ? `` : (stryCov_9fa48("1135"), `Agent "${message.sender.name}" sent message without @mention, not routing to default`));
        }
      }

      // Layer 3: Non-routed agents are NOT notified here.
      // They can use the get_messages skill to access messageHistory.
    }
  }

  // ── Query ────────────────────────────────────────────

  getInfo(): ChatRoomInfo {
    if (stryMutAct_9fa48("1136")) {
      {}
    } else {
      stryCov_9fa48("1136");
      const participants: Participant[] = stryMutAct_9fa48("1137") ? [] : (stryCov_9fa48("1137"), [...Array.from(this.agents.values()).map(stryMutAct_9fa48("1138") ? () => undefined : (stryCov_9fa48("1138"), a => stryMutAct_9fa48("1139") ? {} : (stryCov_9fa48("1139"), {
        id: a.id,
        type: 'agent' as const,
        name: a.name,
        description: a.config.description,
        sessionHealth: a.getSessionHealth(this.id)
      }))), ...Array.from(this.humanParticipants.values())]);
      return stryMutAct_9fa48("1140") ? {} : (stryCov_9fa48("1140"), {
        id: this.id,
        name: this.name,
        participants,
        createdAt: this.createdAt,
        messageCount: this.messageHistory.length,
        isPaused: this.isPaused
      });
    }
  }
  getMessages(limit?: number): Message[] {
    if (stryMutAct_9fa48("1141")) {
      {}
    } else {
      stryCov_9fa48("1141");
      if (stryMutAct_9fa48("1143") ? false : stryMutAct_9fa48("1142") ? true : (stryCov_9fa48("1142", "1143"), limit)) {
        if (stryMutAct_9fa48("1144")) {
          {}
        } else {
          stryCov_9fa48("1144");
          return stryMutAct_9fa48("1145") ? this.messageHistory : (stryCov_9fa48("1145"), this.messageHistory.slice(stryMutAct_9fa48("1146") ? +limit : (stryCov_9fa48("1146"), -limit)));
        }
      }
      return stryMutAct_9fa48("1147") ? [] : (stryCov_9fa48("1147"), [...this.messageHistory]);
    }
  }
  getParticipantIds(): string[] {
    if (stryMutAct_9fa48("1148")) {
      {}
    } else {
      stryCov_9fa48("1148");
      return stryMutAct_9fa48("1149") ? [] : (stryCov_9fa48("1149"), [...this.agents.keys(), ...this.humanParticipants.keys()]);
    }
  }
  getDefaultAgentId(): string | null {
    if (stryMutAct_9fa48("1150")) {
      {}
    } else {
      stryCov_9fa48("1150");
      return this.defaultAgentId;
    }
  }
  getIsPaused(): boolean {
    if (stryMutAct_9fa48("1151")) {
      {}
    } else {
      stryCov_9fa48("1151");
      return this.isPaused;
    }
  }

  // ── Lifecycle ────────────────────────────────────────

  /**
   * Serialize room state for persistence.
   */
  serialize(): object {
    if (stryMutAct_9fa48("1152")) {
      {}
    } else {
      stryCov_9fa48("1152");
      return stryMutAct_9fa48("1153") ? {} : (stryCov_9fa48("1153"), {
        id: this.id,
        name: this.name,
        createdAt: this.createdAt.toISOString(),
        agentIds: Array.from(this.agents.keys()),
        humanParticipants: Array.from(this.humanParticipants.values()),
        messages: this.messageHistory,
        defaultAgentId: this.defaultAgentId,
        isPaused: this.isPaused,
        workingDir: this.workingDir
      });
    }
  }

  /**
   * Restore message history (used when loading from persistence).
   */
  restoreMessages(messages: Message[]): void {
    if (stryMutAct_9fa48("1154")) {
      {}
    } else {
      stryCov_9fa48("1154");
      this.messageHistory = stryMutAct_9fa48("1155") ? [] : (stryCov_9fa48("1155"), [...messages]);
      log.info(stryMutAct_9fa48("1156") ? `` : (stryCov_9fa48("1156"), `Restored ${messages.length} messages to room "${this.name}"`));
    }
  }

  /**
   * Set paused state (used when loading from persistence).
   */
  setPausedState(isPaused: boolean): void {
    if (stryMutAct_9fa48("1157")) {
      {}
    } else {
      stryCov_9fa48("1157");
      this.isPaused = isPaused;
    }
  }

  /**
   * Pause the chat room.
   */
  pause(): void {
    if (stryMutAct_9fa48("1158")) {
      {}
    } else {
      stryCov_9fa48("1158");
      if (stryMutAct_9fa48("1161") ? false : stryMutAct_9fa48("1160") ? true : stryMutAct_9fa48("1159") ? this.isPaused : (stryCov_9fa48("1159", "1160", "1161"), !this.isPaused)) {
        if (stryMutAct_9fa48("1162")) {
          {}
        } else {
          stryCov_9fa48("1162");
          this.isPaused = stryMutAct_9fa48("1163") ? false : (stryCov_9fa48("1163"), true);
          this.messageBus.emitColonyEvent(stryMutAct_9fa48("1164") ? {} : (stryCov_9fa48("1164"), {
            type: stryMutAct_9fa48("1165") ? "" : (stryCov_9fa48("1165"), 'session_paused'),
            roomId: this.id
          }));

          // Abort any ongoing LLM invocations for all agents in this room
          for (const agent of this.agents.values()) {
            if (stryMutAct_9fa48("1166")) {
              {}
            } else {
              stryCov_9fa48("1166");
              if (stryMutAct_9fa48("1169") ? typeof agent.abortRoomInvocation !== 'function' : stryMutAct_9fa48("1168") ? false : stryMutAct_9fa48("1167") ? true : (stryCov_9fa48("1167", "1168", "1169"), typeof agent.abortRoomInvocation === (stryMutAct_9fa48("1170") ? "" : (stryCov_9fa48("1170"), 'function')))) {
                if (stryMutAct_9fa48("1171")) {
                  {}
                } else {
                  stryCov_9fa48("1171");
                  agent.abortRoomInvocation(this.id);
                }
              }
            }
          }
          if (stryMutAct_9fa48("1173") ? false : stryMutAct_9fa48("1172") ? true : (stryCov_9fa48("1172", "1173"), this.autoSaveCallback)) {
            if (stryMutAct_9fa48("1174")) {
              {}
            } else {
              stryCov_9fa48("1174");
              this.autoSaveCallback(this.id).catch(err => {
                if (stryMutAct_9fa48("1175")) {
                  {}
                } else {
                  stryCov_9fa48("1175");
                  log.error(stryMutAct_9fa48("1176") ? `` : (stryCov_9fa48("1176"), `Auto-save failed on pause for room ${this.id}:`), err);
                }
              });
            }
          }
          log.info(stryMutAct_9fa48("1177") ? `` : (stryCov_9fa48("1177"), `ChatRoom paused: "${this.name}" (${this.id})`));
        }
      }
    }
  }

  /**
   * Resume the chat room.
   */
  resume(): void {
    if (stryMutAct_9fa48("1178")) {
      {}
    } else {
      stryCov_9fa48("1178");
      if (stryMutAct_9fa48("1180") ? false : stryMutAct_9fa48("1179") ? true : (stryCov_9fa48("1179", "1180"), this.isPaused)) {
        if (stryMutAct_9fa48("1181")) {
          {}
        } else {
          stryCov_9fa48("1181");
          this.isPaused = stryMutAct_9fa48("1182") ? true : (stryCov_9fa48("1182"), false);
          this.messageBus.emitColonyEvent(stryMutAct_9fa48("1183") ? {} : (stryCov_9fa48("1183"), {
            type: stryMutAct_9fa48("1184") ? "" : (stryCov_9fa48("1184"), 'session_resumed'),
            roomId: this.id
          }));
          if (stryMutAct_9fa48("1186") ? false : stryMutAct_9fa48("1185") ? true : (stryCov_9fa48("1185", "1186"), this.autoSaveCallback)) {
            if (stryMutAct_9fa48("1187")) {
              {}
            } else {
              stryCov_9fa48("1187");
              this.autoSaveCallback(this.id).catch(err => {
                if (stryMutAct_9fa48("1188")) {
                  {}
                } else {
                  stryCov_9fa48("1188");
                  log.error(stryMutAct_9fa48("1189") ? `` : (stryCov_9fa48("1189"), `Auto-save failed on resume for room ${this.id}:`), err);
                }
              });
            }
          }
          log.info(stryMutAct_9fa48("1190") ? `` : (stryCov_9fa48("1190"), `ChatRoom resumed: "${this.name}" (${this.id})`));
        }
      }
    }
  }

  /**
   * Set auto-save callback (called after each message).
   */
  setAutoSaveCallback(callback: (roomId: string) => Promise<void>): void {
    if (stryMutAct_9fa48("1191")) {
      {}
    } else {
      stryCov_9fa48("1191");
      this.autoSaveCallback = callback;
    }
  }

  /**
   * Clean up subscriptions.
   */
  destroy(): void {
    if (stryMutAct_9fa48("1192")) {
      {}
    } else {
      stryCov_9fa48("1192");
      for (const unsub of this.unsubscribers) {
        if (stryMutAct_9fa48("1193")) {
          {}
        } else {
          stryCov_9fa48("1193");
          unsub();
        }
      }
      this.messageBus.clearRoom(this.id);
      log.info(stryMutAct_9fa48("1194") ? `` : (stryCov_9fa48("1194"), `ChatRoom destroyed: "${this.name}" (${this.id})`));
    }
  }
}