# Keep files UTF-8 (owner, 13 Nov 2026)

Windows PowerShell 5.1 `Get-Content` / `Set-Content` use the ANSI code page, so saving a file with them turns emoji and symbols
(`📝 · — ₹ ▸`) and Hindi into `?` or garbage. On 13 Nov this garbled a Telegram message and 39 Hindi strings.

- Edit files with the editor tools (`str_replace`, `fs_write`), never `Set-Content` / `Out-File` / `>` in PowerShell.
- If a script must write text, use Node (`fs.writeFileSync(f, s, 'utf8')`) or `[IO.File]::WriteAllText(path, text, [Text.UTF8Encoding]::new($false))`.
- Before sending anything to Telegram, read the exact text back (render it to a file and open it, or read the run log saved with `cmd /c "gh run view ... > file"`, not through PowerShell's pipe, which decodes it wrongly).
