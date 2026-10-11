# Contributing

Locktrail is a small, offline dependency review tool. Good contributions improve
the accuracy of a dependency trail, reduce confusing output, or make the first run
easier. Public and synthetic before/after examples are especially useful.

## Develop

Use Node.js 20 or newer and Git. There are no runtime or development dependencies
to install.

```sh
npm run check
node bin/locktrail.mjs demo
node bin/locktrail.mjs demo --format html --output my-report.html
```

Tests use Node's built-in test runner. Add a regression fixture for a parser or
graph change; avoid snapshot-only tests that simply repeat implementation output.
Keep input errors distinct from a valid report with no changes.

## Scope

- `src/engine.mjs`: validated npm lockfile parsing, graph resolution, comparison.
- `src/report.mjs`: plain text, Markdown, and portable interactive HTML.
- `src/cli.mjs`: arguments, local files, read-only Git queries, exit status.
- `examples/`: explicitly synthetic demo fixtures.

Keep findings factual and explain the evidence. A changed checksum, an install
script flag, or a new download host is a reason to review, not proof of malware.
New formats need fixtures that cover their graph semantics before claiming support.

Please discuss new package managers and large new features in an issue first.
Small bug fixes and documentation corrections can go straight to a pull request.
Contributions are provided under this repository's MIT license. Be respectful,
specific, and constructive in reviews and discussions.
