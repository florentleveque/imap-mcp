# IMAP layer: per-part reading, one connection per call, tests on GreenMail

|            |                                                                                               |
| ---------- | --------------------------------------------------------------------------------------------- |
| **Status** | Applied (#3)                                                                                  |
| **Scope**  | `src/imap/`, `src/tools/`, `tests/unit/fakes/`, `tests/integration/`, `scripts/greenmail.mjs` |

## Reading a message part by part

`read-message` fetches the envelope and the BODYSTRUCTURE, then downloads the
body part only: the first unnamed `text/plain`, or else the first unnamed
`text/html`, converted by `html-to-text`. With neither, the first named
`text/plain` not sent as an attachment is the body: some mailers name it. `get-attachment` downloads the one
part it serves. Both download with `decodeText: false`: imapflow then removes
the transfer encoding only. Its text conversion would re-encode an inline text
attachment in UTF-8 and unwrap `format=flowed`, so a saved file would differ
from what was sent and the byte limit would count unwrapped text, hiding a
cut. `src/imap/text.ts` reads the bytes in the charset the part declares.
imapflow's BODYSTRUCTURE already decodes RFC 2047 and RFC 2231 file names
(seen on GreenMail, `tests/unit/fixtures/messages.json`).

Parsing the whole message with mailparser was the alternative. It transfers
every attachment on every read, so a 20 MB message costs 20 MB each time, and
needs a cap on the message size. mailparser is not a dependency.

Limits: the body download stops at 2 MiB, the text returned at 100,000
characters; `body.truncated` says when either cut. Only the first text body is
returned: a message with several inline text parts loses the others.

## One connection per tool call

`withClient` connects, `withMailbox` opens the folder with EXAMINE, the work
runs, the session logs out, whatever happens. A call pays a TLS handshake and a
LOGIN; in exchange no socket outlives a call, so nothing goes stale, nothing
keeps the process alive once stdin closes, and the configuration can be read
afresh on every call. A pool of connections per account would trade that for
speed.

## Special uses come from the server only

imapflow assigns `specialUse` from the folder name when the server declares
none, and also on servers that do support SPECIAL-USE, for any folder left
without the attribute. `specialUseSource` tells: `extension` is the server's
own attribute, `name` and `user` are guesses. Only `extension` is kept, since
#5 will move messages to the trash this way.

## Tests: a fake client, and GreenMail

Stryker runs `vitest.config.ts`, which must not need Docker. So every line of
`src/` is covered by unit tests that hand the code a fake ImapFlow
(`tests/unit/fakes/mail-client.ts`), and the mutation gate judges those.

The fake replays what imapflow really returned. The synthetic `.eml` files in
`tests/integration/fixtures/mail/` are appended to GreenMail, and
`tests/integration/message-fixtures.test.ts` records the envelope, the
structure and every part, as `decodeText: false` returns it, into
`tests/unit/fixtures/messages.json`
(Vitest file snapshot): a change in imapflow or GreenMail fails there first.
The rest of `tests/integration/` runs the tools end to end on GreenMail. That
directory sits outside the mutation cache key, as `tests/functional/` does,
because Stryker never loads it.

GreenMail runs through testcontainers, the same way locally and in CI, with
authentication on and a keystore signed by a test CA
(`scripts/make-test-tls.sh`). Its limits, met while writing the suite:

- no SPECIAL-USE, no STARTTLS, IMAP4rev1 only;
- FROM and TO searches match whole addresses, not substrings as RFC 3501 asks;
- BODYSTRUCTURE part sizes include the part headers.
