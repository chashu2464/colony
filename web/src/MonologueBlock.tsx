import { useState } from 'react';
import { ChevronRight, ChevronDown, Terminal, Loader } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

export function MonologueBlock({ text, toolCalls, error, isPending }: {
  text?: string;
  toolCalls?: any[];
  error?: string;
  isPending?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);

  // Pending state: show a simple animated indicator (not expandable)
  if (isPending) {
    return (
      <div className="monologue-container monologue-pending">
        <div className="monologue-header">
          <Loader size={14} className="monologue-spinner" />
          <span className="monologue-title">{text || '正在思考...'}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="monologue-container">
      <div className="monologue-header" onClick={() => setExpanded(!expanded)}>
        {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <Terminal size={14} className="monologue-icon" />
        <span className="monologue-title">
          {error ? 'Agent Error' : `心里话: ${toolCalls?.length ? `调用了 ${toolCalls.length} 个工具` : '内部推理'}`}
        </span>
      </div>

      {expanded && (
        <div className="monologue-content">
          {error && <div className="monologue-error">{error}</div>}

          {text && text !== '(Silent Execution)' && (
            <div className="monologue-text">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
            </div>
          )}

          {toolCalls && toolCalls.length > 0 && (
            <div className="monologue-tools">
              {toolCalls.map((tool, idx) => (
                <div key={idx} className="tool-call-block">
                  <div className="tool-call-header">
                    <span className="tool-name">▶ {tool.name}</span>
                  </div>
                  <pre className="tool-call-input">
                    {JSON.stringify(tool.input, null, 2)}
                  </pre>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
