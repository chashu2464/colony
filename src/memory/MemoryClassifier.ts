import type { Message } from '../types.js';

/**
 * Classification result for a conversation memory.
 */
export interface MemoryClassification {
    subtype: 'decision' | 'discussion' | 'task' | 'question';
    importance: number; // 1-5
}

/**
 * MemoryClassifier
 * 
 * Analyzes conversation patterns to automatically categorize memories
 * and assign importance scores.
 */
export class MemoryClassifier {
    /**
     * Classify a conversation based on the user message and agent response.
     */
    classify(message: Message, response: string): MemoryClassification {
        // Rule 1: Decision detection (High importance)
        if (this.isDecision(response)) {
            return { subtype: 'decision', importance: 5 };
        }

        // Rule 2: Task assignment/execution detection
        if (this.isTaskAssignment(response)) {
            return { subtype: 'task', importance: 4 };
        }

        // Rule 3: Question or bug/error discussion
        if (this.isQuestion(message.content) || this.isQuestion(response)) {
            return { subtype: 'question', importance: 3 };
        }

        // Default: Discussion (Standard importance)
        return { subtype: 'discussion', importance: 2 };
    }

    private isDecision(text: string): boolean {
        // Look for authoritative language or confirmation of a path
        return /决定|确定|采用|选择|方案|批准|通过|结论|一致认为|定下来/.test(text);
    }

    private isTaskAssignment(text: string): boolean {
        // Look for mentions combined with action verbs
        const hasMention = /@\w+/.test(text);
        const hasAction = /实施|开发|测试|执行|修复|重构|部署|构建|编写|修改/.test(text);
        return (hasMention && hasAction) || /已完成|任务已完成/.test(text);
    }

    private isQuestion(text: string): boolean {
        // Look for inquiry or problem indicators
        return /问题|bug|错误|异常|故障|报错|怀疑|为什么|如何|请教|确认一下/.test(text);
    }
}
