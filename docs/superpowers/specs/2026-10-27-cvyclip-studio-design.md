# CvyClip Studio — working product design

## Intent and agreed requirements

Turn the published CvyClip landing website into a usable video clipping product. The owner requested all advertised capabilities: upload a video, transcribe it, suggest highlights with AI, edit captions, adjust framing, and download finished clips. Improve the presentation to a professional creator workspace. OpenAI is the selected AI provider, using the owner's existing API key. The owner selected Azure using student credits, with a $5/month hosting target, and approved an ignored local `.env.local` file for credentials.

## Approaches

1. **Azure backend plus the existing public website — selected.** A Node.js application handles uploads, OpenAI requests, and FFmpeg rendering. Azure supports processing without depending on a visitor's laptop performance. It requires server credentials and usage-based hosting. The public GitHub Pages landing page links into the studio.
2. **Laptop backend first.** The same application runs locally and has no cloud hosting expense, but a public visitor cannot use it while the laptop is unavailable. The owner selected Azure instead.

The earlier Azure Static Web Apps service is unsuitable: it cannot run the required video jobs and none of its available regions match this student's region policy. Use Azure Container Apps Consumption in an allowed region, provisionally UAE North subject to service availability. Do not modify the subscription's region policy or upgrade the subscription.

## First complete release

The studio is a private, password-protected owner workspace. The public landing page remains available to everyone. This protects the owner's API balance while they test their product. Public customer registration, subscriptions, payments, and team accounts were not advertised product capabilities and are outside this release.

### Creator workflow

1. Sign in using a workspace password entered privately by the owner during setup.
2. Upload an MP4, MOV, or WebM video, up to 200 MB and 20 minutes. Probe the media before accepting processing. Show actionable errors for an unsupported codec, missing audio, corrupt file, oversize file, or duration limit.
3. Show the actual uploaded video, duration, and metadata. The owner explicitly starts AI analysis; uploading alone does not send audio to OpenAI.
4. Extract compressed audio, split it into bounded chunks if needed, transcribe with timestamps, and request 3–5 highlight suggestions. Each suggestion includes a title, explanation, and valid start/end time within the source. AI suggestions are editable, never presented as a guarantee of virality.
5. Select a suggestion or create a manual clip. Adjust the start and end within a 5–90 second range (shorter sources may use their actual duration).
6. Edit caption text and timing, choose clean or highlight styling, adjust font size and placement, and preview captions synchronized with playback. Preserve the source language; do not silently translate.
7. Choose 9:16, 1:1, or 16:9, select crop or fit, and adjust horizontal/vertical framing with an accurate visual preview.
8. Export a real H.264/AAC MP4 with captions burned in, or without captions. Download SRT captions separately. Show rendering progress and a playable result before download. No fake progress, sample output passed off as real, or placeholder export buttons.

## Interface

Retain the CvyClip name and violet identity. Use a clean dark editing workspace with a compact navigation bar, project library, upload panel, central video stage, timeline, clip suggestion cards, and a caption/style inspector. Empty states explain the next real action. Loading states identify upload, transcription, suggestion generation, and export separately. Errors preserve completed work and offer a meaningful retry. Keyboard focus, labeled controls, readable contrast, and reduced-motion preferences remain supported. On narrow screens, panels become stacked tabs rather than shrinking the desktop editor.

## Architecture and persistence

- Keep buildless HTML/CSS/JavaScript for the landing page; add a modular vanilla JavaScript studio served from the Node backend to avoid cross-origin credential handling.
- Node.js backend with focused modules for configuration, sessions, projects, storage, media processing, OpenAI integration, and jobs. Use FFmpeg/FFprobe through argument arrays, never a shell command assembled from user input.
- Azure Container Apps Consumption: start with one 1-vCPU/2-GiB replica maximum, scale to zero when idle, and permit one expensive job at a time. Use request polling to keep the service active during a job; jobs must survive container restarts through persisted state and be resumable/retryable rather than falsely marked successful.
- Azure Blob Storage with private containers holds project metadata, original media, transcripts, and exports. Do not expose account keys or public containers. The backend streams authenticated media/download requests or issues short-lived read-only links.
- Locally, use a filesystem storage adapter with the same interfaces, allowing real media tests without Azure resources. Temporary work is cleaned on completion/failure and on startup.
- Project library supports opening, renaming, and deleting a project. Confirm deletion in the product UI because it removes the owner's media. Uploads/transcripts/exports remain private to the workspace.
- Retain originals and project data for 7 days by default; display retention in the UI. Automatic temporary-file cleanup does not remove deliberately retained project records early.

## AI and captions

Use the current OpenAI transcription route when it supplies usable segment timestamps. If the current route lacks timestamps, choose a documented compatible timestamped transcription route and label any deprecation/migration constraint in configuration and docs. No fabricated word-level timing: use segment captions unless the provider actually returns word timings. Keep model names configurable. Highlight selection uses schema-constrained structured output, bounded input, validated timing, and explicit treatment of transcript content as untrusted data. Reject malformed or out-of-range suggestions.

Captions and exports must safely handle Unicode, apostrophes, quotes, line breaks, subtitle metacharacters, and right-to-left text. Use a suitable font and proper subtitle escaping. Verify a real rendered example; document any language-specific rendering limitations rather than promising perfect transcription.

## Credentials and access

The existing OpenAI key is entered by the owner into the approved ignored local file; never ask for it in chat or print it. A workspace password is also entered privately. Local configuration is never committed, bundled into frontend assets, or sent to GitHub. Cloud deployment puts required runtime values in Azure secrets. Use secure, HttpOnly sessions, server-side authentication on every data/AI/media route, login throttling, CSRF protection, and an explicit allowed-origin policy. Secret-bearing errors and HTTP headers are redacted. Never execute user-provided filenames or transcript text.

## Cost controls

The $5/month figure is a hosting target, not an Azure-enforced hard cap. Azure budget alerts do not guarantee shutdown. Set a $5 Azure budget alert if the account supports it, use consumption scaling, avoid an always-on paid plan or private registry, and show current configured limits. Request confirmation if the required deployment cannot reasonably fit the target.

OpenAI usage is billed separately from Azure student credits. The owner starts AI analysis explicitly. Initial application limits: 20 analyzed source minutes per day and one analysis per project unless the owner explicitly requests another analysis. Reuse successful transcripts instead of retranscribing for styling/export changes. Reserve allowance before the provider call and persist the allowance so restarts cannot reset it. No automatic paid retries after a provider quota/billing failure.

## Verification and release

Meaningful tests cover authenticated access, upload/media validation, caption escaping/timing, range checks, job recovery, daily allowance reservation, OpenAI error handling, and rendering arguments. Use mocked provider responses for repeatable tests and perform one short real OpenAI transcription/highlight test after the owner saves credentials. Render and inspect a short synthetic video with audio in all three ratios; verify MP4 playback, duration, audio, captions, SRT output, and cleanup. Test the browser workflow with actual uploads and downloads, including mobile layout and reload recovery. Publish only after these checks pass and report any remaining limits.

## Builder decisions

The builder may choose exact filenames, dependencies, Azure storage SDK details, layout spacing, font family, and the precise low-cost structured-output model after checking current official documentation. The builder may use the existing task-only checkout on a dedicated feature branch; an extra worktree is unnecessary unless another task shares the checkout. Do not claim scalable multi-user production readiness from a single-owner first release.
