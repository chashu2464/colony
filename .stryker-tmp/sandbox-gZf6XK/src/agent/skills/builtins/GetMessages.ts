// @ts-nocheck
// ── Colony: Built-in Skill — GetMessages ─────────────────
// Allows agents to fetch recent chat room messages.
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
import { Skill } from '../Skill.js';
import type { SkillExecutionContext, SkillResult } from '../../../types.js';
import type { Message } from '../../../types.js';
export class GetMessagesSkill extends Skill {
  async execute(params: Record<string, unknown>, context: SkillExecutionContext): Promise<SkillResult> {
    if (stryMutAct_9fa48("809")) {
      {}
    } else {
      stryCov_9fa48("809");
      const limit = stryMutAct_9fa48("810") ? params.limit as number && 20 : (stryCov_9fa48("810"), params.limit as number ?? 20);
      try {
        if (stryMutAct_9fa48("811")) {
          {}
        } else {
          stryCov_9fa48("811");
          const messages: Message[] = context.getMessages(limit);
          if (stryMutAct_9fa48("814") ? messages.length !== 0 : stryMutAct_9fa48("813") ? false : stryMutAct_9fa48("812") ? true : (stryCov_9fa48("812", "813", "814"), messages.length === 0)) {
            if (stryMutAct_9fa48("815")) {
              {}
            } else {
              stryCov_9fa48("815");
              return stryMutAct_9fa48("816") ? {} : (stryCov_9fa48("816"), {
                success: stryMutAct_9fa48("817") ? false : (stryCov_9fa48("817"), true),
                output: stryMutAct_9fa48("818") ? "" : (stryCov_9fa48("818"), '暂无聊天消息。')
              });
            }
          }
          const formatted = messages.map(msg => {
            if (stryMutAct_9fa48("819")) {
              {}
            } else {
              stryCov_9fa48("819");
              const time = new Date(msg.timestamp).toLocaleTimeString(stryMutAct_9fa48("820") ? "" : (stryCov_9fa48("820"), 'zh-CN'));
              const mentions = (stryMutAct_9fa48("824") ? msg.mentions.length <= 0 : stryMutAct_9fa48("823") ? msg.mentions.length >= 0 : stryMutAct_9fa48("822") ? false : stryMutAct_9fa48("821") ? true : (stryCov_9fa48("821", "822", "823", "824"), msg.mentions.length > 0)) ? stryMutAct_9fa48("825") ? `` : (stryCov_9fa48("825"), ` [@${msg.mentions.join(stryMutAct_9fa48("826") ? "" : (stryCov_9fa48("826"), ', @'))}]`) : stryMutAct_9fa48("827") ? "Stryker was here!" : (stryCov_9fa48("827"), '');
              return stryMutAct_9fa48("828") ? `` : (stryCov_9fa48("828"), `[${time}] ${msg.sender.name} (${msg.sender.type})${mentions}: ${msg.content}`);
            }
          }).join(stryMutAct_9fa48("829") ? "" : (stryCov_9fa48("829"), '\n'));
          return stryMutAct_9fa48("830") ? {} : (stryCov_9fa48("830"), {
            success: stryMutAct_9fa48("831") ? false : (stryCov_9fa48("831"), true),
            output: stryMutAct_9fa48("832") ? `` : (stryCov_9fa48("832"), `最近 ${messages.length} 条消息:\n${formatted}`)
          });
        }
      } catch (err) {
        if (stryMutAct_9fa48("833")) {
          {}
        } else {
          stryCov_9fa48("833");
          return stryMutAct_9fa48("834") ? {} : (stryCov_9fa48("834"), {
            success: stryMutAct_9fa48("835") ? true : (stryCov_9fa48("835"), false),
            error: stryMutAct_9fa48("836") ? `` : (stryCov_9fa48("836"), `获取消息失败: ${(err as Error).message}`)
          });
        }
      }
    }
  }
}