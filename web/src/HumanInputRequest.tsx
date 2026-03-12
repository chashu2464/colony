// ── Colony: Human Input Request Component ────────────────
import React, { useState } from 'react';
import { Send } from 'lucide-react';

interface HumanInputRequestProps {
  requestId: string;
  prompt: string;
  onSubmit: (requestId: string, response: string) => void;
  isSubmitted?: boolean;
}

export function HumanInputRequest({
  requestId,
  prompt,
  onSubmit,
  isSubmitted = false
}: HumanInputRequestProps) {
  const [response, setResponse] = useState('');
  const [submitted, setSubmitted] = useState(isSubmitted);

  const handleSubmit = () => {
    if (!response.trim() || submitted) return;
    onSubmit(requestId, response.trim());
    setSubmitted(true);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="human-input-request">
      <div className="human-input-prompt">
        <span className="prompt-icon">🤔</span>
        <span className="prompt-text">{prompt}</span>
      </div>

      {!submitted ? (
        <div className="human-input-form">
          <textarea
            className="human-input-textarea"
            placeholder="输入你的回复..."
            value={response}
            onChange={e => setResponse(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={2}
            autoFocus
          />
          <button
            className="human-input-submit"
            onClick={handleSubmit}
            disabled={!response.trim()}
          >
            <Send size={14} style={{ marginRight: 4 }} />
            提交
          </button>
        </div>
      ) : (
        <div className="human-input-submitted">
          ✓ 已提交响应
        </div>
      )}
    </div>
  );
}
