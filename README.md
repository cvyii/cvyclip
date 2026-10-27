# CvyClip AI

A complete, responsive **landing website** for an AI video clipping startup in development. This is a website, not a video editor or working AI application. No API key, database, account, paid service, dependency installation, or build step is needed.

## What is included

- Original cream, violet, and lime visual identity with custom vector podcast artwork.
- Hero, planned workflow, interactive concept preview, roadmap, FAQ, and privacy page.
- Vertical, square, and landscape illustration layouts plus two caption styles. These controls change sample artwork locally; they do not play, process, upload, or export video.
- Responsive mobile navigation, semantic landmarks, keyboard focus, skip link, native FAQ disclosures, and reduced-motion support.
- Local assets and system fonts; no third-party tracking, cookies, forms, or browser storage in the website code.
- Deployment templates for Azure Static Web Apps and GitHub Pages.

All AI features are explicitly planned. There are no invented testimonials, customer counts, performance statistics, viral guarantees, product availability claims, or waitlist submissions.

## Open it on Windows

1. Right-click `cvyclip-site.zip`, choose **Extract All**, and open the extracted `cvyclip-site` folder.
2. For an immediate look, open `site\index.html` in Edge or Chrome. Navigation and the preview work directly from the file.
3. For the recommended local HTTP preview, install a current Node.js LTS release from [nodejs.org](https://nodejs.org/). Node 22 or newer is supported. Open a new PowerShell window after installation.
4. In File Explorer, open the extracted project folder, click the address bar, type `powershell`, and press Enter. Then run:

```powershell
node --version
node scripts/validate.mjs
node scripts/serve.mjs
```

5. Visit **http://127.0.0.1:4173/**. Keep that PowerShell window open while viewing. Press **Ctrl+C** to stop the server.

No `npm install` is required. If you prefer npm, `npm start` and `npm run check` are equivalent. If Windows blocks `npm.ps1`, use the `node` commands above or `npm.cmd`; changing your PowerShell execution policy is unnecessary.

If port 4173 is already in use:

```powershell
$env:PORT = '4174'
node scripts/serve.mjs
```

To check a repository subpath locally, in a separate preview session:

```powershell
$env:BASE_PATH = '/cvyclip/'
node scripts/serve.mjs
```

Visit `http://127.0.0.1:4173/cvyclip/` (or the port you selected). Remove that temporary setting with `Remove-Item Env:BASE_PATH` when finished.

## Project layout

```text
cvyclip-site/
  site/                         Publish ONLY this folder
    index.html                  Landing page and all content
    privacy.html                Website privacy note
    styles.css                  Responsive styles and brand tokens
    script.js                   Mobile menu and concept controls
    assets/mark.svg              Brand mark / favicon
    assets/studio.svg            Original vector illustration
    staticwebapp.config.json    Azure response headers and SVG type
    .nojekyll                   Disable Jekyll processing where applicable
  scripts/serve.mjs              Local-only HTTP preview server
  scripts/validate.mjs           Dependency-free structural checks
  deploy/github-pages.yml       Copy this if choosing GitHub Pages
  deploy/azure-static-web-apps.yml  Optional Azure workflow template
  package.json
  README.md
```

The `deploy/` templates are intentionally inactive until you select a host. No domain, repository, cloud resource, or account has been created. There is no assumed ownership of `cvyclip.com` or any other domain.

## Put the project on GitHub

Create a GitHub account if needed, then create a repository named `cvyclip`. Use a public repository for the simplest GitHub Pages setup. Commit the **contents of the extracted project folder**, so `site/`, `deploy/`, and `README.md` are at the repository root. Do not upload only the ZIP or add an extra enclosing directory.

If using Git on Windows, open PowerShell inside the project folder and run:

```powershell
git init -b main
git add .
git commit -m "Add CvyClip landing website"
# Replace YOUR-USERNAME with your GitHub username.
git remote add origin https://github.com/YOUR-USERNAME/cvyclip.git
git push -u origin main
```

Sign in through Git's normal browser prompt. If Git asks for a commit identity, set your name and email using Git's instructions. Never put passwords, deployment tokens, or API keys in source files.

## Deploy to Azure Static Web Apps

Recommended for your Azure student account. Sign in to the Azure portal and check that your subscription is active and eligible for the plan shown there. This project requires no AI subscription or video-processing service.

### Option A — let Azure create the workflow

1. Push this project to GitHub.
2. In Azure, create a **Static Web App**. Choose your subscription, resource group, and an available name such as `cvyclip`. Choose a suitable plan (Free if offered and appropriate).
3. Connect GitHub, choose the `cvyclip` repository and `main` branch.
4. For build settings, choose **Custom** (no framework), app location **`site`**, API location **blank**, output location **blank**. This project is already static; no build command is needed.
5. Create the resource. Azure generates a GitHub workflow and a deployment secret for that resource.
6. Inspect the generated `.github/workflows/azure-static-web-apps-*.yml`. In its deploy step, confirm these values. Add `skip_app_build` and `skip_api_build` if absent:

```yaml
app_location: "site"
api_location: ""
output_location: ""
skip_app_build: true
skip_api_build: true
```

7. Keep the generated secret name/reference as Azure created it. Commit any workflow adjustment, then check the **Actions** tab for a successful run. Open the URL shown in the Azure resource overview.

### Option B — use the included workflow

Use this for an existing Azure Static Web App with a deployment token. Copy `deploy/azure-static-web-apps.yml` to `.github/workflows/azure-static-web-apps.yml`. Add the resource's deployment token in **GitHub repository → Settings → Secrets and variables → Actions**, named `AZURE_STATIC_WEB_APPS_API_TOKEN`. The token belongs in that secret field only.

Remove or disable another generated Azure workflow for the same resource to avoid duplicate deployments. Push to `main`, or run the workflow manually in Actions. If Azure uses a differently named secret, change the workflow reference to match it. The template deploys production on pushes to `main` and does not create pull-request preview environments.

Azure reads `site/staticwebapp.config.json` from the published folder. It sets response headers for this static site. No SPA fallback is needed because both pages are actual HTML files.

Official references: [Azure Static Web Apps quickstart](https://learn.microsoft.com/azure/static-web-apps/get-started-portal?pivots=github), [build configuration and skip_app_build](https://learn.microsoft.com/azure/static-web-apps/build-configuration).

## Deploy to GitHub Pages

1. Push the complete project to a GitHub repository.
2. Go to **Settings → Pages → Build and deployment → Source** and choose **GitHub Actions**.
3. Activate the supplied workflow. In PowerShell, inside your project folder:

```powershell
New-Item -ItemType Directory -Force .github/workflows
Copy-Item deploy/github-pages.yml .github/workflows/github-pages.yml
git add .github/workflows/github-pages.yml
git commit -m "Enable GitHub Pages deployment"
git push
```

4. Open **Actions → Publish CvyClip to GitHub Pages**. Wait for it to succeed. The deploy job and Settings → Pages show the actual URL, typically `https://YOUR-USERNAME.github.io/cvyclip/`.
5. If your default branch is not `main`, update the workflow's branch trigger and the GitHub Pages environment rules accordingly.

The workflow uploads **only `site/`**. Relative URLs support both repository pages and custom-domain roots without a base-path build. GitHub Pages does not apply Azure's response-header configuration, but the website still works. Public GitHub Pages is accessible to everyone.

Official references: [Configure a publishing source](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site), [custom GitHub Pages workflows](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages).

## Customize the site

- **Copy and project status:** edit `site/index.html`. Keep development labels until the corresponding features are actually usable. Update the roadmap, FAQ, and preview note together.
- **Brand:** edit the CSS variables at the top of `site/styles.css` and `site/assets/mark.svg`.
- **Artwork:** replace `site/assets/studio.svg`, update meaningful alternative text, and preserve appropriate usage rights. The current artwork is an original vector illustration, not a real customer, testimonial, or actual video.
- **Privacy:** update `site/privacy.html` before adding analytics, contact forms, uploads, or other services. Hosting providers may keep request logs; the privacy note already distinguishes that from the site code.
- **Domain:** connect a domain you own in your chosen host's settings and follow its DNS instructions. No `CNAME` or canonical URL is prefilled because a real deployment URL has not been selected.
- **Social sharing:** basic Open Graph text is present. Add an absolute `og:url`, canonical URL, and absolute `og:image` after you have a real domain and a share image; don't leave example URLs in production.
- **Future forms or APIs:** they require a deliberate backend/integration. There is no fake contact form or waitlist in this project. If adding external requests on Azure, update the restrictive CSP in `staticwebapp.config.json` as needed.

## Verify before publishing

Run `node scripts/validate.mjs`. It checks local links and fragments, IDs, page landmarks, image alternative attributes, JavaScript syntax, and Azure JSON. It is not a complete accessibility audit.

Also check in the browser:

- At narrow mobile, tablet, and desktop sizes: no clipped text or horizontal scrolling.
- Tab to the skip link, navigation, buttons, and FAQ; check visible focus.
- On mobile, open the menu, follow a link, and press Escape; it should close and Escape returns focus to Menu.
- Try all three format buttons and both caption styles; selection and the status text should update.
- Expand each FAQ and open the privacy page.
- With JavaScript disabled, navigation, FAQ, privacy, and all main content remain usable; inactive preview controls stay hidden.
- Test the deployed URL including a direct visit to `privacy.html` and a repository subpath if using GitHub Pages.

The final cloud deployment still needs your own GitHub/Azure account and host setup. No cloud deployment was performed as part of creating this package.
