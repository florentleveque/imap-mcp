/** Where an account's password comes from. The sources themselves arrive with #4. */
export type PasswordSource = (accountName: string) => Promise<string>;
