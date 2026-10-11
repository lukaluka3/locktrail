# Real lockfile validation

The [initial GitHub CI run](https://github.com/lukaluka3/locktrail/actions/runs/38180250693)
at commit `8557a66e7095c0ad7e5675405a159dcc3721d942` passed all nine jobs:
Node.js 20, 22, and 24 on Windows, Linux, and macOS. Each job ran the 50-test suite,
syntax checks, HTML demo generation, and package dry-run. The local evidence below
was recorded before that remote run.

Recorded on 2026-10-12 against the local, unreleased Locktrail 0.1.0 implementation. Two pairs of public npm lockfiles were downloaded at immutable Git commits and analyzed without installing either target project. This is a reproducible smoke check with selected declaration checks, not a security assessment, proof of complete npm compatibility, or a performance benchmark.

Environment: Node.js `v24.15.0`, Windows `10.0.19045.0`, Windows PowerShell `5.1.19041.6456`. JSON, text and HTML were generated for each pair. All six final CLI invocations exited 0. The analysis used local input files; fetching those inputs from GitHub was a separate network operation.

## Inputs

The commit pairs were selected using the public GitHub commits endpoint with `path=package-lock.json&per_page=2`, then downloaded through commit-pinned raw URLs. Reproduce with the fixed SHAs below, not whatever the moving API query returns later.

| Case | Before | After |
| --- | --- | --- |
| actions/setup-node | [`7207c4f1189c7ee83ddf20c7c68bd1af6fdd751c`](https://github.com/actions/setup-node/commit/7207c4f1189c7ee83ddf20c7c68bd1af6fdd751c), 2026-10-08 | [`949feb2413d6458794dcd2491c4babbbce0c15c1`](https://github.com/actions/setup-node/commit/949feb2413d6458794dcd2491c4babbbce0c15c1), 2026-10-08 |
| npm/cli | [`c039090578a5b21a1aa3aba9c96e199feaf1823a`](https://github.com/npm/cli/commit/c039090578a5b21a1aa3aba9c96e199feaf1823a), 2026-09-22 | [`c276cadf785c1018d82dd287fe7742567055efb9`](https://github.com/npm/cli/commit/c276cadf785c1018d82dd287fe7742567055efb9), 2026-09-30 |

Both repositories use lockfile version 3 in these snapshots. The setup-node `packages` map contains 497 entries before and 505 after, including its root. The npm/cli maps each contain 1,202 entries, including the root and workspace entries. These are lockfile locations, not counts of unique package names.

Direct inputs:

- setup-node: [before lockfile](https://raw.githubusercontent.com/actions/setup-node/7207c4f1189c7ee83ddf20c7c68bd1af6fdd751c/package-lock.json), [after lockfile](https://raw.githubusercontent.com/actions/setup-node/949feb2413d6458794dcd2491c4babbbce0c15c1/package-lock.json).
- npm/cli: [before lockfile](https://raw.githubusercontent.com/npm/cli/c039090578a5b21a1aa3aba9c96e199feaf1823a/package-lock.json), [after lockfile](https://raw.githubusercontent.com/npm/cli/c276cadf785c1018d82dd287fe7742567055efb9/package-lock.json).

Downloaded-byte checksums:

| Input | Bytes | SHA-256 |
| --- | ---: | --- |
| setup-node before | 251,594 | `45cae806e5bff19127ca15a5ae802b48623ac2e2574960835e4aeaa91ea309b1` |
| setup-node after | 254,915 | `ca72b6550785f29a35830f9f9399d124fa80c76598f27ba0dbdbeef9fe2c8216` |
| npm/cli before | 437,416 | `f1f614ee94a925318e34b299694c99f3a113634e48f4740fddecad3bb1288183` |
| npm/cli after | 437,416 | `785ca65893e25bc3ef9c870d191818104031b21b15030fd6bedbd18a3d7050b0` |

## Observed results

| Case | Added | Changed | Removed | Unchanged | Findings | Review-level signals | Graph warnings |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| setup-node | 9 | 7 | 1 | 488 | 3 informational | 0 | 2 |
| npm/cli | 0 | 1 | 0 | 1,200 | 0 | 0 | 2 |

The comparison excludes the root project from dependency-change counts. The setup-node findings describe major-version changes in `file-entry-cache`, `flat-cache`, and `keyv`. They are informational and do not trigger `--fail-on review`. Zero review signals says only that these inputs did not trigger the supported review rules; it says nothing about package safety.

Both cases emit a warning for each input graph because alternate route exploration was capped at four candidates per package. All 17 setup-node change records indicate bounded path enumeration. The one changed npm/cli workspace record does not carry a truncation flag, but other parts of that input graph reached the exploration cap. The reports therefore do not claim that every possible dependency route was displayed.

The defaults display at most three routes per changed package and limit depth to 128 edges. A separate shared budget limits emitted before/after route output to 100,000 path steps; this budget was not exhausted in either case. Package changes remain present when route output is bounded.

### A verified nested dependency path

The setup-node update changes the root development dependency on ESLint from `^10.5.0` to `^10.11.0`. The [after package manifest](https://github.com/actions/setup-node/blob/949feb2413d6458794dcd2491c4babbbce0c15c1/package.json#L54) confirms the new root declaration. Inspecting the downloaded after-lockfile independently of Locktrail's report confirmed this path:

```text
setup-node@7.1.0
  -> eslint@10.11.0
  -> file-entry-cache@11.1.5
  -> flat-cache@6.1.23
  -> cacheable@2.5.0
  -> qified@0.10.1
  -> hookified@2.2.0
```

Every edge on that selected path has a corresponding declaration in the input:

| Declaring location | Field | Dependency | Recorded specification |
| --- | --- | --- | --- |
| root | `devDependencies` | `eslint` | `^10.11.0` |
| `node_modules/eslint` | `dependencies` | `file-entry-cache` | `11.1.5 \|\| >11.1.6 <12` |
| `node_modules/file-entry-cache` | `dependencies` | `flat-cache` | `^6.1.23` |
| `node_modules/flat-cache` | `dependencies` | `cacheable` | `^2.5.0` |
| `node_modules/cacheable` | `dependencies` | `qified` | `^0.10.1` |
| `node_modules/qified` | `dependencies` | `hookified` | `^2.1.1` |

The final node is installed at `node_modules/qified/node_modules/hookified`. Another new copy is recorded at `node_modules/hookified`, version `1.15.1`. The report retains both locations and versions separately. Their entries and the declaration from qified can be checked in the [pinned lockfile](https://github.com/actions/setup-node/blob/949feb2413d6458794dcd2491c4babbbce0c15c1/package-lock.json#L5984). This verifies a representative location/path case; it is not an exhaustive independent audit of every route.

### A real compatibility issue found and fixed

The first npm/cli run failed during input validation. The public lockfile records `node_modules/jsonparse`, version `1.3.1`, with this legacy metadata:

```json
"engines": ["node >= 0.2.0"]
```

Locktrail initially accepted only the modern object form of `engines`. The [unmodified input](https://github.com/npm/cli/blob/c039090578a5b21a1aa3aba9c96e199feaf1823a/package-lock.json#L7543) exposed that overly strict assumption. The parser was changed to preserve legacy arrays of strings as well as modern string maps, and a regression test was added. The downloaded inputs were not rewritten to make the run pass.

After that correction, JSON, text and HTML output all completed. The one dependency change is the `@npmcli/config` workspace from `11.1.0` to `11.2.0` at `workspaces/config`. Independent inspection confirmed the new root declaration `@npmcli/config: ^11.2.0`, the link at `node_modules/@npmcli/config` targeting `workspaces/config`, and the target's version. The report shows both the workspace route and the route through its link; repeated package names there represent distinct recorded locations.

The engine file used for the final release-check runs had SHA-256 `ce21b2faa2030ad287836c78852eb60ab5cb839c815ccd1dca9ad3c6a1581d53`. This identifies the checked local implementation; it is not a published release identifier. A final audit added explicit graph warnings for alternate-route pruning, so these final warning counts supersede the earlier smoke results.

## Reproduce from a source checkout

Run these PowerShell commands from the Locktrail repository root. They fetch only the four named public files. The input and report directory is ignored by Git. Choose a new output directory for another run because the CLI refuses to overwrite reports.

```powershell
$validationHeaders = @{ 'User-Agent' = 'Locktrail-validation' }
$validationCases = @(
    @{
        name = 'setup-node-reproduction'
        repo = 'actions/setup-node'
        before = '7207c4f1189c7ee83ddf20c7c68bd1af6fdd751c'
        after = '949feb2413d6458794dcd2491c4babbbce0c15c1'
    },
    @{
        name = 'npm-cli-reproduction'
        repo = 'npm/cli'
        before = 'c039090578a5b21a1aa3aba9c96e199feaf1823a'
        after = 'c276cadf785c1018d82dd287fe7742567055efb9'
    }
)

foreach ($validationCase in $validationCases) {
    $validationDirectory = '.local/validation/' + $validationCase.name
    New-Item -ItemType Directory -Path $validationDirectory -Force | Out-Null
    foreach ($validationSide in @('before', 'after')) {
        $validationUrl = 'https://raw.githubusercontent.com/' +
            $validationCase.repo + '/' + $validationCase[$validationSide] +
            '/package-lock.json'
        Invoke-WebRequest -UseBasicParsing -Headers $validationHeaders `
            -Uri $validationUrl `
            -OutFile ($validationDirectory + '/' + $validationSide + '.json')
    }
    foreach ($validationFormat in @('json', 'text', 'html')) {
        $validationOutput = $validationDirectory + '/report.' + $validationFormat
        node bin/locktrail.mjs diff `
            ($validationDirectory + '/before.json') `
            ($validationDirectory + '/after.json') `
            --format $validationFormat --output $validationOutput
        if ($LASTEXITCODE -ne 0) {
            throw ('Locktrail exited ' + $LASTEXITCODE)
        }
    }
}
```

For any downloaded pair, the direct CLI commands are:

```sh
node bin/locktrail.mjs diff before.json after.json --format json
node bin/locktrail.mjs diff before.json after.json --format text
node bin/locktrail.mjs diff before.json after.json --format html --output report.html
```

The original local artifacts are under `.local/validation/setup-node-20261012/` and `.local/validation/npm-cli-20261012/`, with `report-release.json`, `report-release.txt`, and `report-release.html`. They are intentionally not committed. JSON values and selected dependency declarations were checked, and HTML generation was checked for a complete document. This record does not claim a visual browser review of those real-project reports.

## Local release and browser checks

`npm run check` passed all 50 tests, with no skipped tests, in the final local run.

The release checks also exercised the packaged consumer path on Windows with Node.js `v24.15.0`. An artifact produced by `npm pack` was installed into a fresh temporary directory outside the source repository with `--offline --ignore-scripts --no-audit --no-fund`. The installed package's bundled demo produced JSON and HTML successfully, and importing the public library API succeeded. The installed executable shim was also exercised successfully with `npm exec --offline --no -- locktrail demo --format json`.

The bundled HTML demo was opened in Chromium `155.0.8059.39` at a desktop viewport of `1280 × 1230` and a mobile viewport of `390 × 844`. Filters, search and the empty-results state were exercised. The local browser check reported zero console errors and zero external requests. This checks the included demonstration's presentation and interaction, not every real-world report or browser engine.

These are local checks. At the time this record was written, remote GitHub Actions CI had not run as part of this validation. No npm registry publication is implied.

## Limits of this evidence

These cases exercise a real nested-version change and a real workspace release, plus legacy engine metadata. They do not cover every npm layout, lockfile v2, every review-rule trigger, or other operating systems. No target package code was executed or checked for vulnerabilities. No general speed or review-time improvement is inferred from these runs. Unit and integration tests provide separate coverage, and external-user validation remains outstanding.
