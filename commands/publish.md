---
name: publish
description: Publish your local entries as a book on Telvok marketplace
---

# Publish to Marketplace

Guide the user through publishing their local entries as a book on Telvok.

## Action

1. Check authentication with `auth({ action: "status" })`. If not connected, run `auth({ action: "login" })` first.
2. Call `brief()` with no query to see what local entries exist.
3. Ask the user:
   - Book name
   - Description (optional)
   - Pricing: open (free), one_time, or subscription
   - Price in cents (if paid)
   - Which entries to include (default: all local/)
4. Call `library_publish()` with the user's choices and `attestation: { original_work: true, terms_accepted: true }`.
5. Show the result — book URL or any errors.
