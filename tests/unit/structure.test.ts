import { describe, expect, it } from 'vitest';

import { messageParts } from '../../src/imap/structure.js';
import { recorded } from './fixtures.js';

const partsOf = (name: string) => {
  const message = recorded[name];
  if (!message) throw new Error(`no fixture ${name}`);
  return messageParts(message.bodyStructure);
};

describe('messageParts', () => {
  it('finds the text of a single-part message', () => {
    expect(partsOf('plain')).toStrictEqual({ text: '1', attachments: [] });
  });

  it('falls back to the HTML of an HTML-only message', () => {
    expect(partsOf('html-only')).toStrictEqual({ html: '1', attachments: [] });
  });

  it('finds both versions of an alternative message', () => {
    expect(partsOf('alternative')).toStrictEqual({ text: '1', html: '2', attachments: [] });
  });

  it('lists a classic attachment', () => {
    expect(partsOf('attachment')).toStrictEqual({
      text: '1',
      attachments: [
        {
          part: '2',
          filename: 'report.pdf',
          contentType: 'application/pdf',
          size: 183,
          inline: false,
        },
      ],
    });
  });

  it('lists an inline part that has a file name', () => {
    expect(partsOf('inline-named').attachments).toStrictEqual([
      { part: '2', filename: 'photo.png', contentType: 'image/png', size: 209, inline: true },
    ]);
  });

  it('lists a part without Content-Disposition, named on its Content-Type', () => {
    expect(partsOf('no-disposition').attachments).toStrictEqual([
      {
        part: '2',
        filename: 'data.bin',
        contentType: 'application/octet-stream',
        size: 122,
        inline: false,
      },
    ]);
  });

  it('lists an embedded image without a name', () => {
    expect(partsOf('related')).toStrictEqual({
      html: '1',
      attachments: [{ part: '2', contentType: 'image/png', size: 220, inline: true }],
    });
  });

  it('lists an embedded message as one attachment, without opening it', () => {
    expect(partsOf('forwarded')).toStrictEqual({
      text: '1',
      attachments: [{ part: '2', contentType: 'message/rfc822', size: 208, inline: false }],
    });
  });

  it('lists a text part sent as an attachment, with its decoded name', () => {
    expect(partsOf('encoded-names')).toStrictEqual({
      text: '1',
      attachments: [
        { part: '2', filename: 'résumé.txt', contentType: 'text/plain', size: 123, inline: false },
        {
          part: '3',
          filename: 'facture n°1.pdf',
          contentType: 'application/pdf',
          size: 211,
          inline: false,
        },
      ],
    });
  });

  it('keeps the first text of a message with several, and walks nested multiparts', () => {
    const leaf = (part: string, type: string) => ({ part, type, size: 10 });
    const structure = {
      type: 'multipart/mixed',
      childNodes: [
        {
          part: '1',
          type: 'multipart/alternative',
          childNodes: [leaf('1.1', 'text/plain'), leaf('1.2', 'text/html')],
        },
        leaf('2', 'text/plain'),
        leaf('3', 'text/html'),
        { ...leaf('4', 'image/gif'), disposition: 'attachment' },
        // A text part marked as an attachment, without any name.
        { ...leaf('5', 'text/plain'), disposition: 'attachment' },
        // A text part that only a name on its Content-Type marks as a file.
        { ...leaf('6', 'text/plain'), disposition: 'inline', parameters: { name: 'notes.txt' } },
      ],
    };

    expect(messageParts(structure as never)).toStrictEqual({
      text: '1.1',
      html: '1.2',
      attachments: [
        { part: '4', contentType: 'image/gif', size: 10, inline: false },
        { part: '5', contentType: 'text/plain', size: 10, inline: false },
        { part: '6', filename: 'notes.txt', contentType: 'text/plain', size: 10, inline: true },
      ],
    });
  });
});
