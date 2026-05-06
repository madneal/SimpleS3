# SimpleS3

SimpleS3 is a lightweight desktop app for managing S3 buckets and S3-compatible object storage.

It is built with Tauri, React, TypeScript, and Rust. The Rust backend talks to S3 through the AWS SDK.

## Features

- Save connection profiles for AWS S3, MinIO, Cloudflare R2, Backblaze B2, Wasabi, Ceph RGW, and similar S3-compatible services.
- Test credentials and bucket access before browsing.
- Browse prefixes with folder-style navigation.
- Search the loaded objects in the current prefix.
- Upload, download, delete, and create folder markers.
- Load additional pages for large prefixes.

## Setup

Install the project dependencies:

```bash
pnpm install
```

Run the desktop app:

```bash
pnpm tauri dev
```

Run only the web UI:

```bash
pnpm dev
```

Build a desktop release:

```bash
pnpm tauri build
```

Check the Rust backend:

```bash
cd src-tauri
cargo check
```

## Connection Tips

For AWS S3, set the region and bucket name, then leave `Endpoint URL` empty.

For S3-compatible providers, set the provider endpoint and enable `Path-style requests` when the provider requires it.

Example endpoints:

```text
https://play.min.io
https://s3.us-west-004.backblazeb2.com
https://<account-id>.r2.cloudflarestorage.com
```

## Release

GitHub Actions builds release assets when a tag starting with `v` is pushed:

```bash
git tag v0.1.0
git push origin v0.1.0
```

The workflow builds macOS, Windows, and Linux bundles and uploads them to the GitHub Release.

## Security

Profiles are saved in WebView local storage. Secrets are saved only when `Remember secret locally` is enabled.

For production use, move saved secrets to the operating system keychain.
