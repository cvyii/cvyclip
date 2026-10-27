# CvyClip Studio Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task in the current chat. The user approved the design and said to build now.

**Goal:** Ship the advertised upload → AI highlights → edit captions/framing → real MP4/SRT download workflow on Azure.

**Architecture:** Keep the public GitHub Pages landing website. Add a same-origin, password-protected Node studio with FFmpeg media jobs, OpenAI transcription/highlights, and filesystem/Azure Blob persistence. Deploy the studio in Azure Container Apps Consumption in an allowed region.

**Tech Stack:** Node.js 22+, vanilla browser modules, Express, Busboy, native fetch/FormData, Azure Blob SDK, FFmpeg/FFprobe, node:test.

**Spec:** ../specs/2026-10-27-cvyclip-studio-design.md

## Global Constraints

- 200 MB and 20 minutes per upload; actual MP4, MOV, or WebM media only.
- One expensive job at a time; 20 source minutes of AI analysis per UTC day, persisted and reserved before requests.
- Clips 5–90 seconds, bounded by source duration; 9:16, 1:1, 16:9 output; crop or fit.
- Private owner workspace; HttpOnly session, CSRF/origin checks, login throttling; no frontend API key.
- Originals/projects/exports retained 7 days, temporary processing files cleaned earlier.
- Azure hosting target $5/month, max one 1-vCPU/2-GiB replica, scale to zero; OpenAI separately billed.
- No fake processing, downloads, or customer claims; disclose timestamp model compatibility/migration limits.

## Review Focus

- Corrupt, silent, rotated, unusually shaped, or oversize video: reject accurately or render according to display orientation, without leaving unbounded temporary files.
- Subtitle metacharacters, Unicode, apostrophes, multiline and RTL text: safe subtitle output with no shell/filter injection.
- Reload, process restart, lost worker lease, or double-click: persist job state and prevent duplicate paid analysis.
- Missing/invalid key, provider quota/billing errors, and malformed AI output: preserve upload/edits, explain the failure, do not automatically spend again.
- Seeking and trimming around caption boundaries: consistent preview/export timing, preserved audio, valid downloadable MP4 and SRT.

### Task 1: Domain rules and durable storage

**Files:** Create `studio/domain.mjs`, `studio/storage.mjs`, `studio/config.mjs`, `tests/domain.test.mjs`, `tests/storage.test.mjs`.

**Interfaces:** `validateClip(input, duration)` returns a normalized clip; `captionsToSrt(cues,start,end)` and `captionsToAss(cues,clip)` return escaped subtitle text. `createStore(config)` returns `{readJson, writeJson, updateJson, putFile, getFile, stat, list, remove}`; `updateJson(key, updater)` uses optimistic concurrency/atomic local locking. `loadConfig(env)` returns validated non-public server config.

- [ ] Write tests for invalid times/ratios, boundary captions, SRT/ASS escaping, private path validation, persistence and concurrent updates.
- [ ] Run `node --test tests/domain.test.mjs tests/storage.test.mjs`, confirm meaningful failures.
- [ ] Implement domain/config/storage adapters, including private Azure Blob support and local atomic metadata replacement.
- [ ] Run the tests; commit the tested component.

### Task 2: Authenticated API, projects, uploads, retention

**Files:** Create `studio/server.mjs`, `studio/auth.mjs`, `studio/projects.mjs`, `tests/api.test.mjs`; modify `package.json`, `.gitignore`; create `.env.example`.

**Interfaces:** `createApp({config,store,media,ai,jobs})` returns an Express application; `startServer(config)` listens on configured host/port. API: session/login/logout; project list/get/rename/delete; multipart project upload; authenticated source media with HTTP Range support. All modifying routes require valid origin and, after login, CSRF token.

- [ ] Test unauthorized access, cookie/CSRF/origin handling, throttling, upload size/type rejection, project ownership, ranged media, retention and delete behavior with injected media fakes.
- [ ] Confirm those tests fail, implement the API and configuration, then run the complete tests.
- [ ] Add production/local start scripts and credential/data ignore rules; never inspect the credential file values.
- [ ] Commit the tested API.

### Task 3: Media processing and real exports

**Files:** Create `studio/media.mjs`, `tests/media.test.mjs`, `scripts/create-test-video.mjs`.

**Interfaces:** `probeMedia(path)` returns `{duration,width,height,fps,hasAudio}`; `extractAudio(input,output)`; `renderClip({input,output,captionsPath,clip,onProgress,signal})`. Use explicit argument arrays and fixed filenames in temporary directories. Export result is MP4 H.264/AAC, nonzero size, correct dimensions/duration, and audibly present source track.

