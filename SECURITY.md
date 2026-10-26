# Security

Sharka (Šarka) is a single-user app for a home computer. This page describes what it protects
against, what it doesn't, and how to report a problem.

## Reporting a vulnerability

Please **don't open a public issue** for a security problem. Use GitHub's
[private vulnerability reporting](https://github.com/MisiusCode/Sharka/security/advisories/new)
instead. I'll reply as soon as I can. This is a one-person project, so allow a few days.

## Threat model

**What's protected**

- By default the server listens on `127.0.0.1` only. Network access is opt-in and requires a PIN.
- Network clients need a signed session cookie (`httpOnly`, `SameSite=Strict`, HMAC checked with
  `timingSafeEqual`). They get one by entering the PIN. The cookie key mixes the PIN hash with a
  separate server-side secret.
- The PIN is stored as an scrypt hash. Five wrong attempts from one address lock it out for
  15 minutes.
- The `Host` header is checked against an allowlist before anything else runs, which blocks DNS
  rebinding.
- The settings screen is served to loopback only. Changing the PIN over the network requires the
  current PIN.
- Backups blank the session secret, so whoever holds a backup copy can't forge a session.

**What's out of scope or known**

- **Network traffic is plain HTTP.** Anyone who can sniff your home network can see tasks and the
  session cookie. Don't enable network access on networks you don't trust.
- **The PIN is short (4–8 digits).** The lockout slows down guessing but can't make a short PIN
  strong.
- **Any device that knows the PIN has full control.** It can change settings, including
  autostart, the hotkey and the backup folder. There are no separate accounts or roles.
- **Backups contain the PIN hash.** That's deliberate, so a restore keeps your PIN. Treat the
  backup folder as sensitive.
- **Anything running as your Windows user can read the database.** Sharka doesn't defend against
  local malware.
- PIN hashing uses synchronous scrypt, which blocks the server for a fraction of a second per
  attempt. The lockout bounds the impact.

## Supported versions

Only the latest release on the `main` branch gets fixes.
