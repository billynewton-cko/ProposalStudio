'use strict';
/**
 * Serialises an RFP document to human-readable Markdown.
 * Written alongside meta.json on every save so the folder can be read
 * in any text editor or diffed in git without understanding the JSON schema.
 */

function blockToMarkdown(block) {
  if (!block) return '';
  switch (block.type) {
    case 'grouphead':
      return `### ${block.text || ''}\n\n`;
    case 'subhead':
      return `#### ${block.text || ''}\n\n`;
    case 'text':
      return `${block.text || ''}\n\n`;
    case 'bullet': {
      const lines = (block.items || []).map(i => {
        if (typeof i === 'string') return `- ${i}`;
        return `- **${i.title || ''}**: ${i.body || ''}`;
      });
      return lines.length ? lines.join('\n') + '\n\n' : '';
    }
    case 'kv': {
      const rows = block.rows || [];
      if (!rows.length) return '';
      const header = '| Key | Value |\n|-----|-------|\n';
      const body = rows.map(r => {
        if (Array.isArray(r)) return `| ${r[0] || ''} | ${r[1] || ''} |`;
        return `| ${r.k || ''} | ${r.v || ''} |`;
      }).join('\n');
      return header + body + '\n\n';
    }
    case 'table': {
      const rows = block.rows || [];
      if (!rows.length) return '';
      let md = '';
      rows.forEach((row, i) => {
        const cells = Array.isArray(row) ? row : [String(row)];
        md += '| ' + cells.join(' | ') + ' |\n';
        if (i === 0) md += '| ' + cells.map(() => '---').join(' | ') + ' |\n';
      });
      return md + '\n';
    }
    case 'divider':
      return '---\n\n';
    case 'image':
      return `> [Image]\n\n`;
    case 'embed':
      return `> [Embed${block.text ? ': ' + block.text : ''}]\n\n`;
    default:
      return '';
  }
}

function docToMarkdown(doc) {
  const meta = doc.meta || {};
  let md = '---\n';
  md += `id: ${doc.id || ''}\n`;
  md += `title: ${meta.title || 'Untitled'}\n`;
  if (meta.partnerName) md += `partner: ${meta.partnerName}\n`;
  if (meta.category) md += `category: ${meta.category}\n`;
  if (meta.dateLabel) md += `date: ${meta.dateLabel}\n`;
  md += `---\n\n`;
  md += `# ${meta.title || 'Untitled'}\n\n`;

  for (const section of (doc.sections || [])) {
    md += `## ${section.title || 'Section'}\n\n`;
    for (const block of (section.blocks || [])) {
      md += blockToMarkdown(block);
    }
  }
  return md;
}

module.exports = { docToMarkdown };
