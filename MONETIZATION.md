# Monetization groundwork

**Status: groundwork only.** Nothing is switched on by default. The Telegram
channel stays English-only, link-free and promo-free; the only code change is an
empty, optional footer slot in the daily matches board. No revenue figures or
promises are made here.

## 1. Owned sites — ads and affiliate links

- Sites we own: **messistat.com** and **ronaldostats.site**.
- Candidate models: contextual display advertising (e.g. AdSense) and ordinary
  affiliate links on pages that already discuss a relevant product.
- **Requires owner action outside this repo:** apply for / get approved by an
  ad network, sign up to any affiliate programme, publish consent and privacy
  notices, and decide placement in each site's source. No site source is
  changed by this slice.

## 2. Telegram Ads eligibility check

- Check whether the channel meets Telegram Ads eligibility and audience-size
  requirements, and review the platform's monetization terms before running
  anything.
- **Requires owner action outside this repo:** account setup, eligibility
  review, campaign budget and creative approval. This repo does not create or
  dispatch campaigns.

## 3. One clearly labelled sponsor slot on the daily board

- `scripts/tg_daily_photo.py` renders an optional `sponsor_line` in the image
  footer, in a muted style — no link, no call-to-action, no emoji, and no new
  dependency.
- Config key: `sponsor_line` in `scripts/tg_runtime.json`. It is **empty by
  default**, so today's board is pixel-identical. Keep the value to one plain
  English line; non-English text trips the existing English-only gate and the
  post is skipped rather than sent.
- When filled, the line must be clearly presented as a sponsorship. There is no
  ad-network integration and no click tracking in this repo.
- **Requires owner action outside this repo:** agree a sponsor and write the
  single line into the runtime config. No secret belongs in that file.

## 4. Paid tier via Telegram native subscriptions

- Telegram's native channel subscriptions / paid posts can offer a paid tier
  without wiring an external payment provider into this pipeline.
- **Requires owner action outside this repo:** enable the feature in Telegram
  settings, define the tier and its value proposition, set pricing, and handle
  subscriber access and moderation. Nothing here gates content by subscription.

## Guardrails

- The posting bridge keeps its existing rules: English-only output, source
  never named or linked, bot/page-scoped tokens only, fail-open behaviour.
- `scripts/tg_runtime.json` is a non-secret config file — never put tokens in
  it. Missing or malformed values fall back silently to the built-in defaults.
- The posting hour (`daily_photo_time_utc`, default `08:00` UTC) and all sponsor
  behaviour are covered by offline tests in `scripts/test_tg_daily_photo.py`.
