import { useState } from 'react';
import type { ChatMessage } from '../types';
import { CATEGORY_META } from '../types';

interface Props {
  message: ChatMessage;
  onCardActionClick?: (textValue: string, draftContext?: any) => void;
  isActiveCard?: boolean;
}

export default function MessageBubble({ message, onCardActionClick, isActiveCard }: Props) {
  const { type, text, timestamp, category, entry, imageUrl } = message;
  const [activeZoomUrl, setActiveZoomUrl] = useState<string | null>(null);

  const time = new Date(timestamp).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });

  const meta = category ? CATEGORY_META[category] : null;

  // Simple, lightweight Markdown-style formatter (zero external dependencies)
  const renderFormattedText = (rawText: string) => {
    if (!rawText) return null;

    const lines = rawText.split('\n');
    let insideList = false;
    let insideTable = false;
    let listItems: React.ReactNode[] = [];
    let tableRows: string[][] = [];
    const elements: React.ReactNode[] = [];

    const formatLineContent = (lineStr: string) => {
      if (!lineStr) return '';

      // Auto-bold key-value patterns (e.g. "Calories: 420" -> "**Calories**: 420")
      const colonIndex = lineStr.indexOf(':');
      if (colonIndex > 0 && colonIndex < 35 && !lineStr.substring(0, colonIndex).includes('/')) {
        const key = lineStr.substring(0, colonIndex);
        const val = lineStr.substring(colonIndex + 1);
        const trimmedKey = key.trim();
        if (!trimmedKey.includes('**') && /^[a-zA-Z0-9\s\-_]+$/.test(trimmedKey) && trimmedKey.length > 1) {
          lineStr = `**${trimmedKey}**:${val}`;
        }
      }

      // Handle markdown images: ![alt](url)
      const imgRegex = /!\[(.*?)\]\((.*?)\)/g;
      const imgMatch = imgRegex.exec(lineStr);
      if (imgMatch) {
        return (
          <div className="msg-media-attachment">
            <img 
              src={imgMatch[2]} 
              alt={imgMatch[1]} 
              className="msg-media-img" 
              onClick={() => setActiveZoomUrl(imgMatch[2])}
            />
            {imgMatch[1] && <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '4px', textAlign: 'center' }}>{imgMatch[1]}</div>}
          </div>
        );
      }

      const formatLinksTagsAndText = (str: string): React.ReactNode[] => {
        if (!str) return [];
        const regex = /((?:#[a-zA-Z0-9\-_]+)|(?:\[[^\]]+\]\(https?:\/\/[^\s)]+\))|(?:https?:\/\/[^\s)]+))/g;
        const splitParts = str.split(regex);
        return splitParts.map((part, index) => {
          if (!part) return null;
          if (part.startsWith('#')) {
            return <span key={`tag-${index}`} className="hashtag-badge">{part}</span>;
          }
          const mdLinkMatch = /^\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)$/.exec(part);
          if (mdLinkMatch) {
            const [, label, url] = mdLinkMatch;
            return (
              <a 
                key={`link-${index}`} 
                href={url} 
                target="_blank" 
                rel="noopener noreferrer" 
                className="chat-link"
                style={{ color: '#f43f5e', textDecoration: 'underline', fontWeight: 500 }}
              >
                {label}
              </a>
            );
          }
          if (/^https?:\/\//.test(part)) {
            return (
              <a 
                key={`raw-link-${index}`} 
                href={part} 
                target="_blank" 
                rel="noopener noreferrer" 
                className="chat-link"
                style={{ color: '#f43f5e', textDecoration: 'underline', fontWeight: 500 }}
              >
                {part}
              </a>
            );
          }
          return part;
        }).filter(Boolean) as React.ReactNode[];
      };

      // Handle bold **text**, hashtags, and links
      const parts: React.ReactNode[] = [];
      const boldRegex = /\*\*(.*?)\*\*/g;
      let lastIndex = 0;
      let match;

      while ((match = boldRegex.exec(lineStr)) !== null) {
        if (match.index > lastIndex) {
          parts.push(...formatLinksTagsAndText(lineStr.substring(lastIndex, match.index)));
        }
        parts.push(<strong key={match.index}>{match[1]}</strong>);
        lastIndex = boldRegex.lastIndex;
      }

      if (lastIndex < lineStr.length) {
        parts.push(...formatLinksTagsAndText(lineStr.substring(lastIndex)));
      }

      return parts;
    };

    const flushList = (key: string) => {
      if (insideList && listItems.length > 0) {
        elements.push(<ul key={key}>{[...listItems]}</ul>);
        insideList = false;
        listItems = [];
      }
    };

    const flushTable = (key: string) => {
      if (insideTable && tableRows.length > 0) {
        const cleanRows = tableRows.filter(r => !r.every(cell => cell.trim().match(/^-+$/) || cell.trim() === ''));
        
        if (cleanRows.length > 0) {
          const header = cleanRows[0];
          const body = cleanRows.slice(1);
          
          elements.push(
            <div className="table-responsive" key={key}>
              <table>
                <thead>
                  <tr>
                    {header.map((cell, idx) => (
                      <th key={`th-${idx}`}>{formatLineContent(cell.trim())}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {body.map((row, rIdx) => (
                    <tr key={`tr-${rIdx}`}>
                      {row.map((cell, cIdx) => (
                        <td key={`td-${cIdx}`}>{formatLineContent(cell.trim())}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }
        insideTable = false;
        tableRows = [];
      }
    };

    lines.forEach((line, idx) => {
      const trimmed = line.trim();
      const isTableRow = trimmed.startsWith('|');
      const isBullet = trimmed.startsWith('* ') || trimmed.startsWith('- ') || trimmed.startsWith('+ ') || (trimmed.match(/^\d+\.\s/) !== null);
      const isHeader = trimmed.match(/^(#{1,4})\s+(.*)$/);

      if (isTableRow) {
        flushList(`list-before-table-${idx}`);
        if (!insideTable) {
          insideTable = true;
          tableRows = [];
        }
        const cells = line.split('|').map(c => c.trim()).filter((_, cIdx, arr) => cIdx > 0 && cIdx < arr.length - 1);
        tableRows.push(cells);
      } else if (isBullet) {
        flushTable(`table-before-list-${idx}`);
        if (!insideList) {
          insideList = true;
          listItems = [];
        }
        const bulletText = trimmed.replace(/^([\*\-\+\d\.]+)\s+/, '');
        const isSubBullet = line.startsWith(' ') || line.startsWith('\t');
        listItems.push(
          <li 
            key={`li-${idx}`} 
            style={isSubBullet ? { marginLeft: '16px', listStyleType: 'circle', color: '#9f9b96' } : {}}
          >
            {formatLineContent(bulletText)}
          </li>
        );
      } else if (isHeader) {
        flushList(`list-before-header-${idx}`);
        flushTable(`table-before-header-${idx}`);
        const level = isHeader[1].length;
        const headerText = isHeader[2];
        const content = formatLineContent(headerText);
        
        if (level === 1) elements.push(<h1 key={`h1-${idx}`}>{content}</h1>);
        else if (level === 2) elements.push(<h2 key={`h2-${idx}`}>{content}</h2>);
        else if (level === 3) elements.push(<h3 key={`h3-${idx}`}>{content}</h3>);
        else elements.push(<h4 key={`h4-${idx}`}>{content}</h4>);
      } else {
        flushList(`list-before-p-${idx}`);
        flushTable(`table-before-p-${idx}`);

        if (trimmed === '') {
          elements.push(<div key={`br-${idx}`} className="h-2" />);
        } else {
          elements.push(
            <p key={`p-${idx}`}>
              {formatLineContent(line)}
            </p>
          );
        }
      }
    });

    flushList('list-end');
    flushTable('table-end');

    return elements;
  };

  return (
    <div className={`msg-wrapper ${type}`}>
      {/* Full-screen Lightbox Zoom Modal */}
      {activeZoomUrl && (
        <div className="image-zoom-overlay" onClick={() => setActiveZoomUrl(null)}>
          <div className="image-zoom-content" onClick={e => e.stopPropagation()}>
            <img src={activeZoomUrl} alt="Zoomed view" className="image-zoom-img" />
            <button className="image-zoom-close" onClick={() => setActiveZoomUrl(null)}>✕</button>
          </div>
        </div>
      )}

      <div className="msg-card">
        {type === 'system' && meta && (
          <div className={`msg-badge ${category}`}>
            <span>{meta.icon}</span>
            <span>{meta.label}</span>
          </div>
        )}
        {imageUrl && (
          <div className="msg-media-attachment" style={{ marginBottom: '10px' }}>
            <img 
              src={imageUrl} 
              alt="Uploaded attachment" 
              className="msg-media-img" 
              onClick={() => setActiveZoomUrl(imageUrl)}
            />
          </div>
        )}
        {entry?.data?.image_url && (
          <div className="msg-media-attachment" style={{ marginBottom: '10px' }}>
            <img 
              src={entry.data.image_url as string} 
              alt="Logged attachment" 
              className="msg-media-img" 
              onClick={() => setActiveZoomUrl(entry.data.image_url as string)}
            />
          </div>
        )}
        <div className="msg-content-text">
          {renderFormattedText(text)}
        </div>

        {/* Interactive UI Card */}
        {message.interactiveCard && (
          <div className="interactive-card">
            <div className="interactive-card-header">
              <span className="interactive-card-icon">⚠️</span>
              <span className="interactive-card-title">Duplicate Entry Detected</span>
            </div>
            <p className="interactive-card-text">{message.interactiveCard.message}</p>
            <div className="interactive-card-options">
              {message.interactiveCard.options.map((opt, oIdx) => (
                <button
                  key={oIdx}
                  disabled={!isActiveCard}
                  className={`card-btn ${opt.style || 'secondary'} ${!isActiveCard ? 'disabled' : ''}`}
                  onClick={() => {
                    if (onCardActionClick) {
                      onCardActionClick(opt.textValue);
                    }
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="msg-time">{time}</div>
      </div>
    </div>
  );
}
