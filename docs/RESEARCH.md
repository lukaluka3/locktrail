# Why Locktrail

Research date: 2026-10-12. This is a product decision record, not evidence of adoption. Competitor capabilities below come from their own documentation; we have not benchmarked their implementations. No customer interviews have been completed as part of this research.

Locktrail's initial hypothesis is that an npm pull-request reviewer wants to understand **which installed dependency changed, which direct dependency or workspace brings it in, and which metadata deserves a closer look**. A compact report could make that review easier without fetching packages or executing the project.

The bet is on a focused workflow and dependable output. Semantic lockfile diffs, dependency paths, and install-script review already exist. We do not claim a new category, unique security coverage, or a measurable probability of reaching 5,000 GitHub stars.

## Evidence for the problem

The npm lockfile format records package locations, resolved sources, integrity metadata and install-script flags. Its `packages` map distinguishes separate installation locations, including nested copies; links refer to another recorded package location. This makes location-aware comparison possible from the files themselves. The `hasInstallScript` flag describes lifecycle-script presence, not what the script does. An integrity change is a metadata difference, not proof of malicious code. These are the boundaries of Locktrail's review signals. [npm package-lock.json specification](https://docs.npmjs.com/cli/v11/configuring-npm/package-lock-json/)

Dependency paths are an established need: `npm explain` prints the chain that causes a package to be installed and accepts a particular `node_modules` location. Locktrail's proposed workflow brings this kind of explanation into a two-revision lockfile review. This is an integration hypothesis, not an invention of dependency explanation. [npm explain documentation](https://docs.npmjs.com/cli/v11/commands/npm-explain/)

Existing tools are evidence that people build solutions in this area, but their existence does not prove demand for another one. The first validation task is to show five external developers a report for their own real dependency update and observe whether it changes or accelerates a review.

## Competitors and adjacent tools

| Project | What its own documentation establishes | Implication for Locktrail |
| --- | --- | --- |
| [lockdelta](https://github.com/lachaib/lockdelta) | CLI, Action and library; diffs multiple ecosystems; discovers lockfiles; marks direct dependencies; exports structured reports and registry-origin changes. | General lockfile summarization and source-change reporting are already available. Focus on npm installation locations and clear before/after dependency paths; do not claim those broad features are unique. |
| [git-pkgs](https://github.com/git-pkgs/git-pkgs) | Indexes dependency changes across Git history, with history, blame, diff and why commands. Core history analysis works offline; other commands query external metadata. | Offline operation alone is not differentiation. Its broad historical workflow may already be the better choice for a user investigating when and why a dependency arrived. |
| [@aaaaorg/lockdiff](https://github.com/aaaaorg/lockdiff) | Human-readable npm lockfile diffs between refs or files, Markdown/JSON output, major-version filtering, and v1/v2/v3 support. | A version-change table is insufficient. Locktrail must earn its place through explanation quality and metadata review. |
| [npm-script-lens](https://github.com/Booyaka101/npm-script-lens) | Inspects actual install-script behavior, compares package versions, and has a sources command that reports direct/transitive Git or remote dependencies with dependency chains. | A lockfile flag cannot replace script inspection. Even dependency-chain reporting overlaps. Refer users here when they need the script contents or behavioral analysis. |
| [@root-manas/lockdiff](https://www.npmjs.com/package/%40root-manas/lockdiff) | Its published package README describes offline npm v2/v3 comparison by installation location, including integrity, origins, script metadata, dependency fields and engines. It explicitly avoids package-safety verdicts. | This is a close competitor. The intended emphasis on direct-dependency/workspace paths and a low-friction review report must be tested against it, not advertised as an uncontested gap. The linked source repository could not be read during this research; this comparison uses its published README. |

These projects may add features after this review. Absence from a README is not proof that a capability is absent. Re-check this table before a public launch or comparison claim.

## Alternatives considered

The following judgments are qualitative implementation choices, not market scores or forecasts.

| Direction | Useful first outcome | Main cost or risk | Decision |
| --- | --- | --- | --- |
| npm lockfile review | Explain a real dependency update without an install or account. | Existing close competitors; npm resolution details and report noise require care. | Build a narrow first release and validate usefulness before expansion. |
| General AI code reviewer | Find a defect in a proposed code change. | Crowded category; model cost, false findings and evidence quality complicate a credible small release. | Defer. [Staff Review](https://github.com/staffreview/staffreview) and [review-pro](https://github.com/tufantunc/review-pro) already provide substantial review workflows. |
| MCP interface compatibility | Flag a breaking tool-contract change between snapshots. | Multiple direct competitors and possible upstream integration reduce the opening. | Useful, but not the chosen starting point. See [mcpdiff](https://github.com/samlader/mcpdiff), [mcp-contracts](https://github.com/mcp-contracts/mcp-contracts), and the [official Inspector feature request](https://github.com/modelcontextprotocol/inspector/issues/1034). |
| Environment contract drift | Find a variable referenced in code but missing from deployment configuration. | Framework and dynamic-access differences produce false positives; existing implementations cover several languages. | Defer. [envgrd](https://github.com/njenia/envgrd) already targets source/config drift. |
| Bugfix test discrimination | Show that a new test fails before the fix and passes after it. | Executing two revisions requires careful setup, isolation and failure classification. | Defer. [PatchProof](https://github.com/JayadityaVetsa/PatchProof) already implements this exact workflow. |

AI-assisted development is context rather than the product's justification. Stack Overflow's 2025 survey reports 46% distrust versus 33% trust in AI-output accuracy; 66% of respondents to its frustrations question mention nearly correct solutions and 45% mention time-consuming debugging. Those responses support a broad verification problem, not a conclusion that respondents want Locktrail. [Original survey](https://survey.stackoverflow.co/2025/ai)

## What the first release must earn

The implementation and [README](../README.md) define what is actually supported. This decision record sets the quality bar:

1. Preserve installation identity: two nested copies of one package must remain distinct.
2. Show an understandable path from a root or workspace dependency to a changed package. Distinguish before and after paths when they differ. Explain unresolved or truncated paths explicitly.
3. Make installation-script metadata additions, same-version integrity differences, and source changes easy to review. State exactly which field changed.
4. Avoid package-safety scores and claims of vulnerability detection. A quiet report only means no supported review signal was found in those inputs.
5. Produce a useful first report from local files. Git integration and machine-readable output should simplify existing review workflows.
6. Document unsupported lockfile versions and graph cases rather than guessing.

Use a fixture corpus that includes hoisting, duplicate nested versions, scoped names, workspaces, aliases, optional and peer dependencies, removed roots, cycles, malformed inputs, private sources, and metadata-only changes. Mark synthetic examples clearly. For real examples, keep the repository URL and both immutable commit IDs, document the expected explanation, and record the actual command and output. No benchmark result is claimed until that case is run and reviewed.

## What would change the decision

Continue if external reviewers use the report on a second dependency update and can point to a useful explanation. Narrow the tool if they need only one of its signals. Prefer an integration or upstream contribution if an existing tool already meets their needs with less friction. Reconsider expansion if most requests concern pnpm or another ecosystem; do not add formats merely to enlarge a feature list.

Five thousand stars is a long-term visibility aspiration. The controllable work is correctness, a clear demonstration, an easy contribution path, useful maintainer relationships, and consistent releases. The first decision gate is five real external users, not a star count.
