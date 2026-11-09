# LEADING LLM ONLY: DO NOT READ IF YOU ARE THE EXECUTOR

## Expected values (verdict criteria)

| ID  | Expected                                                                                                                                                                                                                                                        |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A1  | Paths `INBOX`, `Sent`, `Trash` (order not asserted); no folder has `specialUse`: GreenMail declares none, and a name is never enough.                                                                                                                           |
| A2  | `total: 11`; subjects, last added first: `Named body`, `Déjà vu`, `Résumé et facture`, `Fwd: Original`, `Embedded logo`, `Data file`, `Inline photo`, `Report attached`, `Alternative`, `HTML only`; UIDs decreasing; `notice` present.                         |
| A3  | `total: 11`; `Named body`, `Déjà vu`, `Résumé et facture`.                                                                                                                                                                                                      |
| A4  | `total: 10` (`Plain text` was seeded as read).                                                                                                                                                                                                                  |
| A5  | `Report attached` only (subject search is case-insensitive).                                                                                                                                                                                                    |
| A6  | `Named body`, `Déjà vu`, `Résumé et facture`.                                                                                                                                                                                                                   |
| A7  | `{"format":"text","text":"Café at nine.\nSecond line.","truncated":false}`.                                                                                                                                                                                     |
| A8  | `{"format":"html","text":"Weekly news\n\nRead the issue [https://example.test/n].","truncated":false}`.                                                                                                                                                         |
| A9  | `from: "Zélie <zelie@example.test>"`, `subject: "Résumé et facture"`; attachments part `2` `résumé.txt` `text/plain`, part `3` `facture n°1.pdf` `application/pdf`, both `inline: false`.                                                                       |
| A10 | One block: `{"type":"text","text":"CV text."}`.                                                                                                                                                                                                                 |
| A11 | `savedTo` ends with `.functional/attachments/facture n°1.pdf`, then `.functional/attachments/facture n°1 (1).pdf`; the listing shows exactly those two files.                                                                                                   |
| A12 | An error: `Message <uid> has no attachment with part "1". read-message lists its attachments.`                                                                                                                                                                  |
| A13 | `total: 10`: listing, searching, reading and downloading marked nothing as read.                                                                                                                                                                                |
| A14 | The arrival dates, not the Date headers: `2026-11-11T09:00:00.000Z` for `Named body`, then one day earlier for each next message, down to `2026-11-02T09:00:00.000Z` for `HTML only`. (`Déjà vu` has a Date header of 2 November 18:00, and shows 10 November.) |
| A15 | `{"format":"text","text":"The body carries a file name.","truncated":false}`; `attachments: []`: a body part with a file name is still the body when there is no other.                                                                                         |
| A16 | An error: `Saving attachments needs attachments.directory in the configuration file.`                                                                                                                                                                           |

## Failure diagnostics

| If FAIL on | Likely cause                                        | Where to look                                    |
| ---------- | --------------------------------------------------- | ------------------------------------------------ |
| A1         | a special use taken from imapflow's name guess      | `src/imap/folders.ts`                            |
| A2-A6      | UID ordering, the limit, or the search translation  | `src/imap/messages.ts`                           |
| A7-A9      | part selection, decoding or HTML conversion         | `src/imap/structure.ts`, `src/imap/read.ts`      |
| A10-A12    | attachment lookup, content blocks, file naming      | `src/tools/attachments.ts`, `src/attachments.ts` |
| A13        | a folder opened read-write, or a FETCH without PEEK | `src/imap/session.ts`                            |
| A14        | the Date header shown instead of INTERNALDATE       | `src/imap/messages.ts`                           |
| A15        | the named-body fallback                             | `src/imap/structure.ts`                          |
| A16        | the attachments.directory switch                    | `src/tools/attachments.ts`                       |
