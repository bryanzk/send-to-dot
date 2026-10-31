# Install the newest published release, including previews

The user-facing prompt is at the top of both README files. Its repository release URL is on its own line so copied Chinese punctuation cannot become part of the URL.

This project currently publishes previews. “Newest published” means the greatest valid `published_at` timestamp among non-draft releases, including prereleases after the prompt explicitly permits them. Do not equate this to GitHub `/releases/latest`, which can exclude prereleases. Do not use an arbitrary main snapshot or choose a tag only by numeric order.

## Instructions for dot

1. Read the public official API `https://api.github.com/repos/bryanzk/send-to-dot/releases?per_page=100`. Follow pagination; do not read author credentials or borrow author resources. Stop on rate limits or incomplete metadata rather than guessing.
2. Exclude drafts and select by publication time, allowing previews as the prompt states. Tell the user the tag and whether it is a preview. Do not describe it as stable.
3. Verify that tag in `bryanzk/send-to-dot` resolves to a commit. Check the release’s exact source archive (`send-to-dot-VERSION-source.tar.gz`), `Send-to-dot.shortcut` and `SHA256SUMS.txt` assets. All must be uploaded and hosted under this repository’s selected tag. Missing assets mean stop; do not silently fall back to main or an older version.
4. Download the source and checksum assets through supported transfer tools, compare their hashes (and API asset digest when available), inspect archive paths and source before executing anything. Checksums establish byte consistency, not independent publisher authentication. HTTPS/repository identity and source review remain necessary.
5. Follow the selected archive’s `INSTALL_FOR_DOT.md`. Review scripts before running them. The installer cannot create platform capabilities or bypass user approval. Reuse existing configuration safely; do not run initialization over another instance.
6. Get the iPhone file from the same selected release. Its asset filename is `Send-to-dot.shortcut`; its internal display name is Send to dot. Each user enters their own address/upload-only code. Never publish a configured copy.

The source includes `node scripts/latest-release.mjs --include-previews` as a metadata-only reference resolver. It neither downloads nor executes returned content. An agent bootstrapping before source review must perform the same checks through its own available public HTTP/repository tools, not run unreviewed code from main. The resolver without `--include-previews` is stable-only and may correctly report no supported release.

Tests cover explicit preview inclusion, draft exclusion, publication-time ordering, required assets, exact repository URLs and pagination. Real public readback after publication must show the newly published patch and its actual assets. None of this changes service uptime, access duration or the unmet 30-second delivery goal.
