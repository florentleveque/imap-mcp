import { z } from 'zod';

export const accountField = z
  .string()
  .min(1)
  .describe('Account name, as list-accounts returns it.');

export const folderField = z
  .string()
  .min(1)
  .default('INBOX')
  .describe('Folder path, as list-folders returns it. Defaults to INBOX.');

export const limitField = z
  .number()
  .int()
  .min(1)
  .max(100)
  .default(20)
  .describe('How many messages to return, newest first: 1 to 100, 20 by default.');

export const unseenOnlyField = z
  .boolean()
  .optional()
  .describe('true to keep only the messages not read yet.');

export const sinceField = z.iso
  .date()
  .optional()
  .describe('Keep the messages received on or after this day, as YYYY-MM-DD.');

export const beforeField = z.iso
  .date()
  .optional()
  .describe(
    'Keep the messages received before this day, as YYYY-MM-DD; the day itself is excluded.',
  );

export const uidField = z
  .number()
  .int()
  .positive()
  .describe('UID of the message in the folder, as list-messages and search-messages return it.');

export const partField = z
  .string()
  .regex(/^\d+(\.\d+)*$/)
  .describe('Part id of the attachment, as read-message lists it, such as "2" or "1.3".');
