// @ts-nocheck
// ── Colony: Discord Channel-Session Mapper ─────────────────
// Manages 1:1 bidirectional mapping between Discord Channels and Colony Sessions.
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
import type { MappingRecord, MappingMeta } from './types.js';
const log = new Logger(stryMutAct_9fa48("1433") ? "" : (stryCov_9fa48("1433"), 'ChannelSessionMapper'));
export class ChannelSessionMapper {
  private mappings: MappingRecord[] = stryMutAct_9fa48("1434") ? ["Stryker was here"] : (stryCov_9fa48("1434"), []);
  private filePath: string;
  private channelToSession = new Map<string, string>();
  private sessionToChannel = new Map<string, string>();
  /** In-flight sessions being created by Direction A — prevents channelCreate re-entry */
  private pendingSessions = new Set<string>();
  constructor(dataDir: string = stryMutAct_9fa48("1435") ? "" : (stryCov_9fa48("1435"), '.data')) {
    if (stryMutAct_9fa48("1436")) {
      {}
    } else {
      stryCov_9fa48("1436");
      this.filePath = path.join(dataDir, stryMutAct_9fa48("1437") ? "" : (stryCov_9fa48("1437"), 'discord-channel-map.json'));
      if (stryMutAct_9fa48("1440") ? false : stryMutAct_9fa48("1439") ? true : stryMutAct_9fa48("1438") ? fs.existsSync(dataDir) : (stryCov_9fa48("1438", "1439", "1440"), !fs.existsSync(dataDir))) {
        if (stryMutAct_9fa48("1441")) {
          {}
        } else {
          stryCov_9fa48("1441");
          fs.mkdirSync(dataDir, stryMutAct_9fa48("1442") ? {} : (stryCov_9fa48("1442"), {
            recursive: stryMutAct_9fa48("1443") ? false : (stryCov_9fa48("1443"), true)
          }));
        }
      }
    }
  }

  /**
   * Bind a Discord channel to a Colony session.
   */
  async bind(channelId: string, sessionId: string, meta: MappingMeta): Promise<void> {
    if (stryMutAct_9fa48("1444")) {
      {}
    } else {
      stryCov_9fa48("1444");
      // Remove any existing mappings for this channel or session
      this.unbind(channelId);
      const existingChannelId = this.getChannelBySession(sessionId);
      if (stryMutAct_9fa48("1446") ? false : stryMutAct_9fa48("1445") ? true : (stryCov_9fa48("1445", "1446"), existingChannelId)) {
        if (stryMutAct_9fa48("1447")) {
          {}
        } else {
          stryCov_9fa48("1447");
          this.unbind(existingChannelId);
        }
      }
      const record: MappingRecord = stryMutAct_9fa48("1448") ? {} : (stryCov_9fa48("1448"), {
        channelId,
        sessionId,
        sessionName: meta.sessionName,
        guildId: meta.guildId,
        createdAt: stryMutAct_9fa48("1451") ? meta.createdAt && new Date().toISOString() : stryMutAct_9fa48("1450") ? false : stryMutAct_9fa48("1449") ? true : (stryCov_9fa48("1449", "1450", "1451"), meta.createdAt || new Date().toISOString())
      });
      this.mappings.push(record);
      this.channelToSession.set(channelId, sessionId);
      this.sessionToChannel.set(sessionId, channelId);
      // Clear pending guard if present
      this.pendingSessions.delete(sessionId);
      log.info(stryMutAct_9fa48("1452") ? `` : (stryCov_9fa48("1452"), `Bound channel ${channelId} to session ${sessionId} (${meta.sessionName})`));
      await this.save();
    }
  }

  /**
   * Unbind a Discord channel.
   */
  async unbind(channelId: string): Promise<void> {
    if (stryMutAct_9fa48("1453")) {
      {}
    } else {
      stryCov_9fa48("1453");
      const sessionId = this.channelToSession.get(channelId);
      if (stryMutAct_9fa48("1455") ? false : stryMutAct_9fa48("1454") ? true : (stryCov_9fa48("1454", "1455"), sessionId)) {
        if (stryMutAct_9fa48("1456")) {
          {}
        } else {
          stryCov_9fa48("1456");
          this.mappings = stryMutAct_9fa48("1457") ? this.mappings : (stryCov_9fa48("1457"), this.mappings.filter(stryMutAct_9fa48("1458") ? () => undefined : (stryCov_9fa48("1458"), m => stryMutAct_9fa48("1461") ? m.channelId === channelId : stryMutAct_9fa48("1460") ? false : stryMutAct_9fa48("1459") ? true : (stryCov_9fa48("1459", "1460", "1461"), m.channelId !== channelId))));
          this.channelToSession.delete(channelId);
          this.sessionToChannel.delete(sessionId);
          log.info(stryMutAct_9fa48("1462") ? `` : (stryCov_9fa48("1462"), `Unbound channel ${channelId} from session ${sessionId}`));
          await this.save();
        }
      }
    }
  }

  /**
   * Get session ID by channel ID.
   */
  getSessionByChannel(channelId: string): string | undefined {
    if (stryMutAct_9fa48("1463")) {
      {}
    } else {
      stryCov_9fa48("1463");
      return this.channelToSession.get(channelId);
    }
  }

  /**
   * Get channel ID by session ID.
   */
  getChannelBySession(sessionId: string): string | undefined {
    if (stryMutAct_9fa48("1464")) {
      {}
    } else {
      stryCov_9fa48("1464");
      return this.sessionToChannel.get(sessionId);
    }
  }

