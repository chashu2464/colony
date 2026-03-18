// ── Colony: Worktree Utilities ───────────────────────────
// Utilities for checking and managing git worktree state.

import { execSync } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import { Logger } from './Logger.js';

const log = new Logger('WorktreeUtils');

export interface WorktreeStatus {
    exists: boolean;
    path?: string;
    taskId?: string;
    hasUncommittedChanges?: boolean;
    hasUnpushedCommits?: boolean;
    canSafelyDelete?: boolean;
    blockingReason?: string;
}

/**
 * Check if a worktree exists for a given session/room.
 * Looks for workflow state file to determine task_id, then checks for worktree.
 */
export function checkWorktreeStatus(sessionId: string, projectRoot?: string): WorktreeStatus {
    const root = projectRoot || process.cwd();

    try {
        // 1. Load workflow state to get task_id
        const workflowFile = path.join(root, '.data', 'workflows', `${sessionId}.json`);
        if (!fs.existsSync(workflowFile)) {
            return { exists: false };
        }

        const workflowData = JSON.parse(fs.readFileSync(workflowFile, 'utf-8'));
        const taskId = workflowData.task_id;

        if (!taskId) {
            return { exists: false };
        }

        // 2. Check if worktree directory exists
        const worktreePath = path.join(root, '.worktrees', `task-${taskId}`);
        if (!fs.existsSync(worktreePath)) {
            return { exists: false, taskId };
        }

        // 3. Verify it's a registered git worktree
        try {
            const worktreeList = execSync('git worktree list --porcelain', {
                cwd: root,
                encoding: 'utf-8',
                stdio: ['pipe', 'pipe', 'pipe']
            });

            const isRegistered = worktreeList.includes(`worktree ${worktreePath}`);
            if (!isRegistered) {
                return {
                    exists: true,
                    path: worktreePath,
                    taskId,
                    canSafelyDelete: false,
                    blockingReason: 'Worktree path exists but is not a registered git worktree'
                };
            }
        } catch (err) {
            log.warn(`Failed to check git worktree list: ${err}`);
            return {
                exists: true,
                path: worktreePath,
                taskId,
                canSafelyDelete: false,
                blockingReason: 'Failed to verify worktree registration'
            };
        }

        // 4. Check for uncommitted changes
        let hasUncommittedChanges = false;
        try {
            const status = execSync('git status --porcelain', {
                cwd: worktreePath,
                encoding: 'utf-8',
                stdio: ['pipe', 'pipe', 'pipe']
            });
            hasUncommittedChanges = status.trim().length > 0;
        } catch (err) {
            log.warn(`Failed to check git status in worktree: ${err}`);
        }

        // 5. Check for unpushed commits
        let hasUnpushedCommits = false;
        try {
            // Check if branch has upstream
            execSync('git rev-parse --abbrev-ref @{u}', {
                cwd: worktreePath,
                encoding: 'utf-8',
                stdio: ['pipe', 'pipe', 'pipe']
            });

            // Check if there are commits ahead of upstream
            const ahead = execSync('git rev-list @{u}..HEAD', {
                cwd: worktreePath,
                encoding: 'utf-8',
                stdio: ['pipe', 'pipe', 'pipe']
            });
            hasUnpushedCommits = ahead.trim().length > 0;
        } catch (err) {
            // No upstream or other error - treat as unpushed
            hasUnpushedCommits = true;
        }

        // 6. Determine if can safely delete
        const canSafelyDelete = !hasUncommittedChanges && !hasUnpushedCommits;
        let blockingReason: string | undefined;

        if (!canSafelyDelete) {
            const reasons: string[] = [];
            if (hasUncommittedChanges) {
                reasons.push('uncommitted changes');
            }
            if (hasUnpushedCommits) {
                reasons.push('unpushed commits');
            }
            blockingReason = `Worktree has ${reasons.join(' and ')}`;
        }

        return {
            exists: true,
            path: worktreePath,
            taskId,
            hasUncommittedChanges,
            hasUnpushedCommits,
            canSafelyDelete,
            blockingReason
        };
    } catch (err) {
        log.error(`Error checking worktree status for session ${sessionId}:`, err);
        return {
            exists: false,
            blockingReason: `Error checking worktree: ${(err as Error).message}`
        };
    }
}

/**
 * Force delete a worktree, even if it has uncommitted changes or unpushed commits.
 * This should only be called after explicit user confirmation.
 */
export function forceDeleteWorktree(worktreePath: string, projectRoot?: string): boolean {
    const root = projectRoot || process.cwd();

    try {
        log.info(`Force deleting worktree: ${worktreePath}`);
        execSync(`git worktree remove "${worktreePath}" --force`, {
            cwd: root,
            stdio: ['pipe', 'pipe', 'pipe']
        });
        return true;
    } catch (err) {
        log.error(`Failed to force delete worktree ${worktreePath}:`, err);
        return false;
    }
}
