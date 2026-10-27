# CvyClip Studio

A private video workspace with real uploads, timed captions, AI highlight suggestions, trimming/reframing, saved projects, and H.264/AAC MP4 plus SRT exports.

The public introduction is https://cvyii.github.io/cvyclip/. The studio is a separate Node service. Cloud deployment and live AI verification must pass before the landing page advertises availability.

## Run locally

Requires Node.js 24 and pnpm 11.25.0. Run `pnpm install`, copy `.env.example` to `.env.local`, and edit that file privately. Set `WORKSPACE_PASSWORD` to a strong password of at least 12 characters and `OPENAI_API_KEY` to your OpenAI project key. Never post secrets in comments, issues, or chat. Revoke and replace shared keys.

Run `node --env-file=.env.local studio/server.mjs`, then open http://127.0.0.1:8080/. Sign in and upload a recording. AI starts only after an authenticated analysis action. OpenAI billing is separate from Azure student credit.

## Features and limits

- MP4, MOV, and WebM with video/audio, up to 200 MB and 20 minutes. Invalid, corrupt, and silent media are rejected.
- OpenAI transcription with real provider timing and validated highlight suggestions.
- Editable caption text/timing; two line-level styles, size, and placement. Captions are burned into MP4. SRT times are rebased to the selected clip.
- 5–90 second clips bounded by source duration; 9:16, 1:1, and 16:9 output; crop/fit and manual positioning. No automatic face tracking.
- Durable originals, edits, job state, usage reservations, and exports. Projects expire seven days after upload; download clips before expiry.
- Owner password, HttpOnly sessions, origin/CSRF checks, and login throttling. Anyone given the owner password can access every project.
- One expensive worker and a persisted allowance of 20 source minutes of AI analysis per UTC day. No automatic paid retries. The allowance limits source minutes rather than dollars; explicit retries and highlight refreshes may incur additional charges.

Some MOV/HEVC codecs process in FFmpeg but cannot preview in every browser. Use H.264 MP4/AAC for reliable preview. Browser fonts can differ slightly from FFmpeg Noto rendering, especially for complex scripts.

## Timestamp model migration

The default `whisper-1` model provides documented word/segment timing in `verbose_json`. **OpenAI schedules its shutdown for February 26, 2027.** Before then, migrate `studio/ai.mjs` to a supported timestamp-capable transcription/alignment workflow and rerun timing/export tests. A model rename alone is insufficient when response formats differ. Configure models using `OPENAI_TRANSCRIPTION_MODEL` and `OPENAI_HIGHLIGHT_MODEL` (default `gpt-4.1-mini`).

Official references: [speech-to-text](https://developers.openai.com/api/docs/guides/speech-to-text), [deprecations](https://developers.openai.com/api/docs/deprecations), [structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs).

## Deploy and verify

See [the Azure runbook](deploy/README-studio.md). Container Apps Consumption scales from zero to one 1-vCPU/2-GiB replica. Private Blob Storage holds projects and active-job signals; a scoped identity supplies access. Images contain code only; keys/passwords are runtime secrets.

The $5/month Azure amount is a target and alert threshold, **not a spending cap**. Compute, storage, traffic, and monitoring can incur charges. Student policy/quota still apply; do not upgrade or disable security/policy settings to work around failures.

Run `node scripts/validate.mjs` and `node scripts/run-tests.mjs`. Tests cover auth/uploads, storage concurrency, idempotency, budgets/recovery, provider errors, captions, and actual FFmpeg renders at three ratios. GitHub Actions builds the Linux image and tests upload → edit → render → download before publishing it. Tests never use a live API key automatically.

`site/` is the GitHub Pages landing; `studio/` is the protected app; `deploy/` contains Azure templates. Media/secrets remain in ignored `.cvyclip-data/`, `.test-tmp/`, and `.env.local`.
