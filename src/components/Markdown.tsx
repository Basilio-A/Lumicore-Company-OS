import { useMemo, type ReactNode } from 'react';

function inline(text: string, key: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let rest = text;
  let i = 0;
  const push = (node: ReactNode) => nodes.push(node);

  // Process bold, italic, inline code, links
  const patterns: { regex: RegExp; render: (m: RegExpExecArray) => ReactNode }[] = [
    { regex: /\*\*(.+?)\*\*/, render: (m) => <strong key={`b${i}`}>{m[1]}</strong> },
    { regex: /\*(.+?)\*/, render: (m) => <em key={`i${i}`}>{m[1]}</em> },
    { regex: /`(.+?)`/, render: (m) => <code key={`c${i}`}>{m[1]}</code> },
    {
      regex: /\[(.+?)\]\((.+?)\)/,
      render: (m) => (
        <a key={`a${i}`} href={m[2]} target="_blank" rel="noreferrer">
          {m[1]}
        </a>
      ),
    },
  ];

  while (rest.length > 0) {
    let earliest = -1;
    let match: RegExpExecArray | null = null;
    let render: ((m: RegExpExecArray) => ReactNode) | null = null;
    for (const p of patterns) {
      const m = p.regex.exec(rest);
      if (m && (earliest === -1 || m.index < earliest)) {
        earliest = m.index;
        match = m;
        render = p.render;
      }
    }
    if (!match || !render) {
      push(rest);
      break;
    }
    if (match.index > 0) push(rest.slice(0, match.index));
    push(render(match));
    rest = rest.slice(match.index + match[0].length);
    i++;
  }
  return nodes;
}

export function Markdown({ content }: { content: string }) {
  const blocks = useMemo(() => {
    const lines = content.split('\n');
    const result: ReactNode[] = [];
    let i = 0;
    let key = 0;

    while (i < lines.length) {
      const line = lines[i];

      // blank line
      if (!line?.trim()) {
        i++;
        continue;
      }

      // heading
      const h = /^(#{1,6})\s+(.*)$/.exec(line);
      if (h) {
        const level = h[1].length;
        const Tag = `h${Math.min(level, 3)}` as 'h1' | 'h2' | 'h3';
        result.push(<Tag key={key++}>{inline(h[2], `h${key}`)}</Tag>);
        i++;
        continue;
      }

      // hr
      if (/^---+$/.test(line.trim())) {
        result.push(<hr key={key++} />);
        i++;
        continue;
      }

      // blockquote
      if (line.startsWith('>')) {
        const buf: string[] = [];
        while (i < lines.length && lines[i].startsWith('>')) {
          buf.push(lines[i].slice(1).trim());
          i++;
        }
        result.push(<blockquote key={key++}>{inline(buf.join(' '), `bq${key}`)}</blockquote>);
        continue;
      }

      // code block
      if (line.startsWith('```')) {
        const buf: string[] = [];
        i++;
        while (i < lines.length && !lines[i].startsWith('```')) {
          buf.push(lines[i]);
          i++;
        }
        i++;
        result.push(
          <pre key={key++}>
            <code>{buf.join('\n')}</code>
          </pre>
        );
        continue;
      }

      // unordered list
      if (/^[-*]\s+/.test(line)) {
        const items: ReactNode[] = [];
        while (i < lines.length && /^[-*]\s+/.test(lines[i])) {
          items.push(<li key={key++}>{inline(lines[i].replace(/^[-*]\s+/, ''), `li${key}`)}</li>);
          i++;
        }
        result.push(<ul key={`ul${key++}`}>{items}</ul>);
        continue;
      }

      // ordered list
      if (/^\d+\.\s+/.test(line)) {
        const items: ReactNode[] = [];
        while (i < lines.length && /^\d+\.\s+/.test(lines[i])) {
          items.push(<li key={key++}>{inline(lines[i].replace(/^\d+\.\s+/, ''), `ol${key}`)}</li>);
          i++;
        }
        result.push(<ol key={`ol${key++}`}>{items}</ol>);
        continue;
      }

      // paragraph
      const buf: string[] = [];
      while (
        i < lines.length &&
        lines[i].trim() &&
        !/^(#{1,6}\s|>|```|---+$|[-*]\s|\d+\.\s)/.test(lines[i])
      ) {
        buf.push(lines[i]);
        i++;
      }
      result.push(<p key={key++}>{inline(buf.join(' '), `p${key}`)}</p>);
    }
    return result;
  }, [content]);

  return <div className="md">{blocks}</div>;
}
