import { Router } from 'express';
import type { ChatRoomManager } from '../../conversation/ChatRoomManager.js';
import { Logger } from '../../utils/Logger.js';

const log = new Logger('WorkflowRouter');

export function createWorkflowRouter(roomManager: ChatRoomManager) {
    const router = Router();

    router.post('/events', async (req, res) => {
        try {
            const { type, roomId, from_stage, to_stage, next_actor } = req.body;

            if (type !== 'WORKFLOW_STAGE_CHANGED') {
                res.status(400).json({ error: 'Unknown event type' });
                return;
            }

            if (!roomId || !next_actor) {
                res.status(400).json({ error: 'Missing required parameters' });
                return;
            }

            const room = roomManager.getRoom(roomId);
            if (!room) {
                res.status(404).json({ error: 'Room not found' });
                return;
            }

            log.info(`Workflow event in room ${roomId}: Stage ${from_stage} -> ${to_stage}, notifying ${next_actor}`);

            // Send system notification message
            const message = `🔄 工作流已从 Stage ${from_stage} 推进到 Stage ${to_stage}。 @${next_actor} 请开始处理。`;
            room.sendSystemMessage(message, [next_actor]);

            res.json({ success: true });
        } catch (error) {
            log.error('Failed to handle workflow event:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    });

    return router;
}
