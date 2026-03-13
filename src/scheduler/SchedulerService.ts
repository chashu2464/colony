// ── Scheduler Service ────────────────────────────────────
// Manages delayed and repeated task execution

import * as fs from 'fs/promises';
import * as path from 'path';
import { Logger } from '../utils/Logger.js';
import type { ScheduledTask, ScheduleTaskRequest, ScheduleTaskResponse } from './types.js';
import { randomUUID } from 'crypto';

const log = new Logger('Scheduler');

export class SchedulerService {
    private tasks = new Map<string, ScheduledTask>();
    private timers = new Map<string, NodeJS.Timeout>();
    private persistPath: string;
    private onTaskExecute: (task: ScheduledTask) => Promise<void>;

    constructor(dataDir: string, onTaskExecute: (task: ScheduledTask) => Promise<void>) {
        this.persistPath = path.join(dataDir, 'scheduled-tasks.json');
        this.onTaskExecute = onTaskExecute;
    }

    async initialize() {
        try {
            const data = await fs.readFile(this.persistPath, 'utf-8');
            const tasks: ScheduledTask[] = JSON.parse(data);

            for (const task of tasks) {
                if (task.status === 'pending' || task.status === 'running') {
                    this.tasks.set(task.id, task);
                    this.scheduleTask(task);
                }
            }

            log.info(`Loaded ${this.tasks.size} scheduled tasks`);
        } catch (err) {
            if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
                log.error('Failed to load scheduled tasks:', err);
            }
        }
    }

    async scheduleNewTask(request: ScheduleTaskRequest): Promise<ScheduleTaskResponse> {
        const now = Date.now();
        const task: ScheduledTask = {
            id: randomUUID(),
            agentId: request.agentId,
            roomId: request.roomId,
            prompt: request.prompt,
            mode: request.mode,
            delayMs: request.delayMs,
            repeatIntervalMs: request.repeatIntervalMs,
            createdAt: now,
            nextExecutionAt: now + request.delayMs,
            executionCount: 0,
            maxExecutions: request.maxExecutions,
            status: 'pending'
        };

        this.tasks.set(task.id, task);
        this.scheduleTask(task);
        await this.persist();

        log.info(`Scheduled task ${task.id} for agent ${task.agentId} (mode: ${task.mode}, delay: ${task.delayMs}ms)`);

        return {
            taskId: task.id,
            nextExecutionAt: task.nextExecutionAt
        };
    }

    private scheduleTask(task: ScheduledTask) {
        const delay = Math.max(0, task.nextExecutionAt - Date.now());

        const timer = setTimeout(async () => {
            await this.executeTask(task.id);
        }, delay);

        this.timers.set(task.id, timer);
    }

    private async executeTask(taskId: string) {
        const task = this.tasks.get(taskId);
        if (!task) return;

        task.status = 'running';
        task.executionCount++;

        try {
            await this.onTaskExecute(task);

            if (task.mode === 'repeat' && (!task.maxExecutions || task.executionCount < task.maxExecutions)) {
                task.status = 'pending';
                task.nextExecutionAt = Date.now() + (task.repeatIntervalMs || task.delayMs);
                this.scheduleTask(task);
                log.info(`Task ${taskId} executed (${task.executionCount}/${task.maxExecutions || '∞'}), next at ${new Date(task.nextExecutionAt).toISOString()}`);
            } else {
                task.status = 'completed';
                this.timers.delete(taskId);
                log.info(`Task ${taskId} completed after ${task.executionCount} executions`);
            }

            await this.persist();
        } catch (err) {
            log.error(`Task ${taskId} execution failed:`, err);
            task.status = 'pending';
            await this.persist();
        }
    }

    async cancelTask(taskId: string): Promise<boolean> {
        const task = this.tasks.get(taskId);
        if (!task) return false;

        const timer = this.timers.get(taskId);
        if (timer) {
            clearTimeout(timer);
            this.timers.delete(taskId);
        }

        task.status = 'cancelled';
        await this.persist();

        log.info(`Task ${taskId} cancelled`);
        return true;
    }

    getTask(taskId: string): ScheduledTask | undefined {
        return this.tasks.get(taskId);
    }

    listTasks(agentId?: string, roomId?: string): ScheduledTask[] {
        let tasks = Array.from(this.tasks.values());

        if (agentId) {
            tasks = tasks.filter(t => t.agentId === agentId);
        }

        if (roomId) {
            tasks = tasks.filter(t => t.roomId === roomId);
        }

        return tasks;
    }

    private async persist() {
        try {
            const tasks = Array.from(this.tasks.values());
            await fs.writeFile(this.persistPath, JSON.stringify(tasks, null, 2), 'utf-8');
        } catch (err) {
            log.error('Failed to persist scheduled tasks:', err);
        }
    }

    async shutdown() {
        for (const timer of this.timers.values()) {
            clearTimeout(timer);
        }
        this.timers.clear();
        await this.persist();
        log.info('Scheduler service shut down');
    }
}