  /**
   * Mark a session as pending channel creation (Direction A in-flight guard).
   * Prevents channelCreate event from triggering Direction B re-entry.
   */
  setPendingSession(sessionId: string): void {
    if (stryMutAct_9fa48("1465")) {
      {}
    } else {
      stryCov_9fa48("1465");
      this.pendingSessions.add(sessionId);
    }
  }

  /**
   * Remove pending session guard (called on error path).
   */
  clearPendingSession(sessionId: string): void {
    if (stryMutAct_9fa48("1466")) {
      {}
    } else {
      stryCov_9fa48("1466");
      this.pendingSessions.delete(sessionId);
    }
  }

  /**
   * Check if a session is pending channel creation (in-flight Direction A).
   */
  isSessionPending(sessionId: string): boolean {
    if (stryMutAct_9fa48("1467")) {
      {}
    } else {
      stryCov_9fa48("1467");
      return this.pendingSessions.has(sessionId);
    }
  }

  /**
   * Get all mappings.
   */
  getAllMappings(): MappingRecord[] {
    if (stryMutAct_9fa48("1468")) {
      {}
    } else {
      stryCov_9fa48("1468");
      return stryMutAct_9fa48("1469") ? [] : (stryCov_9fa48("1469"), [...this.mappings]);
    }
  }

  /**
   * Prune mappings for sessions that no longer exist.
   */
  async pruneOrphans(existingSessionIds: Set<string>): Promise<number> {
    if (stryMutAct_9fa48("1470")) {
      {}
    } else {
      stryCov_9fa48("1470");
      const orphans = stryMutAct_9fa48("1471") ? this.mappings : (stryCov_9fa48("1471"), this.mappings.filter(stryMutAct_9fa48("1472") ? () => undefined : (stryCov_9fa48("1472"), m => stryMutAct_9fa48("1473") ? existingSessionIds.has(m.sessionId) : (stryCov_9fa48("1473"), !existingSessionIds.has(m.sessionId)))));
      const count = orphans.length;
      for (const orphan of orphans) {
        if (stryMutAct_9fa48("1474")) {
          {}
        } else {
          stryCov_9fa48("1474");
          await this.unbind(orphan.channelId);
        }
      }
      return count;
    }
  }

  /**
   * Load mappings from disk.
   */
  async load(): Promise<void> {
    if (stryMutAct_9fa48("1475")) {
      {}
    } else {
      stryCov_9fa48("1475");
      if (stryMutAct_9fa48("1478") ? false : stryMutAct_9fa48("1477") ? true : stryMutAct_9fa48("1476") ? fs.existsSync(this.filePath) : (stryCov_9fa48("1476", "1477", "1478"), !fs.existsSync(this.filePath))) {
        if (stryMutAct_9fa48("1479")) {
          {}
        } else {
          stryCov_9fa48("1479");
          this.mappings = stryMutAct_9fa48("1480") ? ["Stryker was here"] : (stryCov_9fa48("1480"), []);
          return;
        }
      }
      try {
        if (stryMutAct_9fa48("1481")) {
          {}
        } else {
          stryCov_9fa48("1481");
          const content = fs.readFileSync(this.filePath, stryMutAct_9fa48("1482") ? "" : (stryCov_9fa48("1482"), 'utf-8'));
          const data = JSON.parse(content);
          this.mappings = stryMutAct_9fa48("1485") ? data.mappings && [] : stryMutAct_9fa48("1484") ? false : stryMutAct_9fa48("1483") ? true : (stryCov_9fa48("1483", "1484", "1485"), data.mappings || (stryMutAct_9fa48("1486") ? ["Stryker was here"] : (stryCov_9fa48("1486"), [])));

          // Rebuild maps
          this.channelToSession.clear();
          this.sessionToChannel.clear();
          for (const m of this.mappings) {
            if (stryMutAct_9fa48("1487")) {
              {}
            } else {
              stryCov_9fa48("1487");
              this.channelToSession.set(m.channelId, m.sessionId);
              this.sessionToChannel.set(m.sessionId, m.channelId);
            }
          }
          log.info(stryMutAct_9fa48("1488") ? `` : (stryCov_9fa48("1488"), `Loaded ${this.mappings.length} mappings from ${this.filePath}`));
        }
      } catch (error) {
        if (stryMutAct_9fa48("1489")) {
          {}
        } else {
          stryCov_9fa48("1489");
          log.error(stryMutAct_9fa48("1490") ? "" : (stryCov_9fa48("1490"), 'Failed to load mappings:'), error);
          this.mappings = stryMutAct_9fa48("1491") ? ["Stryker was here"] : (stryCov_9fa48("1491"), []);
        }
      }
    }
  }

  /**
   * Save mappings to disk.
   */
  async save(): Promise<void> {
    if (stryMutAct_9fa48("1492")) {
      {}
    } else {
      stryCov_9fa48("1492");
      try {
        if (stryMutAct_9fa48("1493")) {
          {}
        } else {
          stryCov_9fa48("1493");
          const data = stryMutAct_9fa48("1494") ? {} : (stryCov_9fa48("1494"), {
            version: 1,
            mappings: this.mappings,
            updatedAt: new Date().toISOString()
          });
          fs.writeFileSync(this.filePath, JSON.stringify(data, null, 2));
        }
      } catch (error) {
        if (stryMutAct_9fa48("1495")) {
          {}
        } else {
          stryCov_9fa48("1495");
          log.error(stryMutAct_9fa48("1496") ? "" : (stryCov_9fa48("1496"), 'Failed to save mappings:'), error);
        }
      }
    }
  }
}