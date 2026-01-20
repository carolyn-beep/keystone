export function extractTextFromHTML(htmlContent: string): string {
  // Parse HTML and extract text, preserving ul/li hierarchy with indentation
  const lines: string[] = [];

  // Remove script and style tags first
  let cleaned = htmlContent
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '');

  // Track nesting depth for lists and current text accumulator
  let listDepth = 0;
  let inListItem = false;
  let currentText = '';

  // Process the HTML looking for tags
  const tagRegex = /<\/?([a-zA-Z][a-zA-Z0-9]*)[^>]*>/g;
  let lastIndex = 0;
  let match;

  while ((match = tagRegex.exec(cleaned)) !== null) {
    // Accumulate text before this tag
    const textBefore = cleaned.substring(lastIndex, match.index);
    if (textBefore.trim()) {
      currentText += ' ' + textBefore.trim();
    }

    const fullTag = match[0];
    const tagName = match[1].toLowerCase();
    const isClosing = fullTag.startsWith('</');

    if (tagName === 'ul' || tagName === 'ol') {
      if (!isClosing) {
        listDepth++;
      } else {
        listDepth = Math.max(0, listDepth - 1);
      }
    } else if (tagName === 'li') {
      if (!isClosing) {
        // Starting a new list item - flush any previous accumulated text first
        if (currentText.trim() && inListItem) {
          const indent = '  '.repeat(Math.max(0, listDepth - 1));
          lines.push(indent + '- ' + currentText.trim());
          currentText = '';
        }
        inListItem = true;
      } else {
        // Closing list item - flush accumulated text
        if (currentText.trim()) {
          const indent = '  '.repeat(Math.max(0, listDepth - 1));
          lines.push(indent + '- ' + currentText.trim());
          currentText = '';
        }
        inListItem = false;
      }
    } else if (['p', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(tagName)) {
      // Block-level elements - flush text on close
      if (isClosing && currentText.trim()) {
        if (inListItem) {
          // Don't flush here, let </li> handle it
        } else {
          lines.push(currentText.trim());
          currentText = '';
        }
      }
    } else if (tagName === 'br') {
      // Line break - add space to current text
      currentText += ' ';
    }

    lastIndex = match.index + fullTag.length;
  }

  // Get any remaining text after last tag
  const remainingText = cleaned.substring(lastIndex).trim();
  if (remainingText) {
    currentText += ' ' + remainingText;
  }
  if (currentText.trim()) {
    lines.push(currentText.trim());
  }

  // Decode HTML entities and clean up
  return lines
    .map(line => line
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\s+/g, ' ')
      .trim()
    )
    .filter(line => line.length > 0)
    .join('\n');
}
