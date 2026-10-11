# Locktrail: first 30 days

Status: external-validation plan. The repository, interactive demo and v0.1.0 preview artifact are public; the package is not published to npm. No outreach or external adoption is recorded here. Day 1 begins when the maintainer starts the validation round. The dates are relative so an unfinished milestone does not turn into a missed promise.

The first objective is **five external developers using Locktrail on real npm dependency updates**, followed by repeat use. Reaching 5,000 stars is an aspiration with no guaranteed timetable. Stars can indicate awareness; they cannot establish whether reviewers trust or keep using the tool.

## Positioning to validate

Proposed one-line description:

> Explain npm lockfile changes: what moved, which dependency brings it in, and what deserves review.

Lead with one visible example: a small direct-dependency update changes a nested package, and the report shows the path back to the dependency or workspace responsible. Then show an install-script metadata addition or same-version integrity change. Label the demonstration as synthetic unless it uses a documented real revision pair.

Use the [README](../README.md) as the source of truth for supported formats, commands and limitations. Avoid claims such as "first," "prevents supply-chain attacks," "proves packages safe," or "saves hours" without evidence. The [research record](RESEARCH.md) links close alternatives and explains why comparison matters.

## Release preparation

Before distributing an install command, run it from the actual packed artifact in a fresh directory. Record the operating system, Node version, artifact version and result. Verify the example from the README and a malformed-input failure. A clean source checkout is not the same test as a consumer install.

The [README quick start](../README.md#try-it-in-30-seconds) uses the pinned GitHub release with `npm exec`, without cloning this repository or installing a global command. Its fresh-cache installation and real-project workflow checks are recorded in [VALIDATION.md](VALIDATION.md). These additional source-checkout commands run from the Locktrail repository root:

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

If starting without an audience, begin with one community thread that permits this kind of feedback request. Choose it by fit with npm dependency reviews, not subscriber count. Offer the browser demo before the install command, identify the synthetic example, and ask for one specific observation from an actual review. A first participant is enough to start learning; there is no need to wait for all five. Check responses after two or three days and record whether anyone tried it. That interval is a planning choice, not a prediction of reach. If nobody does, investigate the problem statement, audience fit and first-run instructions before repeating the post elsewhere.

Suggested invitation, to adapt and send manually:

> I am building Locktrail, an offline npm lockfile-review tool. It explains which direct dependency or workspace leads to a changed package and highlights a few metadata changes. Could you try it on one real dependency update you already need to review? I am looking for confusing paths and useless output, not stars. Existing alternatives are linked in the repository, and I would like to know if one already fits your workflow better.

For each participant, observe one existing review task. Ask them to identify the changed packages and why they are present using their normal workflow, then inspect the same update with Locktrail. Record what helped, what they still had to look up, which findings were noise, and whether they would keep the command. Time the task only with consent; five small observations do not justify a universal speed claim.

End-of-week gate: five people have run a real case, or record exactly how many did and why recruitment/install failed. Repair setup and explanation errors before a large launch. A download or a friend saying "looks good" does not meet the gate.

## Days 8–14: fix friction and check return use

Turn reported errors into minimal fixtures. Prioritize incorrect dependency paths, silent omissions and private-data exposure before presentation polish. Publish a small changelog explaining the observed problem and the correction.

Ask the original five whether they used it on a second real update at least seven days after their first run. Record "no second update occurred" separately from "had an update and chose not to use it." If fewer than three return, investigate that result before assuming more promotion will help. Three is a chosen decision threshold, not an industry benchmark.

Prepare two worked examples with pinned input revisions and report output. Include a boring update that produces little useful review noise. A tool needs to explain ordinary changes, not only carefully chosen warning cases.

## Days 15–21: one focused public launch

Launch only after the five-user round and repeat-use check, even if that moves this phase beyond day 21. Check community rules on the actual posting day, including rules about AI-assisted writing. The maintainer writes a personal account for one suitable venue, discloses authorship and stays available to answer questions. The factual notes below are preparation, not submission text. Do not post the same text across many communities or ask people to coordinate votes.

Lead with the problem, a runnable example and the source. State that the project is early. Describe only experience and results the maintainer can substantiate. When someone reports a limitation, add a fixture or explain the boundary instead of overstating the result.

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

## Author briefing: facts to verify before writing

These notes are not a post or comment to copy into a community. Write from personal experience and follow the destination's writing rules.

| Item | Current evidence |
| --- | --- |
| Public source | [lukaluka3/locktrail](https://github.com/lukaluka3/locktrail), MIT license. |
| Try without installing | [Interactive demo](https://lukaluka3.github.io/locktrail/); all example packages are synthetic. |
| Run on a real repository | [Pinned preview command](https://github.com/lukaluka3/locktrail#run-on-your-repository), Node 20+ and npm required. |
| Supported input | npm `package-lock.json` versions 2 and 3; local file pairs or locally available Git revisions. |
| Review output | Changed installation locations, dependency/workspace paths and selected metadata changes. |
| Limits | No package-code inspection, vulnerability database or safety verdict. Graph limits and omitted paths are documented. |
| Verification | [Validation record](VALIDATION.md), including pinned real inputs and consumer-install checks. These are maintainer tests, not external adoption. |
| Existing alternatives | [Research record](RESEARCH.md), including lockdelta, git-pkgs and lockdiff. |
| Feedback to learn from | A specific path that helped explain an actual update, or a minimal shareable example of confusing output. |

Only include an account of the five-user round after it happens, with the actual counts and limitations. Never fill this with targets disguised as results.

## Venue conditions checked on 2026-10-12

Recheck the linked rules on the posting day. Community permission and audience fit are separate questions; an allowed post does not guarantee readers or users.

- **r/SideProject:** its [official sidebar and submission text](https://www.reddit.com/r/SideProject/about.json) explicitly welcome project sharing and constructive feedback, and request the title format `[Project name] - [Short description]`. This is the first candidate when starting without an audience. Its broad audience means a response is not necessarily from someone who reviews npm updates; count actual trials separately from comments.
- **r/javascript:** the [community wiki](https://www.reddit.com/r/javascript/wiki/index/) provides Showoff Saturday for projects. A comment in the current thread is a better starting point than a marketing survey disguised as an `[AskJS]` discussion. Respect the rules on self-promotion and participation; do not use the community only to promote this project.
- **Hacker News:** the [general guidelines](https://news.ycombinator.com/newsguidelines.html) prohibit generated or AI-edited posts and comments. [Show HN](https://news.ycombinator.com/showhn.html) expects something people can try and meaningful personal work; it discourages quickly generated one-offs. The maintainer must assess that requirement honestly and write any submission independently. Do not use a generated launch draft.
- **DEV:** [#showdev](https://dev.to/t/showdev) is a project-sharing venue, but the [AI-assisted article guidelines](https://dev.to/guidelines-for-ai-assisted-articles-on-dev/) prohibit AI-assisted articles that promote programs, including the author's own. Disclosure does not substitute for following that rule. Any promotional article must be written independently by the maintainer.
- **r/devops:** the [subreddit rules](https://www.reddit.com/r/devops/about/rules.json) place promotion in its weekly thread, require affiliation at the start and require moderator approval for product-validation requests. Find the current weekly thread before posting; do not treat this plan as moderator approval.

## Owner note

5,000 stars is an outcome other people control. The first useful milestone is five developers getting value from their own repositories and choosing to return. If that does not happen, improve the product or change the direction before investing in a bigger launch.
