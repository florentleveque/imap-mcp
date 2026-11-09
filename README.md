# imap-mcp

MCP server for IMAP mailboxes. Credentials are kept in the operating system's keyring, never in environment variables.

Work in progress: the read tools are in place; the password sources (keyring, password command) come next, and until then the server cannot log in.

## Tools Available

**Accounts and folders**

- `list-accounts`: the configured accounts (name, host, port, TLS mode, user name). Reads the configuration only.
- `list-folders`: the folders of an account, with the special use (`\Sent`, `\Trash`...) the server declares, if any.

**Messages**

- `list-messages`: the messages added to a folder last, last added first, optionally only the unread ones or those received since a day.
- `search-messages`: messages matching a sender, a recipient, a subject, body text or a received-day range.
- `read-message`: the headers, the body as plain text (an HTML-only body is converted) and the list of attachments.
- `get-attachment`: one attachment, in the result, up to a size limit.
- `save-attachment`: one attachment, saved to the attachments directory. It writes a new file on every call, and tells the MCP client so: it is the one tool not announced as read-only.

No tool changes the mailbox: folders are opened with EXAMINE and messages fetched with `BODY.PEEK`, so nothing is marked as read.

> Message data comes from its senders. Results that carry it start with a notice telling the model to treat it as untrusted content, never as instructions: a mail can carry a prompt injection.

## Configuration

A JSON file, by default `~/.config/imap-mcp/config.json` on every system, or the path given with `--config <path>`. It is read on every tool call, so an edit applies at once.

```json
{
  "accounts": {
    "personal": {
      "host": "imap.example.org",
      "user": "me@example.org"
    },
    "work": {
      "host": "mail.example.com",
      "port": 143,
      "security": "starttls",
      "user": "me@example.com",
      "caFile": "/etc/ssl/certs/company-ca.pem"
    }
  },
  "attachments": {
    "directory": "/home/me/Downloads/imap-mcp",
    "maxInlineBytes": 1048576
  }
}
```

- `accounts`: one entry per account. The name (lower-case letters, digits, hyphens) is what the tools take as `account`.
  - `host`, `user`: required.
  - `security`: `tls` (the default, port 993) or `starttls` (port 143). There is no cleartext mode: STARTTLS is required, never opportunistic.
  - `port`: when the server does not use the default of its mode.
  - `caFile`: an absolute path to an extra certificate authority to trust, for a server with a private CA. Certificate verification cannot be turned off.
- `attachments`, optional:
  - `directory`: an absolute path where `save-attachment` saves files. Without it, that tool is refused. Saved files get a cleaned-up name and never overwrite an existing file.
  - `maxInlineBytes`: the largest attachment returned in a result, 1 MiB by default.

Passwords never go in this file: a `password` key is refused.
