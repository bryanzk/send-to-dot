# Send to dot

**English** | [简体中文](README.zh-CN.md)

**Share a photo from your phone and continue your existing dot conversation.** Add an optional question; dot responds in context and posts the original image as an assistant attachment.

I built this because sharing a photo to ChatGPT kept opening a new chat. Finding the original conversation and uploading the photo again interrupted what I was doing. Send to dot receives only photos you choose to share. It does not scan your gallery or impersonate your messages.

## Start by asking your own dot

Send this to the dot conversation you want to keep using:

> Follow https://github.com/bryanzk/send-to-dot/blob/main/INSTALL_FOR_DOT.md to install Send to dot on my own Mac and connect it to this conversation. Check your actual tools and existing configuration first. Complete authorized steps yourself, and hand over when I must sign in, approve access or use my phone. Do not purchase resources or use the author's account, quota or credentials.

Read the [agent installation guide](INSTALL_FOR_DOT.md). Your dot needs permission and tools to operate **your own Mac**. A paid ChatGPT subscription alone does not guarantee dot access, custom-app access, event tools or native attachment tools. Missing capabilities must be reported at the relevant step.

This is an assisted installation entry, not a promise of zero-touch setup. You must provide a stable HTTPS address and complete your own ChatGPT authorization and phone steps. If you prefer help from a person, follow the [detailed setup guide](docs/QUICKSTART.md) or [Chinese beginner walkthrough](README.zh-CN.md).

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
4. Install and pair the Android web app, or add the [iPhone Shortcut](docs/IOS_CAPTION.md). Use a phone upload code, never the owner code. The current iPhone Shortcut saves the address but asks for the upload code on each send.
5. Share your service’s `/sample.png` with a short question. **Success means the same dot conversation shows the answer and original image attachment.** A phone “sent” message only confirms inbox receipt.

After this check, choose whether to send private photos. For everyday use: select one image, optionally write a question, send, then return to your dot.

## What still needs attention

Current authorization lasts **24 hours by default** and needs normal renewal or reauthorization. Restarting the Mac or reusing an expired code does not extend it. Keeping the service running does not renew authorization. Mac sleep, shutdown or lost network access interrupts delivery; temporary addresses are unsuitable for long-term use. See [configuration and expiry](docs/CONFIGURATION.md).

Reading an image through the connected app does not itself display a native chat attachment. Your dot also needs supported tools to save the original privately and send it as an assistant attachment. Missing tools require a handoff. No undocumented ChatGPT API or author account is supplied.

One real user environment completed Android and iPhone image-and-question sharing into the original dot conversation with assistant attachments. The revised Android page also received narrow-screen browser checks. **An independent second user's installation and long-term operation remain unverified.** See [validation](docs/VALIDATION.md) and the [release checklist](docs/RELEASE_CHECKLIST.md).

## Before sharing private images

- Check your own address. Images pass through your service and HTTPS entry before reaching ChatGPT.
- Original files may contain camera metadata.
- Inbox images and questions expire after one hour. Saved conversation attachments have a separate lifetime and must be deleted separately.
- Send one PNG or JPEG at a time, up to 8 MiB. HEIC, PDF, video and automatic gallery sync are unsupported.
- Keep passwords, owner codes, API keys and tunnel secrets out of chat, repositories and shared Shortcuts.

[Setup](docs/QUICKSTART.md) · [Troubleshooting](docs/TROUBLESHOOTING.md) · [Privacy and security](docs/THREAT_MODEL.md) · [Architecture](docs/ARCHITECTURE.md) · [Dependencies](docs/DEPENDENCIES.md)

## Source and license

The approved public repository address is [bryanzk/send-to-dot](https://github.com/bryanzk/send-to-dot). Licensed under [MIT](LICENSE), copyright (c) 2026 bryanzk. Third-party notices remain in [docs/licenses](docs/licenses) and the [dependency inventory](docs/DEPENDENCIES.md).
