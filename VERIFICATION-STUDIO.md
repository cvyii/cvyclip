# CvyClip Studio verification — October 27, 2026

The studio implementation is on feature/cvyclip-studio. The public GitHub Pages landing remains unchanged pending a verified Azure studio deployment.

## Verified

- Full automated suite: 38 tests, including real FFmpeg exports in vertical, square, and wide formats with audio/captions.
- Browser: upload a real synthetic 10-second MP4, edit caption text/timing, save a 1–6 second selection, render/download a 5-second 1080x1920 H.264 MP4 with audio, and restore the project after reload.
- Session recovery: restart the real local server with unsaved caption edits, receive a sign-in prompt, sign in again, restore the unsaved text and save successfully.
- Mobile 390px and desktop 1440px layouts: correct responsive arrangement and no measured horizontal overflow; mobile project drawer opens/closes.
- Linux container workflow at 1858465: successful tests, image build, running-container upload/edit/render/download smoke, and registry push. Anonymous image pull verified. Later review fixes require their new CI run before deployment.
- Independent read-only review: six Important findings reproduced with failing regressions and fixed. No Critical issues or deferred minor findings.
- Azure CLI signed into the existing Azure for Students subscription with normal browser authentication. Security defaults remain enabled.
- Dedicated resource group cvyclip-studio-rg created in allowed UAE North. Container Apps, Storage and Managed Identity providers enabled. UAE North appears in the provider's supported environment locations.
- Resource-group budget created: USD 5/month, actual 80% and forecast 100% alerts. This is an alert rather than a spending cap.
- Bicep studio and budget templates compiled successfully. The budget was applied successfully. The code-only container package is already public.

## Pending before launch

The private settings file still has no API key or production workspace password. The user must enter a replacement OpenAI key and a password of at least 12 characters in the laptop-only setup form, then save. Secrets shared in chat/comments should be replaced, not committed or copied into reports.

After private setup: run one short real OpenAI transcription/highlight test; deploy the reviewed image with private Blob persistence; verify HTTPS login, media access, uploads, AI/export/download, persistence and scaler behavior; then update the landing CTA and feature/privacy copy. No Azure Container App or media storage has been deployed yet. No live AI success is claimed.

## Review fixes

- Lease and running-state checks fence an old worker before paid provider transitions and state updates.
- Unsaved captions/framing stay in tab memory through reauthentication; explicit sign-out clears recovery state.
- Recovery removes abandoned managed temporary directories older than an hour, preserving recent uploads and work backed by a valid lease.
- Display aspect ratio/rotation are retained, and crop precedes fixed-size scaling to bound extreme intermediate dimensions.
- Fit preview is centered consistently with output.
- AI suggestions require explicit finite numeric start/end values; missing fields cannot receive editor defaults.

## Rulings

- Native Windows bookkeeping replaces unavailable Bash helpers. Risk: bookkeeping drift; mitigated by the ledger, commit ranges and test evidence.
- Blob active-job markers supply the Azure scaling signal instead of a separate queue. Risk: scaler misconfiguration can interrupt jobs or retain a replica; live Azure verification remains required.
- Public registration, payments and multiple-owner isolation are outside this approved single-owner release. Sharing its password grants access to every project.

Timestamp compatibility uses whisper-1, scheduled for shutdown February 26, 2027. Migrate to a supported timed transcription/alignment workflow before that date; changing a model name alone is insufficient.
