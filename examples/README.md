# Demo fixtures

These two lockfiles describe **invented packages and synthetic changes**. They
exercise the real analyzer without downloading anything. They are not advisories,
real npm package metadata, or evidence that any named package is malicious.

`@northstar/export` updates from 1 to 2. Its dependency trail introduces a package
with an install-script flag, removes a legacy dependency, and reaches a same-version
package whose integrity and download host changed. The UI branch stays unchanged.

Run `node bin/locktrail.mjs demo` from the repository root.
