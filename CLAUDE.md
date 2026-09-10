# CLAUDE.md — Oniums Blog

## Scope And Entry Points

- Read `README.md` for the current site layout, build commands, and publication boundaries.
- This repository owns public-ready technical articles in `source/_posts/`. Private notes are source material, not a replacement delivery location.
- This is a Hexo site task, not a firmware change. Do not apply product classification, firmware plan approval, hardware builds, mirror sync, or Jenkins gates to article work.
- Keep this file and `CLAUDE.md` aligned.

## Intent And Completion

- Standing authorization (2026-09-10): “写博客”, “写文章” or “整理成教程” defaults to preparing the article here, de-identifying it, verifying generated pages, then committing, pushing `main`, and verifying Pages plus the live article. Do not repeatedly ask for publication approval.
- “先看大纲” or an explicit request for review only: provide that reviewable result without expanding into a full article or publication.
- “发布到博客” or “推送上线”: after content/privacy checks, commit only the authorized source and its generated output, push the blog branch, and verify Pages plus the live article. Preserve any explicit narrower instruction.
- Explicit draft-only, outline-only, review-only or no-push requests override the standing publication authorization. If unrelated local commits or edits would be published, stop at that specific boundary and report it; do not publish them incidentally.
- In the final response, distinguish local draft, checks passed, committed, pushed, and live verification. Do not label a local build as published.

## Content And Verification

- Keep public content within the privacy boundaries in `README.md`. Do not copy raw work logs, confidential source material, credentials, device identifiers, or private filesystem links into public articles.
- Follow existing article frontmatter and lowercase English kebab-case filenames. Link related public posts; keep private-source provenance in the private source area when necessary.
- For site content, template, configuration, or build-tool changes, run `npm run prepare-pages`. It includes the full checks and controlled generated-output synchronization; do not run the same checks twice without a new reason.
- For changes confined to root instruction files or the repository README, review consistency, Markdown links, privacy, and the scoped diff. A full site rebuild is unnecessary because these are not article sources.
- Inspect the affected source and generated diff before publication. Never hand-edit generated HTML as a substitute for editing Hexo source.
- After an authorized push, verify the Pages build revision and live article. If verification fails, report the actual state rather than claiming completion.
- Do not automatically copy the full article back into a private knowledge base. Use a link or distinct private supporting notes when needed.
