import { ImapFlow, type ImapFlowOptions } from 'imapflow';

/**
 * The part of ImapFlow the tools use. Naming it lets unit tests hand in a fake
 * (Stryker loads no Docker-backed suite), while the integration suite runs the
 * real client against GreenMail.
 */
export type MailClient = Pick<
  ImapFlow,
  | 'connect'
  | 'logout'
  | 'close'
  | 'on'
  | 'list'
  | 'getMailboxLock'
  | 'search'
  | 'fetchAll'
  | 'download'
>;

export type OpenClient = (options: ImapFlowOptions) => MailClient;

export const openImapFlow: OpenClient = (options) => new ImapFlow(options);
