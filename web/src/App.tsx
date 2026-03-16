// ── Colony: Main App ─────────────────────────────────────
import React, { useState, useEffect, useCallback } from 'react';
import './index.css';
import { useWebSocket, type WSEvent } from './hooks/useWebSocket';
import {
  fetchSessions, fetchMessages, fetchAgents,
  createSession, joinSession, sendMessage, stopSession, deleteSession,
  updateSessionAgents,
  type Session, type Message, type AgentInfo, type Participant
} from './api';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Paperclip, Send, X } from 'lucide-react';
import { MonologueBlock } from './MonologueBlock';
import { HumanInputRequest } from './HumanInputRequest';
import { getSessionDisplayNumber, shouldRefreshSessionsForEvent } from './sessionHealth';

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
  const [attachments, setAttachments] = useState<{ type: string; url: string }[]>([]);
  const [newSessionAgentIds, setNewSessionAgentIds] = useState<string[]>([]);
  const [showEditAgentsModal, setShowEditAgentsModal] = useState(false);
  const [editingSessionAgentIds, setEditingSessionAgentIds] = useState<string[]>([]);
  const [submittedInputRequests, setSubmittedInputRequests] = useState<Set<string>>(new Set());

  // Load initial data
  useEffect(() => {
    fetchSessions().then(setSessions).catch(console.error);
    fetchAgents().then(setAgents).catch(console.error);
  }, []);

  // Load messages when session changes
  useEffect(() => {
    let isCurrent = true;
    setMessages([]); // Clear immediately to prevent ghosting
    
    if (activeSession) {
      fetchMessages(activeSession).then(fetchedMessages => {
        if (!isCurrent) return;
        
        setMessages(prev => {
          // Merge: fetched messages are the base, but we must preserve any 
          // messages that arrived via WebSocket while the fetch was in flight.
          const merged = [...fetchedMessages];
          prev.forEach(p => {
            if (!merged.some(m => m.id === p.id)) {
              merged.push(p);
            }
          });

          // Sort by timestamp to maintain correct chat order
          return merged.sort((a, b) => 
            new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
          );
        });
      }).catch(console.error);
    }
    
    return () => { isCurrent = false; };
  }, [activeSession]);

  // WebSocket for real-time updates
  const handleWSEvent = useCallback((event: WSEvent) => {
    if (event.type === 'message' && event.data) {
      const msg = event.data as Message;
      setMessages(prev => {
        // FINAL GATE: Verify that the message indeed belongs to the currently active session
        if (msg.roomId !== activeSession) return prev;
        // Deduplicate
        if (prev.some(m => m.id === msg.id)) return prev;
        return [...prev, msg];
      });
    }

    if (event.type === 'message_updated' && event.data) {
      const updated = event.data as Message;
      setMessages(prev => {
        // FINAL GATE: Verify that the message indeed belongs to the currently active session
        if (updated.roomId !== activeSession) return prev;
        return prev.map(m => m.id === updated.id ? { ...m, content: updated.content, metadata: updated.metadata } : m);
      });
    }

    if (event.type === 'session_stopped') {
      // Future-proofing for visual Stop alerts if needed.
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
        // Safety net: clear any stale isPending messages for this agent
        setMessages(prev =>
          prev.map(m =>
            m.metadata?.isPending && m.sender.id === event.agentId
              ? { ...m, metadata: { ...m.metadata, isPending: false }, content: m.content || '(已完成)' }
              : m
          )
        );
      }
    }

    if (shouldRefreshSessionsForEvent(event)) {
      fetchSessions().then(setSessions).catch(console.error);
    }
  }, [activeSession]);

  useWebSocket('ws://localhost:3001', handleWSEvent, activeSession);

  // Auto-scroll to bottom
  useEffect(() => {
    const el = document.querySelector('.chat-messages');
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  // ── Handlers ────────────────────────────────────────

  function openNewSessionModal() {
    setNewSessionAgentIds(agents.map(a => a.id));
    setShowNewModal(true);
  }

  function openEditAgentsModal() {
    if (!activeSessionData) return;
    const currentAgentIds = activeSessionData.participants
      .filter(p => p.type === 'agent')
      .map(p => p.id);
    setEditingSessionAgentIds(currentAgentIds);
    setShowEditAgentsModal(true);
  }

  function toggleAgentSelection(agentId: string, isNewSession: boolean = true) {
    if (isNewSession) {
      setNewSessionAgentIds(prev =>
        prev.includes(agentId) ? prev.filter(id => id !== agentId) : [...prev, agentId]
      );
    } else {
      setEditingSessionAgentIds(prev =>
        prev.includes(agentId) ? prev.filter(id => id !== agentId) : [...prev, agentId]
      );
    }
  }

  async function handleCreateSession() {
    if (!newSessionName.trim()) return;
    if (newSessionAgentIds.length === 0) return;
    const workingDir = newSessionWorkingDir.trim() || undefined;
    const session = await createSession(newSessionName.trim(), newSessionAgentIds, workingDir);
    // Join as human
    await joinSession(session.id, { id: USER_ID, type: 'human', name: USER_NAME });
    setSessions(prev => [...prev, session]);
    setActiveSession(session.id);
    setShowNewModal(false);
    setNewSessionName('');
    setNewSessionWorkingDir('');
    setNewSessionAgentIds([]);
  }

  async function handleUpdateAgents() {
    if (!activeSession || editingSessionAgentIds.length === 0) return;
    try {
      const updatedSession = await updateSessionAgents(activeSession, editingSessionAgentIds);
      setSessions(prev => prev.map(s => s.id === activeSession ? updatedSession : s));
      setShowEditAgentsModal(false);
    } catch (error) {
      alert('更新 Agent 失败: ' + (error as Error).message);
    }
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

    await sendMessage(activeSession, USER_ID, input.trim(), mentions, { attachments });
    setInput('');
    setAttachments([]);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    // Block Enter during IME composition (e.g. Chinese input confirming English with Enter)
    // keyCode 229 = IME processing marker, covers edge cases where isComposing is unreliable
    if (e.nativeEvent.isComposing || e.keyCode === 229) return;

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  async function handleStopGeneration() {
    if (!activeSession) return;
    try {
      await stopSession(activeSession);
    } catch (error) {
      console.error('Failed to stop generation:', error);
    }
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

  function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files) return;

    Array.from(files).forEach((file) => {
      if (!file.type.startsWith('image/')) return;
      const reader = new FileReader();
      reader.onload = (event) => {
        if (event.target?.result) {
          setAttachments(prev => [...prev, { type: 'image', url: event.target!.result as string }]);
        }
      };
      reader.readAsDataURL(file);
    });
    e.target.value = ''; // reset
  }

  function removeAttachment(index: number) {
    setAttachments(prev => prev.filter((_, i) => i !== index));
  }

  async function handleHumanInputSubmit(requestId: string, response: string) {
    if (!activeSession) return;

    try {
      await sendMessage(activeSession, USER_ID, response, [], {
        humanInputResponse: {
          requestId,
          response
        }
      });
      setSubmittedInputRequests(prev => new Set(prev).add(requestId));
    } catch (error) {
      console.error('Failed to submit human input:', error);
      alert('提交失败: ' + (error as Error).message);
    }
  }

  const activeSessionData = sessions.find(s => s.id === activeSession);

  const groupedMessages: { sender: Participant, messages: Message[], timestamp: string, id: string }[] = [];
  messages.forEach(msg => {
    const lastGroup = groupedMessages[groupedMessages.length - 1];
    if (lastGroup && lastGroup.sender.id === msg.sender.id) {
      lastGroup.messages.push(msg);
    } else {
      groupedMessages.push({
        sender: msg.sender,
        messages: [msg],
        timestamp: msg.timestamp as unknown as string,
        id: msg.id
      });
    }
  });

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

        <button className="new-session-btn" onClick={openNewSessionModal}>
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
              </div>
              <div className="chat-header-actions" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <button
                  className="pause-btn"
                  onClick={handleStopGeneration}
                  style={{
                    padding: '4px 10px',
                    borderRadius: '4px',
                    border: '1px solid #ddd',
                    background: '#ffebee',
                    color: '#c62828',
                    cursor: 'pointer',
                    fontSize: '0.9em'
                  }}
                >
                  ⏹️ 停止
                </button>
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
                groupedMessages.map(group => (
                  <div
                    key={group.id}
                    className={`message ${group.sender.id === USER_ID ? 'self' : ''}`}
                  >
                    <div className={`message-avatar ${getAgentColor(group.sender.id)}`}>
                      {getInitial(group.sender.name)}
                    </div>
                    <div className="message-body">
                      <div className="message-header">
                        <span className="message-sender">{group.sender.name}</span>
                        <span className="message-time">{formatTime(group.timestamp)}</span>
                      </div>

                      {group.messages.map((msg, idx) => (
                        <React.Fragment key={msg.id}>
                          {msg.metadata?.humanInputRequest ? (
                            <HumanInputRequest
                              requestId={msg.metadata.humanInputRequest.requestId}
                              prompt={msg.metadata.humanInputRequest.prompt}
                              onSubmit={handleHumanInputSubmit}
                              isSubmitted={submittedInputRequests.has(msg.metadata.humanInputRequest.requestId)}
                            />
                          ) : msg.metadata?.isMonologue ? (
                            <MonologueBlock
                              text={msg.content}
                              toolCalls={msg.metadata.toolCalls}
                              error={msg.metadata.error}
                              isPending={msg.metadata.isPending}
                            />
                          ) : (
                            // Only render the message content if it actually has text or attachments
                            (msg.content.trim() || (msg.metadata?.attachments && msg.metadata.attachments.length > 0)) ? (
                              <div className="message-content" style={{ marginTop: idx > 0 ? 8 : 0 }}>
                                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                  {msg.content}
                                </ReactMarkdown>

                                {msg.metadata?.attachments && msg.metadata.attachments.length > 0 && (
                                  <div className="attachment-preview">
                                    {msg.metadata.attachments.map((att, attIdx) => (
                                      <div key={attIdx} className="attachment-thumbnail">
                                        <img src={att.url} alt="attachment" />
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            ) : null
                          )}
                        </React.Fragment>
                      ))}
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
              <div className="chat-input-wrapper" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
                {attachments.length > 0 && (
                  <div className="attachment-preview">
                    {attachments.map((att, idx) => (
                      <div key={idx} className="attachment-thumbnail">
                        <img src={att.url} alt="upload preview" />
                        <button className="attachment-remove" onClick={() => removeAttachment(idx)}>
                          <X size={10} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <div className="input-actions-row">
                  <label className="btn-icon" title="上传图片">
                    <input type="file" accept="image/*" multiple hidden onChange={handleImageUpload} />
                    <Paperclip size={18} />
                  </label>
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
                    disabled={!input.trim() && attachments.length === 0}
                  >
                    <Send size={16} style={{ marginRight: 6 }} /> 发送
                  </button>
                </div>
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
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <div className="agent-panel-title" style={{ marginBottom: 0 }}>Agents</div>
            <button
              onClick={openEditAgentsModal}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--text-accent)',
                fontSize: '11px',
                fontWeight: 600,
                cursor: 'pointer',
                padding: '2px 4px'
              }}
            >
              修改
            </button>
          </div>
          {agents
            .filter(agent => activeSessionData?.participants.some(p => p.id === agent.id))
            .map(agent => {
              const participant = activeSessionData?.participants.find(p => p.id === agent.id);
              const health = participant?.sessionHealth;
              return (
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

                  {health && (
                    <div className="agent-card-health" style={{ marginTop: 8, fontSize: 11, color: '#888' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                        <span>Session #{getSessionDisplayNumber(participant)}</span>
                        <span title={`${health.tokensUsed} / ${health.contextLimit} tokens`}>
                          {health.label} ({(health.fillRatio * 100).toFixed(0)}%)
                        </span>
                      </div>
                      <div style={{ width: '100%', height: 4, background: '#333', borderRadius: 2, overflow: 'hidden' }}>
                        <div
                          style={{
                            width: `${Math.min(100, health.fillRatio * 100)}%`,
                            height: '100%',
                            background: health.fillRatio > 0.88 ? '#e74c3c' : health.fillRatio > 0.75 ? '#f39c12' : '#2ecc71',
                            transition: 'width 0.3s ease'
                          }}
                        />
                      </div>
                    </div>
                  )}

                  {agent.description && (
                    <div className="agent-card-description">
                      {agent.description}
                    </div>
                  )}
                </div>
              )
            })}
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

            {/* Agent selection */}
            <div className="modal-agent-select">
              <div style={{ fontWeight: 500, marginBottom: '8px', color: '#333' }}>选择参与的 Agent：</div>
              <div className="modal-agent-list">
                {agents.map(agent => (
                  <label key={agent.id} className="modal-agent-item">
                    <input
                      type="checkbox"
                      checked={newSessionAgentIds.includes(agent.id)}
                      onChange={() => toggleAgentSelection(agent.id)}
                    />
                    <div className={`message-avatar ${getAgentColor(agent.id)}`} style={{ width: 22, height: 22, fontSize: 10 }}>
                      {getInitial(agent.name)}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 500, fontSize: '13px' }}>{agent.name}</div>
                      {agent.description && (
                        <div style={{ fontSize: '11px', color: '#888' }}>{agent.description}</div>
                      )}
                    </div>
                    <span style={{ fontSize: '11px', color: '#aaa' }}>{agent.model}</span>
                  </label>
                ))}
              </div>
              {newSessionAgentIds.length === 0 && (
                <div style={{ fontSize: '12px', color: '#ef4444', marginTop: '6px' }}>请至少选择一个 Agent</div>
              )}
            </div>
            <div className="modal-actions">
              <button className="modal-btn secondary" onClick={() => setShowNewModal(false)}>
                取消
              </button>
              <button
                className="modal-btn primary"
                onClick={handleCreateSession}
                disabled={!newSessionName.trim() || newSessionAgentIds.length === 0}
              >
                创建
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Edit Agents Modal ── */}
      {showEditAgentsModal && (
        <div className="modal-overlay" onClick={() => setShowEditAgentsModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h2>修改会话参与 Agent</h2>
            <div style={{ fontSize: '13px', color: '#666', marginBottom: '16px' }}>
              正在修改会话：<strong>{activeSessionData?.name}</strong>
            </div>

            {/* Agent selection */}
            <div className="modal-agent-select">
              <div className="modal-agent-list">
                {agents.map(agent => (
                  <label key={agent.id} className="modal-agent-item">
                    <input
                      type="checkbox"
                      checked={editingSessionAgentIds.includes(agent.id)}
                      onChange={() => toggleAgentSelection(agent.id, false)}
                    />
                    <div className={`message-avatar ${getAgentColor(agent.id)}`} style={{ width: 22, height: 22, fontSize: 10 }}>
                      {getInitial(agent.name)}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 500, fontSize: '13px' }}>{agent.name}</div>
                      {agent.description && (
                        <div style={{ fontSize: '11px', color: '#888' }}>{agent.description}</div>
                      )}
                    </div>
                    <span style={{ fontSize: '11px', color: '#aaa' }}>{agent.model}</span>
                  </label>
                ))}
              </div>
              {editingSessionAgentIds.length === 0 && (
                <div style={{ fontSize: '12px', color: '#ef4444', marginTop: '6px' }}>请至少选择一个 Agent</div>
              )}
            </div>
            <div className="modal-actions">
              <button className="modal-btn secondary" onClick={() => setShowEditAgentsModal(false)}>
                取消
              </button>
              <button
                className="modal-btn primary"
                onClick={handleUpdateAgents}
                disabled={editingSessionAgentIds.length === 0}
              >
                保存修改
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
