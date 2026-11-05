# Send to dot

**English** | [简体中文](README.zh-CN.md)

**Share a photo and an optional question from your phone into your existing dot conversation.**

## Install with your own dot

Copy this whole message into the dot conversation you want to keep using:

```text
Install the newest published Send to dot release from the repository below, including preview releases. Tell me which version you chose. Download that release and follow the INSTALL_FOR_DOT.md inside it, rather than installing the main branch. Check the files before running them. Use my own Mac, accounts and service, and connect it to this conversation. Do the steps you can safely complete; ask me when I must sign in, approve access, choose costs or use my phone. Do not use the author's accounts, quota or credentials.

https://github.com/bryanzk/send-to-dot/releases
```

[Open published versions](https://github.com/bryanzk/send-to-dot/releases). Preview versions are included because this project is still being tested. Your dot must check which version was published most recently; GitHub’s “latest” shortcut can omit previews. [Version selection details](docs/LATEST_RELEASE.md).

This is guided setup, not a one-click or unattended install. Your dot needs tools and permission to operate your own Mac. You still provide an always-online Mac and a stable secure address, and complete your own account approval and phone steps.

### No Mac: deploy on Cloudflare (preview)

Copy this into your dot conversation instead if you do not want to keep a Mac running:

```text
Set up the newest published Send to dot release from the repository below on my own Cloudflare account, including preview releases, so no Mac is needed. Tell me which version you chose and follow the "Cloudflare path" in that release's INSTALL_FOR_DOT.md. Give me each step I must do myself (Cloudflare and GitHub sign-in, choosing my owner code, adding the ChatGPT app, phone setup) one at a time, then create the file.created task in this conversation and check it with a generated test image. Never ask me to paste my owner code, phone code or any token into chat.

https://github.com/bryanzk/send-to-dot/releases
```

You need a free Cloudflare account and a GitHub (or GitLab) account; deployment uses Cloudflare's “Deploy to Cloudflare” page on the free Workers plan. [Details](docs/CLOUDFLARE_DEPLOYMENT.md).

I built this because sharing a photo to ChatGPT kept opening a new chat. Finding the original conversation and uploading the photo again interrupted what I was doing. Send to dot receives only photos you choose to share. It does not scan your gallery or impersonate your messages. Originals appear as assistant attachments; answers can follow separately.

## What you need

- A ChatGPT account that already uses dot and permits connecting your own app.
- Your own Mac, kept awake, online and running the service.
- Your own stable HTTPS address and any required hosting or network access.
- Android with Chrome, or an iPhone with Shortcuts.

You pay for your own infrastructure and account usage. The core service does not call a model API and needs no OpenAI model API key. The project supplies no author credentials, hosting or quota. See [platform requirements](docs/PLATFORM_REQUIREMENTS.md).

## First-use checklist

1. Have dot follow the [installation guide](INSTALL_FOR_DOT.md), or prepare the service with the [manual guide](docs/QUICKSTART.md). Open your HTTPS address on your phone. **Continue only when the “Send to dot” page opens.**
2. Connect your own ChatGPT custom app to `https://YOUR-ADDRESS/mcp` using OAuth. Complete the owner approval yourself. **Continue only when ChatGPT shows the app is connected.** Keep the owner code out of chat.
3. In your existing dot conversation, ask it to connect the inbox, respond there and send each original as an assistant attachment. The [attachment guide](docs/ATTACHMENT_AUTOMATION.md) explains the required native tools. **A confirmed subscription and attachment setup are required; the request alone does not configure them.**
4. Install and pair the Android web app, or add the [iPhone Shortcut](docs/IOS_SETUP.md). Use a phone upload code, never the owner code. The signed Send to dot template configures the address and upload-only code once, then reuses them. The code is visible Text in your private Shortcut and may iCloud-sync or travel with exports; review the storage warning before saving it.
5. Share your service’s `/sample.png` with a short question. **Success means the same dot conversation shows the answer and original image attachment.** A phone “sent” message only confirms inbox receipt.

After this check, choose whether to send private photos. For everyday use: select one image, optionally write a question, send, then return to your dot.

**Speed:** delivery is asynchronous. A real recording failed the 30-second image-visible target. This release does not promise delivery within 30 seconds; do not repeatedly resend while waiting.

## What still needs attention

Newly issued upload and ChatGPT access grants last **30 days by default** and need normal renewal or reauthorization. Existing grants keep their old expiry; upgrading code does not extend a connection. Continuous operation over the full 30 days remains unverified. Restarting the Mac or reusing an expired code does not extend it. Keeping the service running does not renew authorization. The server still grants hourly event leases and respects a shorter client request; these leases refresh separately from the30-day access grant. Mac sleep, shutdown or lost network access interrupts delivery; temporary addresses are unsuitable for long-term use. See [configuration and expiry](docs/CONFIGURATION.md).

Reading an image through the connected app does not itself display a native chat attachment. Your dot also needs supported tools to save the original privately and send it as an assistant attachment. Missing tools require a handoff. No undocumented ChatGPT API or author account is supplied.

One real user environment completed Android and iPhone image-and-question sharing into the original dot conversation with assistant attachments. The Chinese Shortcut was used in a recorded iPhone send; uninterrupted 30-day use and repeated real-device reuse without setup prompts remain unverified. The revised Android page also received narrow-screen browser checks. **An independent second user's installation and long-term operation remain unverified.** See [validation](docs/VALIDATION.md) and the [release checklist](docs/RELEASE_CHECKLIST.md).

## Before sharing private images

- Check your own address. Images pass through your service and HTTPS entry before reaching ChatGPT.
- Original files may contain camera metadata.
- Inbox images and questions expire after one hour. Saved conversation attachments have a separate lifetime and must be deleted separately.
- Send one PNG or JPEG at a time, up to 8 MiB. HEIC, PDF, video and automatic gallery sync are unsupported.
- Keep passwords, owner codes, API keys and tunnel secrets out of chat, repositories and shared Shortcuts.

[Setup](docs/QUICKSTART.md) · [Troubleshooting](docs/TROUBLESHOOTING.md) · [Privacy and security](docs/THREAT_MODEL.md) · [Architecture](docs/ARCHITECTURE.md) · [Dot-native delivery (optional)](docs/DOT_NATIVE_DELIVERY.md) · [Cloudflare deployment, no Mac (optional)](docs/CLOUDFLARE_DEPLOYMENT.md) · [Dependencies](docs/DEPENDENCIES.md)

## Source and license

The approved public repository address is [bryanzk/send-to-dot](https://github.com/bryanzk/send-to-dot). Licensed under [MIT](LICENSE), copyright (c) 2026 bryanzk. Third-party notices remain in [docs/licenses](docs/licenses) and the [dependency inventory](docs/DEPENDENCIES.md).
