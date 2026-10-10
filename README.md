# Expedition Society Image Scout

A private, mobile-friendly editorial desk for finding images, learning from past Instagram posts, and curating a queue for Expedition Society Journal.

## Included in v0.2

- Live, on-demand image discovery from Wikimedia Commons and the Library of Congress. Searches retain image URL, original source, creator and available rights metadata.
- Manual image/source links; duplicate searches preserve previous decisions.
- Private owner sign-in using Supabase Auth, HttpOnly cookies and per-user row-level security. No service-role key required.
- Approve, reject, later, and return-to-queue controls with persistent decisions.
- Private seed-image uploads from your phone, labeled Excellent / Good / Average / Poor. Images are resized in your browser and stored in a private Supabase bucket.
- Optional CSV import of up to 200 historical Instagram posts with ratings, likes, comments, saves and reach.
- Requested OpenAI image analysis, structured editorial scores and related search queries.
- pgvector matching of **AI visual descriptions**, not native image embeddings. Excellent/Good seeds and approved images form positive references; Poor seeds and rejected images guide future analysis and reduce similarity scores. Average seeds are neutral.
- Atomically limited daily AI analysis attempts (default 30). Import and archive searches make no paid AI calls. Failed analysis attempts also consume the daily allowance.
- Example workspace with clearly labeled local illustrations and simulated scores; example review decisions are stored only in the current browser tab.

## What Jamie needs to provide

1. This code in `https://github.com/ExpeditionSociety/Expedition-Society-Image-Scout`.
2. A Supabase project; its project URL and publishable key (legacy anon key also works).
3. An OpenAI API key entered directly in Vercel environment variables. API usage is billed separately from ChatGPT subscriptions. Do not commit or paste secret keys into source files.
4. The owner email and a matching Supabase Auth account.
5. A small starter selection of photos or screenshots you can rate. Start with 10–20 examples across the four ratings. An Instagram export is not required; metrics can be added later.

## Deploy from an iPhone

### 1. Put this code in GitHub

The repository root must contain `package.json`, `api/`, `public/`, `lib/`, `vercel.json`, and `supabase/`. Do not upload the ZIP as a single repository file. Preserve the included hidden `.github/` and `.env.example` files.

### 2. Apply the database schema

Choose either route. Connecting Supabase to GitHub does **not**, by itself, apply SQL migrations.

**GitHub Actions route (no local computer needed):**

- In GitHub repository Settings → Secrets and variables → Actions, add `SUPABASE_ACCESS_TOKEN` (your Supabase account personal access token), `SUPABASE_PROJECT_REF` (the project reference from its dashboard URL), and `SUPABASE_DB_PASSWORD` (the database password set when creating the project).
- Open Actions → Apply Supabase migrations → Run workflow. The workflow links the project and runs `supabase db push` against the included migration.
- Check that the workflow finishes successfully. It is manually triggered so schema changes can be reviewed before applying them.

**Supabase dashboard route:**

- Open the two files in `supabase/migrations/` in GitHub. Apply `202610060001_image_scout.sql` first, followed by `202610100001_seed_images.sql`.
- Paste and run each migration once in Supabase → SQL Editor for a new project.
- This creates tables, pgvector support, private image storage, owner security policies, matching and the usage limit. The migration is versioned for future CLI use. Do not run it manually a second time; policies already exist.

### 3. Create your private account

In Supabase Authentication → Users, add your owner email and a password. Create it as confirmed (or confirm it through the available Supabase flow). The app does not expose sign-up. Set the same email in `OWNER_EMAIL`.

### 4. Connect Vercel to the repository

Import this repository as a Vercel project. Use Framework Preset **Other**, Build Command `npm run build`, Output Directory `dist`, and Node 22 or newer. `/api/scout.js` is the server function.

Add these environment variables for Production:

