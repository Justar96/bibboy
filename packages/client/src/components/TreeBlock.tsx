interface TreeBlockProps {
  children: string;
}

interface Token {
  text: string;
  color?: string;
  weight?: number;
}

export default function TreeBlock({ children }: TreeBlockProps) {
  const lines = children.split('\n');
  
  const colorizeTreeLine = (line: string): Token[] => {
    const tokens: Token[] = [];
    let i = 0;
    
    while (i < line.length) {
      // Check for tree characters
      if (/[├└│─┌┐┘┴┬┤╭╮╯╰]/.test(line[i])) {
        tokens.push({ text: line[i], color: '#6e7781' });
        i++;
        continue;
      }
      
      // Check for node types (must start with capital letter)
      const nodeTypeMatch = line.substring(i).match(/^([A-Z][a-zA-Z]*(?:Declaration|Statement|Expression|Literal|Definition|Block))/);
      if (nodeTypeMatch) {
        tokens.push({ text: nodeTypeMatch[1], color: '#0969da', weight: 600 });
        i += nodeTypeMatch[1].length;
        continue;
      }
      
      // Check for Identifier (special node type)
      const identifierMatch = line.substring(i).match(/^(Identifier)\b/);
      if (identifierMatch) {
        tokens.push({ text: identifierMatch[1], color: '#1f883d', weight: 600 });
        i += identifierMatch[1].length;
        continue;
      }
      
      // Check for quoted strings
      if (line[i] === '"') {
        const endQuote = line.indexOf('"', i + 1);
        if (endQuote !== -1) {
          const quotedText = line.substring(i, endQuote + 1);
          tokens.push({ text: quotedText, color: '#0a3069', weight: 400 });
          i = endQuote + 1;
          continue;
        }
      }
      
      // Check for property names (word followed by colon)
      const propertyMatch = line.substring(i).match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*:/);
      if (propertyMatch) {
        tokens.push({ text: propertyMatch[1], color: '#8250df', weight: 500 });
        i += propertyMatch[1].length;
        continue;
      }
      
      // Check for type annotations after colon
      if (line[i] === ':') {
        tokens.push({ text: ':', color: '#24292f' });
        i++;
        // Skip whitespace
        while (i < line.length && /\s/.test(line[i])) {
          tokens.push({ text: line[i] });
          i++;
        }
        // Check for type name
        const typeMatch = line.substring(i).match(/^([A-Z][a-zA-Z0-9<>,\s]*?)(?=\s|$|├|└|│)/);
        if (typeMatch) {
          tokens.push({ text: typeMatch[1], color: '#1f883d', weight: 400 });
          i += typeMatch[1].length;
          continue;
        }
        continue;
      }
      
      // Check for keywords
      const keywordMatch = line.substring(i).match(/^(private|public|protected|const|let|var|function|class|return|async|await|assigns|returns)\b/);
      if (keywordMatch) {
        tokens.push({ text: keywordMatch[1], color: '#cf222e', weight: 500 });
        i += keywordMatch[1].length;
        continue;
      }
      
      // Check for brackets and punctuation
      if (/[[\](){},]/.test(line[i])) {
        tokens.push({ text: line[i], color: '#24292f' });
        i++;
        continue;
      }
      
      // Default: regular text
      tokens.push({ text: line[i] });
      i++;
    }
    
    return tokens;
  };
  
  return (
    <>
      {lines.map((line, lineIndex) => (
        <div key={lineIndex} style={{ whiteSpace: 'pre' }}>
          {colorizeTreeLine(line).map((token, tokenIndex) => (
            <span
              key={tokenIndex}
              style={{
                color: token.color || '#24292f',
                fontWeight: token.weight || 400,
              }}
            >
              {token.text}
            </span>
          ))}
        </div>
      ))}
    </>
  );
}
