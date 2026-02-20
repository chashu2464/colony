// ── Colony: Main App ─────────────────────────────────────
import { useState, useEffect, useCallback } from 'react';
import './index.css';
import { useWebSocket, type WSEvent } from './hooks/useWebSocket';
import {
  fetchSessions, fetchMessages, fetchAgents,
  createSession, joinSession, sendMessage,
  type Session, type Message, type AgentInfo,
} from './api';

const USER_ID = 'human-user';
const USER_NAME = '用户';

function getAgentColor(id: string): string {
  if (id.includes('architect')) return 'agent-architect';
  if (id.includes('developer')) return 'agent-developer';
  if (id.includes('qa')) return 'agent-qa-lead';
  return 'human';
}

function getInitial(name: string): string {
  return name.charAt(0).toUpperCase();
}

function formatTime(ts: string): string {
  return new Date(ts).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
}

export default function App() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [activeSession, setActiveSession] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [agents, setAgents] = useState<AgentInfo[]>([]);
  const [input, setInput] = useState('');
  const [showNewModal, setShowNewModal] = useState(false);
  const [newSessionName, setNewSessionName] = useState('');
  const [thinkingAgents, setThinkingAgents] = useState<Set<string>>(new Set());

  // Load initial data
  useEffect(() => {
    fetchSessions().then(setSessions).catch(console.error);
    fetchAgents().then(setAgents).catch(console.error);
  }, []);

  // Load messages when session changes
  useEffect(() => {
    if (activeSession) {
      fetchMessages(activeSession).then(setMessages).catch(console.error);
    } else {
      setMessages([]);
    }
  }, [activeSession]);

  // WebSocket for real-time updates
  const handleWSEvent = useCallback((event: WSEvent) => {
    if (event.type === 'message' && event.data) {
      const msg = event.data as Message;
      if (msg.roomId === activeSession) {
        setMessages(prev => {
          // Deduplicate
          if (prev.some(m => m.id === msg.id)) return prev;
          return [...prev, msg];
        });
      }
      // Refresh sessions list for message count
      fetchSessions().then(setSessions).catch(console.error);
    }

    if (event.type === 'agent_status') {
      setAgents(prev =>
        prev.map(a => a.id === event.agentId ? { ...a, status: event.status ?? a.status } : a)
      );
      // Track thinking agents
      if (event.status === 'thinking') {
        setThinkingAgents(prev => new Set(prev).add(event.agentId!));
      } else {
        setThinkingAgents(prev => {
          const next = new Set(prev);
          next.delete(event.agentId!);
          return next;
        });
      }
    }
  }, [activeSession]);

  useWebSocket('ws://localhost:3001', handleWSEvent);

  // Auto-scroll to bottom
  useEffect(() => {
    const el = document.querySelector('.chat-messages');
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  // ── Handlers ────────────────────────────────────────

  async function handleCreateSession() {
    if (!newSessionName.trim()) return;
    const session = await createSession(newSessionName.trim());
    // Join as human
    await joinSession(session.id, { id: USER_ID, type: 'human', name: USER_NAME });
    setSessions(prev => [...prev, session]);
    setActiveSession(session.id);
    setShowNewModal(false);
    setNewSessionName('');
  }

  async function handleSelectSession(sessionId: string) {
    setActiveSession(sessionId);
    // Make sure we're joined
    try {
      await joinSession(sessionId, { id: USER_ID, type: 'human', name: USER_NAME });
    } catch {
      // already joined, fine
    }
  }

  async function handleSend() {
    if (!input.trim() || !activeSession) return;

    // Parse @mentions from input — send names (backend resolves name→id)
    const mentionRegex = /@(\S+)/g;
    const mentions: string[] = [];
    let match;
    while ((match = mentionRegex.exec(input)) !== null) {
      const mentionText = match[1];
      // Match by name or ID — send the matched text, backend resolves it
      const agent = agents.find(a => a.id === mentionText || a.name === mentionText);
      if (agent) mentions.push(agent.name); // send name, e.g. "开发者"
    }

    await sendMessage(activeSession, USER_ID, input.trim(), mentions);
    setInput('');
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  const activeSessionData = sessions.find(s => s.id === activeSession);

  return (
    <>
      {/* ── Sidebar ── */}
      <aside className="sidebar">
        <div className="sidebar-header">
          <div className="logo">🐝</div>
          <h1>Colony</h1>
        </div>

        <div className="sidebar-section">
          <div className="sidebar-section-title">会话</div>
        </div>

        <div className="session-list">
          {sessions.map(session => (
            <div
              key={session.id}
              className={`session-item ${activeSession === session.id ? 'active' : ''}`}
              onClick={() => handleSelectSession(session.id)}
            >
              <div className="session-icon">💬</div>
              <div className="session-info">
                <div className="session-name">{session.name}</div>
                <div className="session-meta">
                  {session.participants.length} 参与者 · {session.messageCount} 消息
                </div>
              </div>
            </div>
          ))}
        </div>

        <button className="new-session-btn" onClick={() => setShowNewModal(true)}>
          + 创建新会话
        </button>
      </aside>

      {/* ── Main Content ── */}
      <div className="main-content">
        {activeSession && activeSessionData ? (
          <>
            {/* Header */}
            <div className="chat-header">
              <div className="chat-header-title">{activeSessionData.name}</div>
              <div className="chat-header-agents">
                {agents.map(agent => (
                  <div key={agent.id} className="agent-badge">
                    <span className={`status-dot ${agent.status}`} />
                    {agent.name}
                  </div>
                ))}
              </div>
            </div>

            {/* Messages */}
            <div className="chat-messages">
              {messages.length === 0 ? (
                <div className="empty-state">
                  <div className="empty-icon">💭</div>
                  <h2>开始对话</h2>
                  <p>输入消息开始与 Agent 交流，使用 @名称 指定 Agent</p>
                </div>
              ) : (
                messages.map(msg => (
                  <div
                    key={msg.id}
                    className={`message ${msg.sender.id === USER_ID ? 'self' : ''}`}
                  >
                    <div className={`message-avatar ${getAgentColor(msg.sender.id)}`}>
                      {getInitial(msg.sender.name)}
                    </div>
                    <div className="message-body">
                      <div className="message-header">
                        <span className="message-sender">{msg.sender.name}</span>
                        <span className="message-time">{formatTime(msg.timestamp)}</span>
                      </div>
                      <div className="message-content">
                        {msg.content}
                      </div>
                    </div>
                  </div>
                ))
              )}

              {/* Thinking indicators */}
              {Array.from(thinkingAgents).map(agentId => {
                const agent = agents.find(a => a.id === agentId);
                if (!agent) return null;
                return (
                  <div key={`thinking-${agentId}`} className="thinking-indicator">
                    <div className={`message-avatar ${getAgentColor(agentId)}`} style={{ width: 24, height: 24, fontSize: 11 }}>
                      {getInitial(agent.name)}
                    </div>
                    <span>{agent.name} 正在思考</span>
                    <div className="thinking-dots">
                      <span /><span /><span />
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Input */}
            <div className="chat-input-container">
              <div className="chat-input-wrapper">
                <textarea
                  className="chat-input"
                  placeholder="输入消息... 使用 @名称 指定 Agent（如 @开发者）"
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  rows={1}
                />
                <button
                  className="send-btn"
                  onClick={handleSend}
                  disabled={!input.trim()}
                >
                  发送
                </button>
              </div>
            </div>
          </>
        ) : (
          <div className="empty-state">
            <div className="empty-icon">🐝</div>
            <h2>Colony</h2>
            <p>选择一个会话或创建新会话开始</p>
          </div>
        )}
      </div>

      {/* ── Agent Panel ── */}
      {activeSession && (
        <div className="agent-panel">
          <div className="agent-panel-title">Agents</div>
          {agents.map(agent => (
            <div key={agent.id} className="agent-card">
              <div className="agent-card-header">
                <div className={`message-avatar ${getAgentColor(agent.id)}`} style={{ width: 24, height: 24, fontSize: 11 }}>
                  {getInitial(agent.name)}
                </div>
                <span className="agent-card-name">{agent.name}</span>
                <span className="agent-card-model">{agent.model}</span>
              </div>
              <div className="agent-card-status">
                <span className={`status-dot ${agent.status}`} />
                {agent.status === 'idle' && '空闲'}
                {agent.status === 'thinking' && '思考中...'}
                {agent.status === 'executing_skill' && '执行技能...'}
                {agent.status === 'rate_limited' && '额度受限'}
                {agent.status === 'error' && '错误'}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── New Session Modal ── */}
      {showNewModal && (
        <div className="modal-overlay" onClick={() => setShowNewModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h2>创建新会话</h2>
            <input
              className="modal-input"
              placeholder="会话名称"
              value={newSessionName}
              onChange={e => setNewSessionName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleCreateSession()}
              autoFocus
            />
            <div className="modal-actions">
              <button className="modal-btn secondary" onClick={() => setShowNewModal(false)}>
                取消
              </button>
              <button className="modal-btn primary" onClick={handleCreateSession}>
                创建
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
