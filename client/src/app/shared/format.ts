import { Pipe, PipeTransform } from '@angular/core';

const inr = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });

@Pipe({ name: 'inr' })
export class InrPipe implements PipeTransform {
  transform(v: number | null | undefined): string {
    return v === null || v === undefined || Number.isNaN(v) ? '-' : `₹${inr.format(Math.round(v))}`;
  }
}

@Pipe({ name: 'tenure' })
export class TenurePipe implements PipeTransform {
  transform(m: number): string {
    if (m >= 12 && m % 12 === 0) return `${m} mo (${m / 12} yr)`;
    return `${m} mo`;
  }
}

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/**
 * Tiny, safe Markdown subset for chat bubbles: escapes all HTML first, then
 * supports **bold**, bullet lines (-, *, •) and paragraphs. Angular's
 * innerHTML sanitizer is a second layer of defence.
 */
@Pipe({ name: 'chatMarkdown' })
export class ChatMarkdownPipe implements PipeTransform {
  transform(text: string): string {
    const lines = escapeHtml(text ?? '').split('\n');
    const out: string[] = [];
    let inList = false;
    for (const raw of lines) {
      const line = raw.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
      const bullet = /^\s*(?:[-*•]|\d+\.)\s+(.*)$/.exec(line);
      if (bullet) {
        if (!inList) out.push('<ul>');
        inList = true;
        out.push(`<li>${bullet[1]}</li>`);
        continue;
      }
      if (inList) {
        out.push('</ul>');
        inList = false;
      }
      if (line.trim()) out.push(`<p>${line}</p>`);
    }
    if (inList) out.push('</ul>');
    return out.join('');
  }
}
