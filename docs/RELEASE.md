# Releasing Locktrail

## Repository metadata

- Repository: `lukaluka3/locktrail`
- Description: `Understand npm lockfile changes. Offline dependency review with before/after trails, CLI and portable HTML reports.`
- Topics: `npm`, `lockfile`, `dependency-review`, `developer-tools`, `cli`,
  `dependency-graph`, `supply-chain`, `javascript`, `nodejs`
- License: MIT
- Initial version: 0.1.0 preview

The public source repository and npm registry publication are separate steps. Do
not suggest `npx locktrail` until the package is actually published and verified.

## Source release

1. Run `npm run check` and the real-input commands in [VALIDATION.md](VALIDATION.md).
2. Confirm the CI matrix on GitHub for the exact commit being released.
3. Run `npm pack`, install the tarball in a fresh directory with
   `npm install --offline --ignore-scripts --no-audit --no-fund /path/to/locktrail-0.1.0.tgz`,
   then run the installed CLI demo, HTML export, and the `locktrail` library import.
4. Open the exported HTML in a browser. Verify search, all filters, both path
   directions, a narrow viewport, and an empty-result state. Confirm no external
   requests or console errors.
5. Tag the checked commit and create a preview release explaining npm-only support
   and the lack of a vulnerability verdict. Attach the tested tarball if useful.
6. Refresh the README demo screenshot after visible report changes. Keep synthetic
   examples labeled and do not add invented metrics or testimonials.

## npm publication

The name returned 404 from the npm registry during preparation on 2026-10-12; that
does not reserve it or guarantee future availability. Confirm ownership and the
intended publishing identity before publishing. An npm account/token is not
included in this repository.

Before the first npm release, recheck package metadata and `npm pack --dry-run`,
ensure the archive contains only intended files, choose the correct release tag,
and configure npm's supported authentication for that publishing account. Follow
the current [npm publishing documentation](https://docs.npmjs.com/creating-and-publishing-unscoped-public-packages).

After publication, test the exact install command from a fresh directory before
adding it to the README or launch posts. Keep the source-install path as a fallback.

## Launch

Follow the validation gates and unsent drafts in [LAUNCH.md](LAUNCH.md). Public
source availability alone does not establish demand. Record real user feedback
before making claims about adoption, time saved, or star-growth potential.
