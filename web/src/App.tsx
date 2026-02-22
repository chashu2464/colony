// ── Colony: Main App ─────────────────────────────────────
import { useState, useEffect, useCallback } from 'react';
import './index.css';
import { useWebSocket, type WSEvent } from './hooks/useWebSocket';
import {
  fetchSessions, fetchMessages, fetchAgents,
  createSession, joinSession, sendMessage, pauseSession, resumeSession, deleteSession,
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
  const [newSessionWorkingDir, setNewSessionWorkingDir] = useState('');
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

    if (event.type === 'session_paused') {
      const roomId = (event as any).roomId;
      setSessions(prev => prev.map(s => s.id === roomId ? { ...s, isPaused: true } : s));
    }

    if (event.type === 'session_resumed') {
      const roomId = (event as any).roomId;
      setSessions(prev => prev.map(s => s.id === roomId ? { ...s, isPaused: false } : s));
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
    const workingDir = newSessionWorkingDir.trim() || undefined;
    const session = await createSession(newSessionName.trim(), undefined, workingDir);
    // Join as human
    await joinSession(session.id, { id: USER_ID, type: 'human', name: USER_NAME });
    setSessions(prev => [...prev, session]);
    setActiveSession(session.id);
    setShowNewModal(false);
    setNewSessionName('');
    setNewSessionWorkingDir('');
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

  async function handleTogglePause() {
    if (!activeSession) return;
    const session = sessions.find(s => s.id === activeSession);
    if (!session) return;
    if (session.isPaused) {
      await resumeSession(activeSession);
    } else {
      await pauseSession(activeSession);
    }
    // Update local state optimistically
    setSessions(prev => prev.map(s => s.id === activeSession ? { ...s, isPaused: !session.isPaused } : s));
  }

  async function handleDeleteSession(sessionId: string) {
    if (!confirm('确定要删除这个会话吗？所有消息历史将被永久删除。')) return;

    try {
      await deleteSession(sessionId);
      setSessions(prev => prev.filter(s => s.id !== sessionId));
      if (activeSession === sessionId) {
        setActiveSession(null);
      }
    } catch (error) {
      alert('删除会话失败: ' + (error as Error).message);
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
            >
              <div
                style={{ display: 'flex', alignItems: 'center', flex: 1, cursor: 'pointer' }}
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
              <button
                className="delete-session-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  handleDeleteSession(session.id);
                }}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#999',
                  cursor: 'pointer',
                  padding: '4px 8px',
                  fontSize: '16px',
                  opacity: 0.6,
                  transition: 'opacity 0.2s'
                }}
                onMouseEnter={(e) => e.currentTarget.style.opacity = '1'}
                onMouseLeave={(e) => e.currentTarget.style.opacity = '0.6'}
                title="删除会话"
              >
                🗑️
              </button>
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
              <div className="chat-header-title">
                {activeSessionData.name}
                {activeSessionData.isPaused && <span className="paused-badge" style={{ marginLeft: 8, fontSize: '0.8em', background: '#ffebee', color: '#c62828', padding: '2px 6px', borderRadius: 4 }}>已暂停</span>}
              </div>
              <div className="chat-header-actions" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <button
                  className="pause-btn"
                  onClick={handleTogglePause}
                  style={{
                    padding: '4px 10px',
                    borderRadius: '4px',
                    border: '1px solid #ddd',
                    background: 'white',
                    cursor: 'pointer',
                    fontSize: '0.9em'
                  }}
                >
                  {activeSessionData.isPaused ? '▶ 恢复' : '⏸ 暂停'}
                </button>
                <div className="chat-header-agents">
                  {agents.map(agent => (
                    <div key={agent.id} className="agent-badge">
                      <span className={`status-dot ${agent.status}`} />
                      {agent.name}
                    </div>
                  ))}
                </div>
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
              {activeSessionData.isPaused ? (
                <div className="chat-input-paused" style={{ textAlign: 'center', padding: '20px', color: '#666', background: '#f5f5f5', borderRadius: '8px' }}>
                  <p>当前会话已暂停，无法发送消息</p>
                  <button
                    onClick={handleTogglePause}
                    style={{ marginTop: '10px', padding: '6px 16px', background: '#007bff', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                  >
                    恢复会话
                  </button>
                </div>
              ) : (
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
              )}
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
              onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleCreateSession()}
              autoFocus
            />
            <input
              className="modal-input"
              placeholder="工作目录（可选，留空则使用 Colony 目录）"
              value={newSessionWorkingDir}
              onChange={e => setNewSessionWorkingDir(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleCreateSession()}
              style={{ marginTop: '10px' }}
            />
            <div style={{ fontSize: '0.85em', color: '#666', marginTop: '8px', marginBottom: '12px' }}>
              示例: /Users/username/projects/my-app
            </div>
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
