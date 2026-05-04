# SimpleS3

SimpleS3 is a desktop GUI for managing Amazon S3 and S3-compatible object storage. It is built with Tauri, React, TypeScript, and Rust, with the Rust side handling S3 operations through the AWS SDK.

The app is aimed at day-to-day bucket work: keep a few connection profiles, test credentials, browse prefixes, upload files, download objects, create folder markers, and delete objects without switching to a cloud console or CLI.

## Features

- Connection profiles with access key, secret key, region, bucket, endpoint URL, and path-style mode.
- Optional local secret persistence per profile.
- Connection testing through bucket listing and bucket reachability checks.
- Prefix-aware object browser with folder-style navigation.
- Object search, object/folder counts, and total size summary.
- Upload from native file picker.
- Download to native save picker.
- Delete selected objects.
- Create folder markers for S3-compatible folder workflows.

## Supported Targets

SimpleS3 can work with AWS S3 and S3-compatible providers such as MinIO, Cloudflare R2, Backblaze B2 S3 API, Wasabi, Ceph RGW, and self-hosted S3 gateways.

For many compatible providers, enable `Path-style requests` and set the provider endpoint, for example:

```text
https://play.min.io
https://s3.us-west-004.backblazeb2.com
https://<account-id>.r2.cloudflarestorage.com
```

For standard AWS S3, leave the endpoint blank to use the SDK default endpoint resolution.

## Development

Prerequisites:

- Node.js 20 or newer.
- pnpm.
- Rust.
- Tauri system dependencies for your operating system.

Install dependencies:

```bash
pnpm install
```

Run the web UI only:

```bash
pnpm dev
```

Run the desktop app:

```bash
pnpm tauri dev
```

Build the frontend:

```bash
pnpm build
```

Check the Rust backend:

```bash
cd src-tauri
cargo check
```

Build a distributable desktop app:

```bash
pnpm tauri build
```

Build a macOS `.app` bundle:

```bash
pnpm tauri build --bundles app
```

The generated app is written to:

```text
src-tauri/target/release/bundle/macos/SimpleS3.app
```

For cross-platform releases, build on each target operating system or use CI runners for macOS, Windows, and Linux. Tauri apps are native bundles, so macOS builds are produced on macOS, Windows installers on Windows, and Linux packages on Linux.

## Release

Release builds are handled by GitHub Actions. Push a version tag that starts with `v`:

```bash
git tag v0.1.0
git push origin v0.1.0
```

The release workflow builds macOS Apple Silicon, macOS Intel, Windows, and Linux bundles, creates a GitHub Release for the tag, and uploads the generated installer assets.

## Architecture

```text
src/
  App.tsx              Main workspace, profile state, object browser, actions
  views/Option.tsx     Connection/profile form
  App.css              Desktop workspace styling
  views/style.css      Connection form styling

src-tauri/
  src/main.rs          Tauri commands and S3 client operations
  tauri.conf.json      Desktop window, bundle, and native dialog permissions
  Cargo.toml           Rust dependencies and Tauri feature flags
```

Frontend actions call Tauri commands with `@tauri-apps/api/tauri.invoke`. Rust builds an S3 client from the active profile and exposes commands for:

- `test_connection`
- `list_objects`
- `upload_file`
- `download_object`
- `delete_object`
- `create_folder`

## Security Notes

Credentials are held in the app state while the app runs. Saved profiles are stored in WebView local storage. Secrets are only saved when `Remember secret locally` is enabled.

For production use, prefer storing secrets in the operating system keychain instead of WebView local storage. Also consider profile encryption, session tokens, IAM role support, and a clear credential removal flow.

## Technology Direction

The current stack is a good fit for a lightweight desktop storage manager:

- Tauri keeps the desktop shell small and lets Rust own filesystem and S3 operations.
- React and TypeScript make the management UI straightforward to evolve.
- The AWS SDK for Rust avoids shelling out to external CLI tools and supports S3-compatible endpoint configuration.

Recommended next improvements:

- Move from Tauri v1 to Tauri v2 after upgrading the Rust toolchain and planning the dependency migration.
- Add a keychain plugin or small Rust keychain layer for saved credentials.
- Add multipart upload/download progress for large files.
- Add pagination with continuation tokens for large prefixes.
- Add bucket creation, object copy/move, object metadata, presigned URL generation, and ACL/policy views.
- Add integration tests against MinIO in CI.
