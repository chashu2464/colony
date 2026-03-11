const maxLength = 1900;

function splitMessage(content) {
    if (content.length <= maxLength) {
        return [content];
    }

    const chunks = [];
    let remaining = content;

    while (remaining.length > 0) {
        if (remaining.length <= maxLength) {
            chunks.push(remaining);
            break;
        }

        let splitIndex = maxLength;
        const codeBlockEnd = remaining.lastIndexOf('\`\`\` ', maxLength);
        if (codeBlockEnd > maxLength * 0.5) {
            const nextCodeBlock = remaining.indexOf('\`\`\` ', codeBlockEnd + 3);
            if (nextCodeBlock !== -1 && nextCodeBlock <= maxLength) {
                splitIndex = nextCodeBlock + 3;
            } else {
                splitIndex = codeBlockEnd;
            }
        } else {
            const paragraphBreak = remaining.lastIndexOf('\n\n', maxLength);
            if (paragraphBreak > maxLength * 0.5) {
                splitIndex = paragraphBreak + 2;
            } else {
                const lineBreak = remaining.lastIndexOf('\n', maxLength);
                if (lineBreak > maxLength * 0.5) {
                    splitIndex = lineBreak + 1;
                } else {
                    const space = remaining.lastIndexOf(' ', maxLength);
                    if (space > maxLength * 0.5) {
                        splitIndex = space + 1;
                    }
                }
            }
        }

        chunks.push(remaining.substring(0, splitIndex).trim());
        remaining = remaining.substring(splitIndex).trim();
    }

    return chunks;
}

// Test with 3000 chars of 'a'
const longMessage = 'a'.repeat(3000);
const chunks = splitMessage(longMessage);
console.log('Chunks:', chunks.length);
chunks.forEach((c, i) => console.log(`Chunk ${i}: ${c.length} chars`));

// Test with code block
const codeMessage = 'a'.repeat(1000) + '\n\`\`\`\n' + 'b'.repeat(1000) + '\n\`\`\`\n' + 'c'.repeat(1000);
const codeChunks = splitMessage(codeMessage);
console.log('Code Chunks:', codeChunks.length);
codeChunks.forEach((c, i) => console.log(`Code Chunk ${i}: ${c.length} chars`));
