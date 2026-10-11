# Locktrail: first 30 days

Status: preparation plan and unsent launch drafts. Nothing in this document is a completed outreach, adoption result, scheduled automation, or published package. Day 1 begins when the maintainer starts the external validation round. The dates are relative so an unfinished release does not turn into a missed promise.

The first objective is **five external developers using Locktrail on real npm dependency updates**, followed by repeat use. Reaching 5,000 stars is an aspiration with no guaranteed timetable. Stars can indicate awareness; they cannot establish whether reviewers trust or keep using the tool.

## Positioning to validate

Proposed one-line description:

> Explain npm lockfile changes: what moved, which dependency brings it in, and what deserves review.

Lead with one visible example: a small direct-dependency update changes a nested package, and the report shows the path back to the dependency or workspace responsible. Then show an install-script metadata addition or same-version integrity change. Label the demonstration as synthetic unless it uses a documented real revision pair.

Use the [README](../README.md) as the source of truth for supported formats, commands and limitations. Avoid claims such as "first," "prevents supply-chain attacks," "proves packages safe," or "saves hours" without evidence. The [research record](RESEARCH.md) links close alternatives and explains why comparison matters.

## Release preparation

Before distributing an install command, run it from the actual packed artifact in a fresh directory. Record the operating system, Node version, artifact version and result. Verify the example from the README and a malformed-input failure. A clean source checkout is not the same test as a consumer install.

Source-checkout commands to verify for the release, from the repository root:

```sh
node bin/locktrail.mjs demo
node bin/locktrail.mjs demo --format html --output locktrail-demo.html
node bin/locktrail.mjs diff old-lock.json new-lock.json --format markdown
node bin/locktrail.mjs --repo path/to/project --base origin/main --head HEAD --merge-base --format markdown
```

The last two commands need the named input files or a real Git repository with the named refs available locally. Output files must not already exist. Omit `--head` to compare the selected base against the working lockfile. `--fail-on review` opts into exit 1 for a review signal; default reporting exits 0, and input errors exit 2. Installation may need a registry connection; the comparison itself does not fetch packages.

Prepare these assets before a broad post:

- A working public repository URL, the chosen license, contribution instructions, and clearly documented compatibility.
- A short real terminal recording of the included example, with a readable text equivalent.
- A report for a real, public npm update, identifying both commit IDs and any unresolved paths. Obtain permission before attributing a private user's experience or repository.
- A comparison paragraph linking existing alternatives. Describe the workflow difference; do not claim features are absent merely because their README omits them.
- A reproducible issue template requesting version, lockfile version, command, expected explanation and a shareable minimal fixture. Lockfiles can contain private names and URLs; do not ask users to publish private files.
- A release artifact or verified source-install route. Do not advertise `npx locktrail` until that exact package is actually owned, published and tested.

The report should work as a CI job summary before any bot-comment integration is added. A summary does not need to post messages to pull requests. Keep the initial integration easy to remove.

## Days 1–7: five real users

Recruit five developers who review npm updates, preferably from more than one project. Aim for a mix of a small application, a library, a workspace project, a team receiving automated update PRs, and a project with nested package copies. This is a recruitment target, not five invented testimonials or preselected people.

Start with existing professional relationships or communities where project-feedback requests are welcome. Share a specific useful example and the install route. Do not open unsolicited promotional issues on unrelated repositories. The maintainer sends any invitation deliberately; this plan does not authorize automated outreach.

Suggested invitation, to adapt and send manually:

> I am building Locktrail, an offline npm lockfile-review tool. It explains which direct dependency or workspace leads to a changed package and highlights a few metadata changes. Could you try it on one real dependency update you already need to review? I am looking for confusing paths and useless output, not stars. Existing alternatives are linked in the repository, and I would like to know if one already fits your workflow better.

For each participant, observe one existing review task. Ask them to identify the changed packages and why they are present using their normal workflow, then inspect the same update with Locktrail. Record what helped, what they still had to look up, which findings were noise, and whether they would keep the command. Time the task only with consent; five small observations do not justify a universal speed claim.

End-of-week gate: five people have run a real case, or record exactly how many did and why recruitment/install failed. Repair setup and explanation errors before a large launch. A download or a friend saying "looks good" does not meet the gate.

## Days 8–14: fix friction and check return use

Turn reported errors into minimal fixtures. Prioritize incorrect dependency paths, silent omissions and private-data exposure before presentation polish. Publish a small changelog explaining the observed problem and the correction.

Ask the original five whether they used it on a second real update at least seven days after their first run. Record "no second update occurred" separately from "had an update and chose not to use it." If fewer than three return, investigate that result before assuming more promotion will help. Three is a chosen decision threshold, not an industry benchmark.

Prepare two worked examples with pinned input revisions and report output. Include a boring update that produces little useful review noise. A tool needs to explain ordinary changes, not only carefully chosen warning cases.

