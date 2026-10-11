# Roadmap

This is an early release. Roadmap items are proposals, not supported features.

## Before promoting 0.1.0 broadly

1. Have five maintainers try real npm dependency updates and record whether the
   trails save review time. Preserve their privacy and ask before quoting feedback.
2. Expand regression fixtures around cases those users find confusing.
3. Verify the GitHub CI matrix on Windows, Linux, and macOS.
4. Publish a versioned release, then npm only after name/owner confirmation.

## Candidate next releases

- pnpm support, including peer snapshots, importers, and multi-document lockfiles.
- Better explanations of deduplication and packages moving installation paths.
- Optional policy file for trusted sources and intentionally allowed scripts.
- A GitHub Action once the CLI and report schema have settled.
- npm aliases and peer-edge explanations backed by a larger real-world corpus.

Choose priorities from repeated user requests. Avoid an LLM dependency, hosted
accounts, and a dashboard until they solve a demonstrated problem that the small
offline CLI cannot solve well.
