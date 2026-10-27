# Azure studio runbook

Deploy only an image that passed Linux tests and the container smoke test. GitHub Pages publishes only `site/`; it cannot run the backend.

## Architecture

`azure-studio.bicep` creates a Consumption Container Apps environment/app, Standard LRS storage with a private Blob container, and an identity with **Storage Blob Data Contributor scoped to that container**. Shared-key/public blob access are disabled. HTTPS is required, and project/media access requires the owner password.

Scaling is zero to one 1-vCPU/2-GiB replica. HTTP wakes the studio; the KEDA `azure-blob` rule monitors private `active/` markers so background jobs remain awake after the browser closes. Completion/failure removes markers; recovery removes orphans. Azure may briefly run extra replicas during maintenance; a stored lease prevents intentional parallel processing.

Projects expire seven days after upload. Azure lifecycle deletion is eventual additional cleanup. Usage metadata expires after 90 days. No public blob URLs are used. Cold starts/deployments sign the owner out without deleting projects.

Allowed student regions: Sweden Central, Poland Central, Germany West Central, UAE North, Denmark East. Default: UAE North. Verify actual service/quota availability; do not modify the region policy. Static Web Apps was unavailable within this set.

## Build and provision

Push the feature branch or main. The studio workflow verifies code, builds/tests the image, then publishes `ghcr.io/cvyii/cvyclip:sha-<full-commit>`. Actions needs no Azure credentials or OpenAI secrets.

GitHub initially makes packages private. Before an anonymous Azure pull, make the **code-only** CvyClip package Public in Package settings and verify anonymous pull. This change is permanent; never include secrets/uploads/local files. Prefer its immutable @sha256 digest.

Use the official Azure CLI and standard browser sign-in. If device login is blocked by security defaults, use browser login and keep those defaults enabled.

```powershell
az login
az account set --subscription 22a4379c-e113-471f-a8e0-49fe6ed004a9
az group create --name cvyclip-studio-rg --location uaenorth --output none
```

Save secrets privately in ignored .env.local, then prepare secure Bicep parameters without printing values:

```powershell
node --env-file=.env.local scripts/prepare-azure-parameters.mjs ghcr.io/cvyii/cvyclip:sha-VERIFIED_FULL_COMMIT
az deployment group create --resource-group cvyclip-studio-rg --template-file deploy/azure-studio.bicep --parameters '@.cvyclip-data/azure-parameters.json' --query properties.outputs.studioUrl.value --output tsv
Remove-Item -LiteralPath .cvyclip-data/azure-parameters.json
```

The helper requires a real full commit/digest; the illustrative placeholder is rejected. Never put secrets in command arguments, workflows, committed parameters, or logs. Azure stores secure values as Container App secrets. Remove the temporary file even on failure. Identity permissions may take minutes to propagate; startup probes allow a delay.

Verify HTTPS, healthz, login, unauthorized media denial, upload/save/reload, analysis of a short spoken sample, MP4/SRT downloads, Blob persistence across a restart, and the marker scale rule. Only then change the public landing CTA.

## Costs and operation

The optional azure-budget.bicep takes the owner's contactEmail and a startDate at the current month's first day UTC. It alerts at 80% actual and 100% forecast spending with a monthly amount of 5 in billing currency. Confirm USD before calling it a $5 target. Student offers may restrict Cost Management features. Alerts can be delayed and **do not stop spending**.

Consumption's monthly free allowance helps at low usage; storage/traffic and other account workloads still count. Persistent Log Analytics ingestion is disabled to avoid an extra bill. Live console/system diagnostics remain available. Enable paid monitoring deliberately. Never log request bodies, auth headers, or raw provider errors.

Replace credentials in Azure secrets and restart a revision. Stop the app to halt processing. Remove the resource group only after downloading needed projects and explicitly confirming permanent deletion. Rollback preserves compatible Blob metadata. Failed/stale paid jobs require an owner-initiated retry.

Before February 26, 2027, replace whisper-1 as described in the README. A model rename alone does not establish timestamp compatibility.

References: [scaling](https://learn.microsoft.com/azure/container-apps/scale-app), [Blob scaler](https://keda.sh/docs/2.18/scalers/azure-storage-blob/), [billing](https://learn.microsoft.com/azure/container-apps/billing), [lifecycle](https://learn.microsoft.com/azure/storage/blobs/lifecycle-management-overview).