## Days 15–21: one focused public launch

Launch only after the five-user round and repeat-use check, even if that moves this phase beyond day 21. Check community rules on the actual posting day. Post the relevant draft below in one suitable venue, disclose authorship and stay available to answer questions. Do not post the same text across many communities or ask people to coordinate votes.

Lead with the problem, a runnable example and the source. State that the project is early. Replace all draft placeholders and remove any claim not true of the release. When someone reports a limitation, add a fixture or explain the boundary instead of overstating the result.

The next distribution opportunity should follow actual usefulness: a maintainer sharing a report, a tutorial explaining a real dependency change, or a compatible integration. Approach an ecosystem newsletter with a concise demo only when there is a meaningful result to show. Do not promise editorial coverage.

## Days 22–30: decide what to keep building

Follow up on genuine bug reports and document their resolution. Invite contributions with bounded tasks: one graph fixture, one display improvement, or one supported platform verification. Avoid artificial "good first issue" busywork.

Compare retained use with the support burden. If most users only want a readable version table, explain why an existing tool may be sufficient. If dependency paths are the recurring value, improve that workflow before adding security feeds or another lockfile parser.

Publish a short progress note with real numbers and limitations: how many external users ran a real case, how many returned when they had another review, which bugs were corrected, and what remains unsupported. Do not turn a small convenience sample into a market survey.

## Minimal evidence log

Keep participant identities and private feedback outside the public repository unless they explicitly agree to publication. A local spreadsheet is sufficient; the CLI does not need telemetry for this exercise.

| Measure | Definition | Day-30 decision target, not an achieved result |
| --- | --- | --- |
| Real activation | External person successfully reviews their own actual update. | At least 5 people. |
| Return use | Original participant uses it on another actual update at least 7 days later. | At least 3; report whether each had a second opportunity. |
| Persistent use | A project voluntarily keeps the command or CI summary. | At least 2 projects. |
| Useful finding | Reviewer explains what the report helped them understand or act on. | Record specific examples; do not count every warning as useful. |
| Noise and correctness | Misleading or missing paths, unnecessary findings and misunderstood output. | Track each reproducible case and its resolution; no silent failures. |
| Awareness | Stars, visits, downloads and mentions. | Secondary context only; no pass/fail star quota. |

Record one row per participant/case with an anonymous ID, first-run date, tool version, public fixture or private-case label, install success, useful explanation, noise, second opportunity and return use. Report raw small counts rather than impressive percentages.

## Unsent Hacker News draft

Use only once there is a public working release and the text matches it.

**Title:** Show HN: Locktrail – explain npm lockfile changes and dependency paths

**URL:** `<REPOSITORY_URL>`

**First comment:**

> I built Locktrail to make npm dependency-update reviews easier to follow. It compares two package-lock files and shows changed installation locations with paths back to direct dependencies or workspaces. It also calls attention to metadata changes such as a newly recorded install-script flag, a source change, or an integrity change without a version change.
>
> The comparison runs locally without installing the target project or fetching its packages. It reads lockfile metadata; it does not inspect package behavior or give a vulnerability/safety verdict. The README lists supported lockfile versions and graph limitations.
>
> Demo and exact commands: `<README_DEMO_LINK>`
>
> There are already good tools here, including lockdelta, git-pkgs and lockdiff. I am exploring whether combining the changed package location with its direct-dependency/workspace explanation makes a more useful review. The research document links these alternatives.
>
> I would especially appreciate a small reproducible lockfile pair where the explanation is wrong or the output is noisy. Which part of a dependency-update PR still makes you open the raw lockfile?

Optional addition **only after evidence exists**: a short factual account of the five-user round, including the actual number who returned. Never fill this with targets disguised as results.

## Unsent Reddit draft

Choose one relevant community whose current rules allow an author project post. Adapt to the audience rather than cross-posting unchanged.

**Title:** I built an offline npm lockfile reviewer that explains dependency paths

**Body:**

> I am the author of Locktrail, a small open-source CLI for reviewing npm dependency changes.
>
> The question I wanted to answer is: "This nested package changed, but which dependency in my app brings it in?" The report keeps separate installed copies distinct, shows a path back to a direct dependency or workspace, and highlights a few metadata changes for closer review.
>
> Source and runnable example: `<REPOSITORY_URL>`
>
> It compares local lockfiles without installing the target project or contacting a registry. It does not read the package code or decide whether a package is safe. The README documents the supported npm lockfile versions and limitations.
>
> Similar projects are linked in the research notes. I am looking for feedback on the explanation itself: does it help with an update you already need to review, and where is it misleading? A minimal public fixture is helpful; please keep private package names and URLs out of public reports.

## Owner note

5,000 stars is an outcome other people control. The first useful milestone is five developers getting value from their own repositories and choosing to return. If that does not happen, improve the product or change the direction before investing in a bigger launch.
