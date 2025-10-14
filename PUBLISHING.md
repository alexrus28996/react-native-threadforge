# Publishing `react-native-threadforge` to npm

This guide walks maintainers through releasing a new version of the
`react-native-threadforge` package to the npm registry.

## 1. Prerequisites

- Node.js 18 or newer and npm 9+ installed locally.
- An npm account with publish rights to the `react-native-threadforge` package.
- Access to a macOS machine (recommended) for running both Android and iOS checks.
- Git working tree must be clean (no uncommitted changes).

Log into npm if you have not already:

```bash
npm login
```

## 2. Update Version Metadata

1. Decide on the appropriate semantic version bump (major, minor, or patch).
2. Update the `version` field inside `packages/react-native-threadforge/package.json`.
3. Commit the change alongside any user-facing updates such as changelog entries.

## 3. Run Quality Checks

From the repository root execute the following commands to ensure the library and demo
app are healthy:

```bash
npm run lint
npm test
```

Then run the package-specific scripts:

```bash
cd packages/react-native-threadforge
npm run lint
npm run typescript
cd ../..
```

Build and run the demo application at least once on Android **and** iOS to verify that
native integrations still behave as expected:

```bash
npm start
npm run android
npm run ios
```

(Use separate terminals for Metro and each platform build.)

## 4. Inspect the Publish Payload

Use `npm pack` to create a tarball of the package contents. Inspect the archive to make
sure only the expected files are included.

```bash
cd packages/react-native-threadforge
npm pack
# inspect the generated .tgz, then delete it
rm react-native-threadforge-*.tgz
cd ../..
```

## 5. Publish

When everything looks good, publish from the package directory:

```bash
cd packages/react-native-threadforge
npm publish --access public
cd ../..
```

The `--access public` flag is necessary only the first time the package is published.
For subsequent releases you can omit it.

## 6. Tag the Release

Create a git tag matching the version and push it upstream:

```bash
git tag vX.Y.Z
git push origin vX.Y.Z
```

## 7. Update the Demo App

After publishing, bump the dependency in the root `package.json` to use the new version
instead of the local file reference if you want the demo to consume the registry build.
Then run `npm install` to update `package-lock.json`.

## 8. Announce the Release

Share the highlights with your team or community: update the changelog, write a blog
post, or announce the release in your preferred channels.

Happy shipping!
