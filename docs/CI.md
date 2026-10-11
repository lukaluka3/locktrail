# Add a dependency review summary to CI

The CLI does not post pull-request comments or require a write token. A Markdown
report can be appended to `GITHUB_STEP_SUMMARY`. Start in reporting mode; choose
`--fail-on review` after deciding which signals your team wants to gate.

The following recipe is for **after publishing the repository**. Replace
`YOUR_OWNER/locktrail` and `FULL_REVIEWED_COMMIT_SHA` with the actual repository
and an immutable commit. These are explicit placeholders, not working release
coordinates. Until then, use a trusted local checkout of the tool.

```yaml
name: Dependency review
on: [pull_request]
permissions:
  contents: read
jobs:
  locktrail:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1
        with:
          path: project
          fetch-depth: 0
          persist-credentials: false
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1
        with:
          repository: YOUR_OWNER/locktrail
          ref: FULL_REVIEWED_COMMIT_SHA
          path: tool
          persist-credentials: false
      - uses: actions/setup-node@949feb2413d6458794dcd2491c4babbbce0c15c1
        with:
          node-version: 24
          package-manager-cache: false
      - name: Summarize locked dependency changes
        env:
          BASE: ${{ github.event.pull_request.base.sha }}
          HEAD: ${{ github.event.pull_request.head.sha }}
        run: >-
          node tool/bin/locktrail.mjs --repo project
          --base "$BASE" --head "$HEAD" --merge-base
          --format markdown >> "$GITHUB_STEP_SUMMARY"
```

The target project is read as data, and no `npm install` is needed for either the
tool or the project. The tool checkout is pinned separately from the PR inputs.
Use `pull_request`, keep permissions read-only, and avoid executing PR-provided
scripts. A missing lockfile or unavailable revision exits 2; do not hide that with
`|| true`. This example expects the lockfile on both sides and the commit objects
available in the checkout.

Add `--lockfile path/to/package-lock.json` for a nested npm project. Multiple
lockfiles require multiple invocations. pnpm/Yarn/Bun are not supported yet.
