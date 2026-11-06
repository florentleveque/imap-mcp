import type { ListResponse } from 'imapflow';

export interface Folder {
  path: string;
  name: string;
  specialUse?: string;
  subscribed: boolean;
  selectable: boolean;
}

export function toFolder(entry: ListResponse): Folder {
  return {
    path: entry.path,
    name: entry.name,
    // imapflow also guesses a special use from the folder name ('name') or
    // from hints ('user'). Only the server's own SPECIAL-USE attribute
    // (RFC 6154) counts: AGENTS.md "Security invariants".
    ...(entry.specialUseSource === 'extension' ? { specialUse: entry.specialUse } : {}),
    subscribed: entry.subscribed,
    selectable: !entry.flags.has('\\Noselect') && !entry.flags.has('\\NonExistent'),
  };
}