| Name | Value |
|---|---|
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_PUBLISHABLE_KEY` | Publishable or legacy anon key |
| `OWNER_EMAIL` | Your Supabase Auth account email |
| `OPENAI_API_KEY` | Your private OpenAI API key |
| `APP_ORIGIN` | Exact deployed origin, e.g. `https://image-scout.vercel.app`, no trailing slash |
| `DAILY_ANALYSIS_LIMIT` | Optional; default `30` |
| `OPENAI_VISION_MODEL` | Optional; default `gpt-4.1-mini` |
| `OPENAI_EMBEDDING_MODEL` | Optional; default `text-embedding-3-small`; must support 1536 dimensions |

If you do not know the Vercel URL until first deploy, add `APP_ORIGIN` after that deploy and redeploy. State-changing calls require an exact same-origin match. Preview deployments need their own exact `APP_ORIGIN`; with a production-only origin they deliberately cannot use the live backend.

### 5. Teach and scout

- Sign in. Open Taste archive → Upload seed images. Select images, choose a rating, and optionally add a note or original source. Uploads are saved privately; copies sent for AI analysis use temporary signed URLs. Up to 30 files per upload batch.
- Optionally use Import past posts for a CSV, with `public/history-template.csv` as the header template.
- For CSV imports, `image_url` must be a direct HTTPS JPG/PNG/WEBP image URL reachable by OpenAI. An Instagram post page is not an image URL. Expiring Instagram CDN links are fragile; use durable links to copies of your own images. Keep the Instagram post link in `post_url`.
- Analyze imported images individually. Importing an image does not analyze it automatically.
- Search a subject, inspect source information, then analyze promising finds and approve, save or reject them.
- In details, related queries fill the scout search box. Press Scout images to explore the next thread.

## Local development and checks

No runtime npm dependencies are needed. Node 22+:

```sh
cp .env.example .env
# Fill .env locally; APP_ORIGIN=http://localhost:3000
npm run dev
npm test
npm run build
```

The existing dependency-free JavaScript frontend and Node server were retained to finish the earlier build; this is not a Next.js/TypeScript rewrite.

The example workspace works without credentials. Live functionality needs the configured services and schema.

## Scope and honest limits

This is an MVP implementation, not a trained Instagram performance model. Engagement potential is an editorial hypothesis; visual matching compares embeddings of generated descriptions. Likes/saves/reach supply context, but there is no calibrated forecast or statistical outcome model. A cold-start archive has unknown novelty and archive-match values. Cached analyses are retained; new analyses use current feedback. In image details, Reanalyze with current taste requests a fresh paid analysis when you want existing scores updated.

Source metadata is preserved as a rights note, not a permission guarantee. Library of Congress item-specific rights are not retrieved automatically; open the source item's Rights & Access section. Wikimedia creator text and license name/link are retained, but exact required attribution should be copied from the source. Discovered images stay at their original URLs; uploaded seed images are stored privately. No reposting is automated. External images can disappear, refuse embedding, or be unsuitable for the vision model.

Not yet included: recurring autonomous scouting, Pinterest/Flickr/museum/general-web adapters, automatic Meta history ingestion, durable image mirrors, native visual embeddings, scheduled posts, publishing to Instagram, or a separate provenance-confidence model. No Meta or Pinterest credentials are needed for this release.

Validation: 18 automated checks pass, and the static build succeeds. Visual browser QA could not run in the build environment because the browser download failed.

Live OpenAI, Supabase and Vercel deployment require external credentials and must be smoke-tested after connection; archive adapters also need a live smoke test. Automated tests mock those APIs and cannot prove a deployed project's schema or provider configuration. Repository access alone does not create projects, provision secrets, or apply migrations.

## Primary API references

- https://vercel.com/docs/functions/runtimes/node-js
- https://supabase.com/docs/guides/api
- https://supabase.com/docs/guides/database/postgres/row-level-security
- https://supabase.com/docs/reference/cli/supabase-db-push
- https://developers.openai.com/api/docs/guides/images-vision
- https://developers.openai.com/api/docs/guides/embeddings
- https://www.mediawiki.org/wiki/API:Imageinfo
- https://www.loc.gov/apis/json-and-yaml/requests/
