# Security and privacy

Locktrail reads two lockfiles, optionally through read-only Git commands. It does
not install dependencies, load their JavaScript, run lifecycle scripts, contact a
registry, or send telemetry. Files passed to the CLI are limited to 20 MiB each.

The report contains package names, versions, dependency paths and lockfile
metadata. These may reveal private project details. CLI output removes URL
credentials, query strings and fragments from `resolved` fields and URL dependency
specifications. This is not a
general secret scanner: review reports before sharing. The raw `analyze()` library
return value preserves input metadata for programmatic consumers.

HTML reports escape lockfile data and embed no remote scripts, fonts, or images.
All filtering runs within the report. An HTML report should be treated like any
other file you received: open reports only from sources you trust.

## Scope of findings

Findings are metadata changes, not a vulnerability or malware verdict. The
`hasInstallScript` field says that npm recorded an install lifecycle script; a
lockfile does not contain that script's body. Missing metadata can limit findings.
Dependency trails explain declared graph reachability, not runtime execution or
proof that one manifest edit caused another change.

## Reporting a vulnerability

Use [GitHub private vulnerability reporting](https://github.com/lukaluka3/locktrail/security/advisories/new)
for this repository. If that option is unavailable,
open a minimal issue asking the maintainer for a private channel; omit exploit
details and sensitive lockfiles from the public issue.
