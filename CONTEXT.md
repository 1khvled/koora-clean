# KOORA-CLEAN — Agent Context (A to Z)

> **Auto-update protocol (mandatory):** any agent that modifies anything in this
> repo MUST update this file in the same commit: append to `Changelog`, update
> `Current state`, `Pending`, and any section the change affects. Then push to
> GitHub (pushes are pre-authorized by the owner). Never leave this file stale.
> Last updated: 2026-10-04 (§108 — translation can't silently fail anymore).

## 108. Translation fallback chain + logging (2026-10-04, corrected)

- **Owner:** it keeps posting Arabic. Timeline first: the Arabic posts
  (#45-55) went out 17:35-18:15, BEFORE the English switch merged (18:30) --
  no runner failure at all. All 11 + straggler #56 translated to English
  after; channel verified zero-Arabic.
- **Kept anyway as insurance:** every engine outcome logged (`[lang] ...`,
  never the key); chain Groq -> MyMemory ar|en -> Google gtx ar->en ->
  original. 4-case suite green. (One live note: a bare-name post made Groq
  return empty once -- the free fallback caught it.)
- Media posts need editMessageMedia for caption edits (editMessageText fails
  them with "no text in the message") -- used for #56 and all photo posts.