- [ ] Test corrupt/silent media, unusual dimensions and safe rendering arguments; generate a short real video fixture.
- [ ] Implement FFmpeg/FFprobe execution, timeouts, bounded stderr, progress parsing, rotation-aware sizing, caption rendering and cancellation cleanup.
- [ ] Render all three ratios with Unicode/metacharacter captions, probe outputs, inspect frames and listen/check audio stream presence.
- [ ] Commit the verified media module.

### Task 4: OpenAI analysis and recoverable jobs

**Files:** Create `studio/ai.mjs`, `studio/jobs.mjs`, `tests/ai.test.mjs`, `tests/jobs.test.mjs`.

**Interfaces:** `transcribeAudio(path,config,{signal})` returns `{text,language,segments,words}` from real provider timing only. `suggestClips(transcript,duration,config)` returns validated suggestions. `createJobs({store,media,ai,config})` exposes `enqueueAnalysis(projectId)`, `enqueueExport(projectId,clip)`, `getJob(id)`, `recover()`, `shutdown()`; job records persist lease, heartbeat, phase and result/error.

- [ ] Test persistent budget reservation, one-analysis idempotency, exclusive worker behavior, interrupted-job recovery, provider error redaction and invalid timestamp/output rejection.
- [ ] Implement timestamp-capable documented transcription and Responses structured output. Make models configurable and include scheduled deprecation guidance for any compatibility model.
- [ ] Connect analyze/export/poll/download endpoints. Retry failed analysis only through an explicit user action.
- [ ] Run tests and one very short live provider flow once the owner saves the key; commit without secrets or media fixtures.

### Task 5: Professional studio interface

**Files:** Create `studio/public/index.html`, `studio/public/studio.css`, `studio/public/app.mjs`, `studio/public/api.mjs`, `studio/public/editor.mjs`, `studio/public/captions.mjs`.

**Interfaces:** `api.request(path,options)` handles same-origin session/CSRF and safe errors. `createEditor(video,overlay,onChange)` loads real source media and controls clip times, ratio, crop/fit and framing. Caption editing preserves timing and uses textContent/DOM properties rather than HTML injection.

- [ ] Implement login, project library, drag/drop upload, actual progress/status polling, highlight cards, video preview/timeline, caption text/timing/style controls, framing preview and MP4/SRT result downloads.
- [ ] Include accessible empty/error/loading states, keyboard controls and a responsive stacked layout. No fake projects or successful AI states.
- [ ] Test an actual upload → manual edit → rendered download locally; test real AI suggestions when credentials are available.
- [ ] Verify reload recovery, deletion confirmation, mobile menu/panels, preview synchronization and output playback; commit.

### Task 6: Container deployment and operations

**Files:** Create `Dockerfile`, `.dockerignore`, `.github/workflows/studio-container.yml`, `deploy/azure-studio.bicep`, `deploy/README-studio.md`; modify `README.md` and privacy copy.

**Interfaces:** Container listens on 8080; `/healthz` returns readiness without secrets. Runtime config selects private Blob storage. Public container image contains source only, no `.env*`, uploads, tests' generated media, or credentials. Azure resource settings remain within agreed scaling and allowed region constraints.

- [ ] Validate container/deployment configuration and build the image using a supported available build mechanism.
- [ ] Provision allowed-region storage, Container Apps Consumption environment/app, private containers, secrets and limited access. Use the minimum necessary scoped identity; seek action-time confirmation if a tool requires approval for new security-sensitive grants.
- [ ] Configure scale-to-zero, max one replica, 7-day storage lifecycle and $5 budget alert when supported. Do not describe an alert as a hard spending cap.
- [ ] Deploy the tested image and verify authenticated media/AI/export flow over HTTPS before changing the public landing CTA.

### Task 7: Launch, review and final verification

**Files:** Modify `site/index.html`, `site/privacy.html`, `README.md`; create `VERIFICATION-STUDIO.md`.

- [ ] Replace planned-feature statements only for functionality verified on the deployed studio; link the public landing CTA to the actual HTTPS studio URL.
- [ ] Run all automated tests and existing landing validation. Perform one short full deployed flow and inspect the rendered video.
- [ ] Obtain an independent whole-change review, address real findings, repeat affected checks only.
- [ ] Publish source and landing changes, verify the public URL and studio sign-in, save a screenshot and provide the working link with material limits.

## Execution

The user approved the design and instructed immediate implementation. Execute natively in this chat on the task-only checkout and a dedicated feature branch. Do not create a separate user-owned chat. Keep the current public site usable until the studio deployment has passed verification.
