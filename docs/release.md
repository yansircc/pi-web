# Release checklist

Artifacts:

- npm package: `@yansircc/pi-web`
- GitHub release: `yansircc/pi-web`

Run this process from a clean `main` checkout with Node `>=22.19.0`, pnpm `10.11.0`, and Vite Plus `0.2.4`. The repository must contain only `pnpm-lock.yaml`.

## 1. Preflight

```bash
corepack enable
set -a
. ./.dev.vars
set +a
node --version
pnpm --version
git status --short --branch
git log --oneline --decorate -5
gh auth status
pnpm whoami
effect-skill-scan --version
```

The scanner must be a clean installed build. A changed scanner build id requires a fresh baseline review; do not compare only compliance hashes across scanner builds.

## 2. Reproduce the release gates

```bash
pnpm install --frozen-lockfile
pnpm exec vp check
pnpm exec vp run ci:typecheck
pnpm exec vp test
pnpm effect:scan
pnpm exec vp build
pnpm test:e2e
pnpm test:package
git diff --check
```

Required evidence:

- Effect scan resolves `v4`, has zero findings, and has no orphaned/ownerless suppression.
- Playwright uses the isolated fixture under `test-results/`; it must not read or mutate the operator's real Pi state.
- The package smoke installs the tarball into empty npm and pnpm consumers and validates health, page, and SSE.
- The CI package matrix is green on macOS, Linux, and Windows.
- The tarball does not contain `.output/server/node_modules`, `.next`, source, or caches.

## 3. Bump and inspect

```bash
pnpm version patch --no-git-tag-version
git diff -- package.json pnpm-lock.yaml
pnpm pack --pack-destination "$(mktemp -d)"
```

Confirm the tarball inventory is limited to `bin`, `.output`, `public`, and `package.json`. The Nitro entry must be `.output/server/index.mjs`.

## 4. Commit, tag, and push the immutable source

The registry artifact must be derived from a source commit that already exists remotely. Never publish first and attempt to create its tag afterward.

```bash
git add package.json pnpm-lock.yaml
git commit -m "chore(release): prepare v<version>"
git tag -a v<version> -m "v<version>"
git push origin main --tags
```

All commits use Conventional Commits. Confirm the tag does not already exist before creating it, then wait for the tag/commit CI matrix to pass.

## 5. Publish from the verified tag

Check out the pushed tag in a clean checkout. The package `prepack` hook rebuilds the Nitro artifact. The committed `.npmrc` reads `NPM_TOKEN` from the ignored root `.dev.vars`; never commit the token.

```bash
git checkout v<version>
pnpm install --frozen-lockfile
set -a
. ./.dev.vars
set +a
pnpm publish
```

Verify the exact version against the public registry:

```bash
pnpm view @yansircc/pi-web@<version> version --registry https://registry.npmjs.org/
```

## 6. Release notes

Derive notes from the actual range, not memory:

```bash
git log --format='%h%x09%s%n%b' v<previous>..v<version>
git diff --stat v<previous>..v<version>
```

Include Chinese and English sections, grouped into Added, Fixed, Improved, and Internal. Mention the published npm version.

```bash
gh release create v<version> \
  --repo yansircc/pi-web \
  --verify-tag \
  --title "v<version>" \
  --notes-file release-notes.md
```

## 7. Final verification

```bash
gh release view v<version> --repo yansircc/pi-web
pnpm view @yansircc/pi-web@<version> version --registry https://registry.npmjs.org/
git status --short --branch
git log --oneline --decorate -3
```

The GitHub release must exist, the exact npm version must resolve, and `main`/tag/working tree must be aligned.
