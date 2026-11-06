import { z } from 'zod';

export const accountField = z
  .string()
  .min(1)
  .describe('Account name, as list-accounts returns it.');
