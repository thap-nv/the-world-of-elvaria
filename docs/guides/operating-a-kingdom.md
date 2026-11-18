# Vận hành vương quốc

Hướng dẫn cho chủ nhân: chạy một vương quốc Elvaria hằng ngày, từ lúc cài tới lúc đóng dấu, và làm gì khi có chuyện. Viết khi đóng giai đoạn 1 (P1-51, 2026-11-12) từ ba lần chạy thật trên Windows 11: [quest đầu tiên](first-quest.md) (P1-11), [mốc giai đoạn 1](phase-1-report.md) (P1-16) và [lần chạy lại mốc](phase-1-rerun.md) (P1-50: 24 quest, 92 lượt, 26 lần chủ nhân can thiệp). Mọi lệnh và tùy chọn: [docs/cli.md](../cli.md). Viết luật cho một lãnh thổ (check, lệnh, đường dẫn cấm): [first-quest.md](first-quest.md) §4.

Giai đoạn 1 chỉ có dòng lệnh. Elvaria không push, không merge: nhánh của quest nằm trong repo của bạn, bạn đọc rồi merge như một PR. macOS chưa có lần chạy thật nào (chỉ có CI).

## 1. Một quest từ đầu tới dấu vua

Mười bước, mỗi bước giải thích ở mục ghi trong ngoặc. Các lệnh viết cho **Git Bash**; trong PowerShell, đặt biến bằng `$env:ELVARIA_KINGDOM = "…"` và viết lệnh dài trên một dòng. `elvaria` ở đây là `node "<checkout chính>/apps/cli/dist/cli.js"`: đặt `alias elvaria='node "<checkout chính>/apps/cli/dist/cli.js"'`, hoặc gõ đủ.

```bash
# 1. Bản build (§2): một bản clone của repo Elvaria (repo chứa tài liệu này), ở nhánh main
cd "<checkout chính của Elvaria>" && pnpm install --frozen-lockfile
pnpm --filter @elvaria/hooks build && pnpm --filter @elvaria/cli build

# 2. Vương quốc, một thư mục mới nằm ngoài mọi repo; init tạo nó (§3)
export ELVARIA_KINGDOM="<thư mục vương quốc>"
elvaria init --name Elvaria
elvaria tribe disable gemini        # khi chưa dùng Antigravity; dùng thì xem §3
elvaria doctor                      # lần đầu: tìm CLI của từng tộc và ghim; đọc từng dòng lỗi

# 3. Lãnh thổ: một repo git của bạn (§3)
elvaria territory add "<thư mục repo>" --branch main   # in id của lãnh thổ; --branch: nhánh mà nhánh quest tách ra
#    rồi điền commands, checks, laws trong <vương quốc>/territories/<id>/territory.json (mẫu ở §3)
elvaria territory check <id>         # thẻ điểm (PS-25): thử setup và mọi check trên đất sạch, 0 mana; sửa tới khi
                                     # mục thử khởi đầu đạt (§3, "Thẻ điểm lãnh thổ")

# 4. Nhân vật: một người làm, một người chấm khác model (§3)
elvaria character add thorn --class knight      # mặc định của nghề: tộc claude, claude-sonnet-5-5
elvaria character add vesper --class judge      # mặc định của nghề: tộc claude, claude-opus-5-5
elvaria doctor                                  # phải in "Sẵn sàng." (bản en: "Ready.")
elvaria upgrade                                 # dựng, thử và ghim bản main; từ đây mọi lệnh chạy bằng nó (§13)

# 5. Nhiếp chính: giao việc, mở phiên, chạy check, mở người chấm (§5)
elvaria run                          # trong một terminal riêng; để chạy; Ctrl+C để dừng

# 6. Nhiệm vụ, ở terminal thứ hai (đặt lại ELVARIA_KINGDOM và alias ở đó) (§4)
elvaria quest add --territory <id> --kind build --rank E --class knight \
  --title "…" --description "…"
elvaria quest list                   # sau một nhịp: quest hiện ra kèm id của nó (q_<ngày>_<6 ký tự>)

# 7. Theo dõi, 0 mana (§6)
elvaria quest show <quest>

# 8. Quest tới "Chờ dấu vua": đọc nhánh quest/<quest> trong repo, rồi (§7)
elvaria seal <quest> --note "…"      # --note của seal là tùy chọn
#    hoặc: elvaria return <quest> --note "sai gì, ở đâu, ít nhất 20 ký tự" --fail-kind incomplete

# 9. Giao hàng: bạn push và merge (§7)
git -C "<repo>/.elvaria/worktrees/<quest>" push -u origin quest/<quest>
#    mở PR, mô tả lấy từ <vương quốc>/.runs/<quest>-delivery.md, merge
#    repo không có remote: git -C "<repo>" merge --no-ff quest/<quest>

# 10. Trả đất (§7)
elvaria quest archive <quest>        # Nhiếp chính gỡ worktree ở nhịp kế; nó không chạy thì lệnh chờ trong inbox/
```

Kind `build` mặc định cần dấu vua. Quest không cần dấu thì tới `Xong` ngay sau khi người chấm cho đạt. Mọi lệnh đổi một quest (`quest add`, `edit`, `seal`, `archive`…) chỉ ghi một lệnh vào `inbox/`; Nhiếp chính áp nó ở nhịp kế, nên quest và id của nó chỉ có sau khi Nhiếp chính đã chạy qua một nhịp.

## 2. Máy và bản build

- **Cần có**: Node 24, pnpm 10, git; Claude Code đã đăng nhập (binary đi kèm extension VS Code là đủ, `doctor` tự tìm); với tộc gemini, Antigravity CLI (`agy`) đã đăng nhập. Phiên bản đang dùng và mọi dữ kiện về hai CLI: [cli-facts-2026-11-12.md](../reference/cli-facts-2026-11-12.md).
- **Nhiếp chính chạy từ bản build của một checkout ở `main`** (gọi là checkout chính: bản clone của repo Elvaria mà bạn không sửa code trong đó), không từ một nhánh đang sửa. Mọi phiên gọi hook theo đường dẫn tuyệt đối tới `packages/hooks/dist/elvaria-hook.js` của checkout đó, nên chưa build hook thì `doctor` báo lỗi và không phiên nào chạy được. `pnpm elvaria <lệnh>` trong repo chạy thẳng mã nguồn, không cần build CLI: tiện cho lệnh chỉ đọc và cho người đang phát triển Elvaria; nó vẫn cần hook đã build.
- **Bản ghim (từ PS-04b)**: `elvaria upgrade` dựng `main` thành một bản riêng trong `<vương quốc>/.builds/<sha>/`, thử nó rồi ghim; từ đó mọi lệnh trên vương quốc chạy bằng bản ghim, kể cả hook của các phiên, và checkout chính chỉ còn là lối vào (§13). `pnpm elvaria <lệnh>` từ một nhánh đang sửa cũng chạy bằng bản ghim; thêm `--here` để chạy bằng chính mã của nhánh.
- **Windows**:
  - Chạy `elvaria run` từ **Git Bash** khi check của lãnh thổ gọi `sh` (PATH của PowerShell không có `Git\usr\bin`).
  - Hiệp sĩ tộc gemini chạy lệnh trong PowerShell: cần `Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned` thì mới chạy được `pnpm`; `doctor` kiểm điều này.
  - Trong PowerShell 5.1, dấu `"` nằm trong một đối số bị cắt khi truyền cho `node`: gõ lệnh có mô tả dài trong Git Bash.
- **Docker**: lãnh thổ nào có check hay `commands.reset` gọi `docker` thì Docker Desktop phải chạy **trước** Nhiếp chính. `doctor` kiểm điều này (từ P1-56): daemon không trả lời thì nó cảnh báo (không chặn), nêu các lệnh dùng docker; tự kiểm bằng `docker info`.
- **Đăng nhập có hạn**: `claude auth status --json` cho `loginExpiresAt`; `doctor` cảnh báo khi còn dưới 7 ngày. Gần hạn thì `claude auth login`.

## 3. Vương quốc, tộc, lãnh thổ, nhân vật

Thư mục vương quốc là trạng thái của bạn, nằm ngoài mọi repo. Biến `ELVARIA_KINGDOM` thay cho `--kingdom` ở mọi lệnh.

| Trong vương quốc | Là gì | Ai ghi |
|---|---|---|
| `kingdom.json` | tộc, CLI đã ghim, `dispatch`, `mana`, `breakers` | `init`, `doctor`, `tribe …`; bạn sửa tay phần cấu hình (§12) |
| `territories/<id>/territory.json` | lệnh, check, luật của lãnh thổ | `territory add` tạo, bạn điền |
| `territories/<id>/gazetteer.md` | điều nhân vật cần biết về lãnh thổ | bạn (§11) |
| `characters/<id>/character.json`, `quests/<id>.json` | nhân vật, nhiệm vụ | `character add` tạo file nhân vật; sau đó **chỉ Nhiếp chính** ghi; bạn đổi bằng lệnh, không sửa tay |
| `quests/<id>/handover.md`, `journal.jsonl` | thư bàn giao, nhật ký từng lần dùng tool | nhân vật, hook |
| `verdicts/`, `events/<ngày>.jsonl` | phán quyết, event log | Nhiếp chính, hook |
| `memos/` | thư nhân vật viết về việc ngoài quest của mình (PS-02) | Nhiếp chính; bạn quyết bằng `elvaria memo decide` |
| `registry/` | dạng nhiệm vụ, nghề, nghi thức, script, tag, `prompts/<nghề>.md` | `init`, `migrate`; bạn sửa được |
| `temple/scripture.md`, `characters/<id>/scripture.md`, `decree.md` | kinh và chiếu chỉ (§11) | bạn |
| `inbox/` | lệnh của bạn chờ Nhiếp chính áp | CLI |
| `.runs/<quest>-<n>/` | prompt, settings, stdout, log check của từng lượt; `.runs/<quest>-delivery.md` | runner, Nhiếp chính |
| `.state/` | khóa của Nhiếp chính, pid các phiên, quest không ai nhận được | Nhiếp chính |
| `.backup/` | bản sao trước mỗi lần `migrate` và mỗi lần bạn sửa tay | `migrate`, bạn |

**Tộc.** `init` tạo hai tộc, cả hai bật: `claude` (Claude Code) và `gemini` (agy, pool `claude_gpt_models` tắt). Lần `doctor` đầu tìm CLI của từng tộc đang bật và ghim đường dẫn cùng phiên bản vào `kingdom.json`; `--pin` chỉ cần về sau, khi bản tìm thấy khác bản đã ghim (§8). Một tộc đang bật mà thiếu CLI hay chưa đăng nhập là lỗi của `doctor`:

- Chưa dùng Antigravity: `elvaria tribe disable gemini`.
- Dùng Antigravity: cài và đăng nhập agy, rồi `elvaria doctor --acknowledge-terms gemini` để ghi nhận điều khoản của nó (ADR 0018, rủi ro ở [cli-facts](../reference/cli-facts-2026-11-12.md) §2.1).
- Bật lại một tộc đã tắt: `elvaria doctor --enable <tộc>` (chỉ bật khi lần đó tộc không có lỗi nào).
- Thêm tài khoản thứ hai của cùng một CLI (`claude_2` hay `codex_2`, thư mục cấu hình riêng, PS-27, PS-27c): [adding-a-tribe.md](adding-a-tribe.md) mục 3.1.

`elvaria tribe list` in mỗi tộc một dòng. `tribes[].max_concurrent` là số phiên một tài khoản chạy cùng lúc (mặc định claude 2, gemini 1).

Mỗi tộc có một ngoại hình (PS-24): `claude` là Sao Bạc, `gemini` là Lửa Đỏ (mục ghim của theme); tộc thêm sau có ngay một ngoại hình tự sinh theo id, khác mọi tộc đã có. `elvaria tribe look <tộc>` in nó cùng các bảng màu và huy hiệu còn trống; muốn đổi thì `elvaria tribe look <tộc> --palette <id> --crest <id> --name "<tên>"` (phần nào không nêu giữ như đang có), `--reset` để quay về ngoại hình của theme. Ngoại hình chỉ để hiển thị: không đổi việc ai làm hay ai chấm.

**Lãnh thổ.** `territory add` chỉ ghi phần nhận ra được từ git (`id`, `name`, `path`, `vcs`); `commands`, `checks` và `laws` đều tùy chọn và do bạn điền, theo CLAUDE.md và CI của repo. Không có `checks` thì quest vẫn chạy, chỉ có người chấm xét. Mẫu tối thiểu cho một repo pnpm (thêm vào file `territory add` đã tạo; cách viết luật đầy đủ ở [first-quest.md](first-quest.md) §4, schema ở [territory.schema.json](../schemas/territory.schema.json)):

```json
{
  "commands": { "setup": "pnpm install --frozen-lockfile --prefer-offline" },
  "checks": [
    { "id": "lint", "run": "pnpm lint", "when": ["**/*.ts"], "timeout_minutes": 15 },
    { "id": "test", "run": "pnpm test", "when": ["src/**", "package.json"], "timeout_minutes": 30 }
  ],
  "laws": {
    "forbidden_paths": [".env", ".env.*"],
    "forbidden_commands": ["git\\s+(-C\\s+\\S+\\s+)?push", "--no-verify"]
  }
}
```

- Mọi trường của mẫu nằm ở cấp cao nhất của file, cạnh `id`, `name`, `path`, `vcs` (nhánh của `--branch` ở `vcs.default_branch`). Sửa glob `when` cho đúng bố cục repo của bạn: check không khớp file nào quest chạm thì không chạy.
- `commands.setup` chạy một lần trong mỗi đất riêng mới (worktree chưa có `node_modules`). `commands.reset` (tùy chọn) đưa DB và container về sạch trước mỗi lần máy chạy check trong đất nháp của người chấm; lệnh và check chạy tại gốc đất riêng.
- Một check gồm `id`, `run` (một lệnh, hoặc một danh sách lệnh chạy lần lượt, không qua shell), `when` (glob: check chỉ chạy khi quest chạm file khớp) và `timeout_minutes`; thêm `"exclusive": true` cho check dùng tài nguyên chung (một stack Docker).
- `laws.forbidden_paths` là glob nhân vật không được đọc hay ghi; `forbidden_commands` là regex trên dòng lệnh shell; `read_only_paths` cho file sinh; `patch_paths` cho đường dẫn Claude Code tự khóa: repo có `.claude/rules/**` mà bạn muốn nhân vật sửa được thì thêm glob đó vào đây, không thì nhân vật dừng lại hỏi bạn.
- `max_concurrent` của lãnh thổ mặc định 1: mỗi lúc một quest đang làm.
- Đất riêng của quest nằm ở `<repo>/.elvaria/worktrees/<quest>`; Elvaria tự thêm nó vào `.git/info/exclude`. ESLint và Prettier chạy ở gốc repo vẫn quét thư mục đó, trừ khi repo bỏ qua `.elvaria/`.
- **Check chụp ảnh của lãnh thổ** (PS-11b). Quest mang tag `visual` được chấm bằng mắt (nghi thức `visual_review`): người chấm đọc ảnh chụp màn hình do check của lãnh thổ sinh ra. Mọi check nhận biến môi trường `ELVARIA_SCREENS_DIR`, là thư mục `.runs/<quest>-<n>/screens/` của lượt chạy, nằm ngoài đất của quest; Nhiếp chính làm rỗng nó trước mỗi lượt check. Check muốn người chấm xem gì thì ghi PNG vào đó: `<tên>.png` là ảnh chụp, `<tên>.ref.png` là ảnh tham chiếu cùng tên (tùy chọn), `<tên>.diff.png` là ảnh so khác (tùy chọn), tên viết `kebab-case`. Lõi không biết thiết kế nằm ở đâu, nên check tự đưa ảnh tham chiếu (dựng từ mockup lúc chạy, hoặc chép từ ảnh đã lưu trong repo). Trần của một lượt chấm là 12 ảnh, mỗi ảnh tối đa 2 MiB, chỉ PNG; nên chụp tối đa 2000 px mỗi cạnh. Sau các check của lãnh thổ, Nhiếp chính chạy check của máy `screens`: nó đỏ khi không có ảnh chụp nào hay có ảnh sai hợp đồng, và quest bị trả kèm log nói lý do (thường là không check nào ghi vào `ELVARIA_SCREENS_DIR`, hoặc `when` của check chụp ảnh không khớp file quest đã sửa). Người chấm chỉ được mở đúng các ảnh của lượt mình, bằng tool đọc file của CLI; ảnh không nằm trong prompt. Ảnh ở lại `.runs/` làm bằng chứng của lượt chấm. Ảnh là tệp nhị phân, không đi qua `redact`: **check không được chụp màn hình có secret**. Chỉ gắn `visual` khi lãnh thổ đã có check chụp ảnh và dàn nhân vật có người chấm thuộc tộc đọc được ảnh (từ PS-11b cả ba tộc Claude, Gemini, Codex đều đọc được).
- Quest xin secret (`secrets_allowed` của lãnh thổ) thì giá trị nằm trong kho bảo vật, một file JSON `{ "tên": "giá trị" }` ngoài vương quốc (mặc định `~/.elvaria/treasury.json`, đổi bằng `init --treasury`); bạn sửa tay file đó, `doctor` kiểm tên, không bao giờ in giá trị.

**Thẻ điểm lãnh thổ** (PS-25). Chạy `elvaria territory check <id>` sau khi điền `territory.json` và trước quest đầu tiên, rồi mỗi lần đổi `commands.setup` hay check. Lệnh dựng một đất sạch tách rời (`<repo>/.elvaria/worktrees/trial-<id>`, không tạo nhánh) ở đầu nhánh gốc, như đất của một quest mới, chạy `commands.setup` rồi **mọi** check của lãnh thổ như Nhiếp chính chạy chúng, xóa đất, rồi in thẻ điểm: mỗi mục ✓ đạt, ✗ không đạt hay — chưa đo được, kèm lý do. 0 mana, không ghi trạng thái quest; log ở `.runs/trial-<id>-setup.log` và `.runs/trial-<id>/checks/`. Mã thoát khác 0 khi mục thử khởi đầu không đạt; các mục khác chỉ để biết nên sửa gì. Ctrl+C dừng lệnh đang chạy, đất vẫn được xóa và kết quả không được ghi. Lần thử không nhận secret nào của kho bảo vật: setup cần một secret sẽ hỏng ở đây. Kết quả gần nhất nằm ở `.state/territory-trials/<id>.json`; `doctor` cảnh báo lãnh thổ git chưa thử, thử không đạt, hay đã đổi setup hoặc check từ lần thử. Khi lần thử đã đạt, `doctor` chỉ lấy hai mục từ lần thử đó (thử khởi đầu, thời gian từng check) và tính lại bốn mục kia mỗi lần chạy, từ file của vương quốc, sổ đo và git (số commit từ dấu của địa chí tới đầu nhánh gốc theo lần fetch gần nhất, không fetch): dưới dòng của lãnh thổ là "Từ lần thử đó: …", "Tính lúc này: …" và lý do của từng mục tính lúc này chưa đạt. Sửa địa chí hay khai `shared_paths`, `protected_paths` thì chạy lại `doctor`, không cần `territory check` (lần thử đầy đủ khoảng 15 phút với dc1); chỉ khi đổi `commands.setup` hay check, hoặc mục thời gian không đạt, mới cần thử lại.

| Mục | Đạt khi | Sửa thế nào |
|---|---|---|
| Thử khởi đầu | `commands.setup` thoát 0 và mọi check xanh ở nhánh gốc | thẻ nêu lệnh hỏng, dòng lỗi đầu và log. Setup chỉ cài mà check cần bản build (A5 của bài học 2026-11-12: `@dc1/shared` chưa build) thì cho setup gọi một script cài rồi build. Check đỏ ở nhánh gốc thì sửa nhánh gốc trước: mọi quest sẽ trượt cùng chỗ đó. Dòng lỗi khớp `environment_errors` (Docker chưa chạy) thì bật Docker rồi chạy lại |
| Thời gian từng check | mỗi check xong trong một nửa `timeout_minutes` của nó | máy bận lúc có quest thì check chậm hơn lúc thử: nâng `timeout_minutes`, hoặc tách phần chậm thành check `exclusive` hay `defer_to_merge` |
| Lượt check bị gạt vì môi trường | không quá 10 % lượt check của lãnh thổ (cần ít nhất 3 lượt) | thường là Docker hay stack dùng chung: xem §14, `dispatch.max_background: 1` |
| Địa chí | `territories/<id>/gazetteer.md` có; dòng đầu là `<!-- elvaria:commit <sha> -->` của commit lúc viết, chưa quá 100 commit từ đó; nêu mọi lệnh mà phiên gặp (`commands.setup`, `test`, `lint`, `typecheck`, `build`, từng lệnh `generate`, `run` của từng check) | thẻ nêu lệnh còn thiếu. Lệnh nêu nguyên dòng, hoặc phần trước tùy chọn đầu tiên khi phần đó có từ hai chữ (`pnpm install` cho `pnpm install --frozen-lockfile`); check nhiều lệnh thì nêu một lệnh là đủ. Đọc lại địa chí rồi đặt dấu commit mới khi nó cũ |
| `shared_paths` và `protected_paths` | cả hai đã khai, danh sách rỗng cũng tính | khai file nóng mọi nhánh cùng sửa (§4, [elvaria-territory.md](elvaria-territory.md)) và thứ canh giữ thế giới (§7); không có thì khai `[]` |
| Đạt lượt đầu | ít nhất một nửa quest của lãnh thổ đạt ở lượt đầu (cần ít nhất 3 quest có phán quyết) | xem `elvaria metrics` theo nghề, dạng và lãnh thổ; thường là địa chí, setup hay check còn thiếu ở các mục trên |

Hai mục cuối và mục check bị gạt lấy từ sổ đo, nên lãnh thổ mới chưa có quest thì chúng là "—". Ngưỡng là hằng số có tên trong `packages/domain/src/scorecard/constants.ts`.

**Phép thử khởi động nguội** (tùy chọn, **tốn mana**, bạn tự giao khi muốn): xem địa chí và repo có đủ cho một nhân vật mới không. Giao một quest `research` hạng thấp cho trinh sát, chỉ đọc; câu nào trinh sát không trả lời được, hay trả lời sai, là chỗ địa chí còn thiếu:

```bash
elvaria quest add --territory <id> --kind research --rank E --class scout \
  --title "Khởi động nguội: đọc lãnh thổ <id> như người mới" \
  --description "Chỉ đọc gazetteer của lãnh thổ và repo; không sửa file nào ngoài bản báo cáo của quest. Trả lời năm câu, mỗi câu kèm file và dòng làm căn cứ: (1) Hệ thống này là gì, cho ai? (2) Code tổ chức ra sao: thư mục chính và vai của từng thư mục. (3) Chạy nó thế nào trên máy: cài đặt, build, chạy. (4) Kiểm nó thế nào: lệnh lint, test, các check của lãnh thổ và khi nào mỗi check chạy. (5) Nó đang tới đâu: việc gần nhất, việc đang dở, chỗ còn thiếu. Câu nào gazetteer không giúp trả lời được thì ghi rõ 'gazetteer không nói'."
```

**Nhân vật.** `character add <id> --class <nghề>` lấy tộc và model mặc định của nghề; đổi bằng `--tribe <tộc>` và `--model <model>`. Model là tên mà CLI của tộc nhận: tộc claude có `claude-opus-5-5`, `claude-sonnet-5-5`, `claude-haiku-5-5`; tộc gemini lấy slug của `agy models`, ví dụ `gemini-3.8-flash-high`, `gemini-4-argon-medium`. Cấp ban đầu lấy theo model (Opus 5, Sonnet hay Pro 4, Argon 3, Haiku hay Flash 2; `--level` để đặt khác); cấp quyết định hạng cao nhất nhân vật nhận (cấp 2 tới E, 3 tới D, 4–5 tới C, 6–7 tới B).

Luật tách vai: người chấm là một nhân vật khác người làm, chạy **model khác** (`dispatch.verifier_same_family: different_model`: Sonnet chấm Opus được, Opus chấm Opus thì không); trong số người chấm hợp lệ, Nhiếp chính ưu tiên người khác họ model (một model Gemini chấm việc của một model Claude). Vì vậy **mỗi model người làm cần ít nhất một người chấm khác model, tốt nhất là hai, trên hai đồng hồ mana khác nhau** (§9): ở P1-50, khi trần Argon đóng, bài của hai nhân vật Opus không còn ai chấm vì người chấm còn lại cũng là Opus, và phải 50 phút sau mới có người thấy. Muốn soạn nhiệm vụ bằng lời (`elvaria say`) thì cần một nhân vật nghề `chancellor`. Giữ Tể tướng ở tộc Claude: Tể tướng trên tộc Codex soạn quest bậc script không có tham số, vì structured output chặt của Codex đóng `script.params` (object không khai trường) thành `{}` (`strictSchemaOf` của `runner-codex`; mục (46) của §11 ngày 2026-11-14). Vương quốc có thêm một Tể tướng tộc Codex thì nó soạn thay khi tộc của Tể tướng chính bị giữ (§8): đọc kỹ bản nháp bậc script của nó, và ra quest bậc script cần tham số bằng `elvaria quest add --script <id> --params '<json>'`.

## 4. Ra nhiệm vụ

- **`elvaria quest add`** gửi lệnh tạo một quest mở ngay, không qua nháp; Nhiếp chính tạo nó ở nhịp kế (Nhiếp chính chưa chạy thì lệnh chờ trong `inbox/`), rồi `quest list` mới thấy nó và id của nó. Bắt buộc: `--title`, `--description`, `--kind` (theo `registry/kinds.json`: `build`, `fix`, `document`…), `--rank` (F tới S), `--territory`; `--class` là nghề được nhận, cần khi dạng nhiệm vụ cho hơn một nghề (như `build`). `--to <nhân vật>` giao thẳng; `--contract` mở một đội (pháp sư viết hợp đồng, chia phần, Nhiếp chính thêm quest ghép); `--script <id>` chạy bậc script, 0 mana.
- **Vùng file** (PS-05): `--scope <glob>` (lặp lại; `quest edit --scope` thay cả vùng) khai các file quest sẽ sửa. Hai quest có vùng giao nhau không bao giờ làm cùng lúc trên một lãnh thổ, quest không khai vùng chạy một mình ở đó; nhờ vậy lãnh thổ code nâng được `max_concurrent`. File mà mọi nhánh cùng sửa thì đặt ở `territory.shared_paths`, không ở vùng của quest. Luật, cách khai và danh sách của lãnh thổ Elvaria: [elvaria-territory.md](elvaria-territory.md).
- **`elvaria say "<lời>"`** (tốn mana, khoảng 15 giây): Tể tướng soạn quest **nháp**; đọc bằng `quest show`, sửa bằng `quest edit`, mở bằng `elvaria quest confirm <quest>`. Bài học của P1-50 khi nói với Tể tướng:
  - Lời không nhắc dấu thì nhiệm vụ lấy dấu mặc định của dạng nó (từ PS-06; trước đó bản nháp có thể tắt dấu). Muốn khác thì nói rõ ("Cần dấu vua trước khi xong").
  - Tể tướng không thấy file: nó ước lượng 70 nghìn token cho việc đọc một file 1 MB. Từ PS-06 nó ước lượng theo số lượt nhân cỡ ngữ cảnh và chia việc theo ngữ cảnh đỉnh, nhưng vẫn chưa đọc cỡ file (PS-21b): việc chạm nhiều file hay file lớn thì nêu đường dẫn và cỡ trong lời, hoặc nâng trần trước khi xác nhận.
  - Thư ký và trinh sát không có Bash: từ PS-06 Tể tướng thấy tool của từng nghề và không giao bước cần shell cho nghề không có; bản nháp vẫn nên được đọc trước khi xác nhận.
  - **Việc lớn đi qua Nghị hội** (PS-06): việc từ hạng B, hay mang hai tag trên hai vùng (`kingdom.dispatch.council`), thành một **tấu trình** (mục tiêu, ngoài phạm vi, ví dụ chấp nhận, giả định, mọi câu hỏi kèm phương án đề xuất) và một quest kế hoạch cho pháp sư; `say` in tấu trình. `quest confirm` quest kế hoạch là nhận các phương án đề xuất; muốn trả lời khác thì nói lại với Tể tướng và `quest cancel` bản nháp. Pháp sư khảo sát, viết `plans/<chủ đề>.md` (mục `## Summary` là trang để bạn đọc khi đóng dấu) và `subquests.json`; máy kiểm vùng, chồng vùng và mẫu đề bài của từng phần, người chấm khác họ model kiểm phần còn lại (bước `check_plan_ready`), rồi kế hoạch chờ **một** dấu vua của bạn trước khi các phần mở.
  - Mọi quest do Tể tướng và pháp sư soạn theo **mẫu đề bài**: `## Goal`, `## Steps`, `## Files`, `## Done when`, `## Do not touch`, `## Known traps`; hạng F tới D có các bước đánh số. Bản nháp sai mẫu được trả lại Tể tướng một lần, rồi bị loại kèm lý do. Quest bạn tự viết bằng `quest add` không bị kiểm.
- **Trần của một lượt** (`quest show` in ra; đổi bằng `quest edit`): phút 45 (từ hạng B: 120), số lượt thử 3, token theo hạng: F–D 240 nghìn, C và B 480 nghìn, A 600 nghìn, S 720 nghìn; người chấm được gấp đôi. Số đo của P1-50 trên một repo web nhiều file: bốn quest hạng D đều vượt 240 nghìn ngay lượt đầu, hạng C và B vượt 480 nghìn ở 4 trong 6 phiên; với 400 nghìn (D) và 720 nghìn (C, B) thì mọi lượt xong trong trần. P1-54 xem lại bảng này; tới lúc đó, nâng trần ngay khi quest đã có id (quest nháp: trước khi xác nhận; quest của `quest add`: ngay sau khi nó hiện trong `quest list`, kể cả lúc phiên đang chạy, vì cầu dao đọc trần token của quest ở mỗi nhịp):

```bash
elvaria quest edit <quest> --max-tokens 720000
```

## 5. Chạy Nhiếp chính

```bash
elvaria run        # một vương quốc một Nhiếp chính (.state/steward.lock); lần chạy thứ hai bị từ chối
```

Mỗi nhịp 5 giây Nhiếp chính áp lệnh trong `inbox/`, giao quest, dựng đất riêng (worktree `<repo>/.elvaria/worktrees/<quest>`, nhánh `quest/<quest>`, chạy `commands.setup`), mở phiên người làm; phiên xong thì commit, chạy check ngoài nhịp (tối đa `dispatch.max_background` việc cùng lúc, mặc định 2), rồi mở người chấm. Chuông in trên terminal đó: quest chờ dấu, câu hỏi của nhân vật, quest vào trạm quân y, quest không nhân vật nào nhận được, quest mà dàn nhân vật không có người chấm hợp lệ nào, đồng hồ mana cảnh báo, ngủ, thức. (Có người chấm hợp lệ nhưng ai cũng đang bị một đồng hồ mana chặn thì **không** có chuông, §9.)

**Nhiếp chính là một tiến trình của terminal đã mở nó.** Đóng terminal, đóng hay khởi động lại VS Code (terminal tích hợp, hoặc phiên Claude Code đã chạy lệnh), máy ngủ hay khởi động lại thì Nhiếp chính dừng, và việc đứng yên cho tới khi bạn chạy lại. Muốn nó sống qua lần khởi động lại VS Code thì chạy nó trong một cửa sổ terminal riêng.

**Dừng**: Ctrl+C. Khi nó chạy nền không có terminal: tìm pid của tiến trình `node … cli.js run` (Task Manager, hay `Get-Process node`), rồi `taskkill /PID <pid> /T /F` trên Windows (cả cây tiến trình); trên macOS `kill <pid>` (chưa có lần chạy thật). Với bản ghim có hai tiến trình: lối vào `node …/dist/cli.js run` và con của nó, `node <vương quốc>/.builds/<sha>/apps/cli/src/cli.ts run`; Ctrl+C tới cả hai và lối vào chờ con dừng xong, `taskkill /T` trên lối vào giết cả cây, `kill` trên macOS được lối vào chuyển cho con. Dừng lúc không có phiên nào chạy (`.state/sessions.json` rỗng) thì không mất gì ngoài check đang chạy.

**Dừng lúc yên** (trước `upgrade`, khi chạm một mốc mana bạn tự đặt, hay trước khi đổi máy), để không mất cả phút check đang chạy:

1. Chờ tới khi `.state/sessions.json` có `"sessions": []` và không check nào đang chạy: trong `events/<ngày>.jsonl`, dòng `check.start` cuối của mỗi quest đã có `check.end` theo sau.
2. Dừng như trên (Ctrl+C, hay `taskkill /PID <pid> /T /F` trên lối vào).
3. `elvaria doctor`: không còn phiên sót, "Sẵn sàng.".
4. Làm việc cần làm (sao lưu, `upgrade`, sửa cấu hình theo §12).
5. `elvaria doctor` lại, rồi `elvaria run`.

**Trước một lần chạy có kiểm soát** (thử bản build mới, đo một quest, chạy lại sau nhiều giờ dừng): khi lên, Nhiếp chính chạy bù ngay mọi việc trong `kingdom.schedule` đã tới giờ mà hôm nay chưa chạy (§6: tuần tra `patrol.at`, mặc định 06:30; phân loại thư `triage.at`, 07:30; bản tấu `digest.at`, 08:00). Phân loại thư mở một phiên Tể tướng (tốn mana) cho các thư đang chờ, và quyết định nằm trong `kingdom.delegation` được áp luôn: quest mới được mở và giao ngay, chen vào việc bạn định chạy. Lần chạy thật (J) của PS-08d (2026-11-17), Nhiếp chính lên lúc 17:27, phân loại của 07:30 chạy bù lúc 17:36 và theo ủy quyền mở ba quest code. Trước `elvaria run`:

1. Đọc `schedule` trong `kingdom.json`: việc nào bật, giờ nào; hôm nay việc nào đã chạy thì có dòng `schedule.ran` mang `job` của nó trong `events/<ngày>.jsonl`.
2. `elvaria memo list`: các thư đang chờ, đầu vào của phân loại thư (không có thư thì phân loại không gọi model).
3. Không muốn việc theo lịch chen vào: quyết trước các thư (`elvaria memo decide`), hay tắt tạm việc đó trong `kingdom.json` (`"triage": {"enabled": false}`, sửa theo §12) rồi bật lại sau lần chạy. `elvaria run` không có cờ hoãn lịch.

**Chạy lại sau khi dừng hay sập** (P1-50 gặp năm lần, không mất quest hay lượt thử nào):

1. `docker info` trả lời, nếu lãnh thổ cần Docker.
2. `elvaria doctor`: in "Sẵn sàng."; khi không Nhiếp chính nào giữ khóa, nó liệt kê phiên còn sót của lần trước.
3. `elvaria run`: nó giết các phiên còn sót, trả lượt cho người làm đang dở (phiên mới từ thư bàn giao), và chạy lại từ đầu các check đang dở. Khóa cũ không cản (hết hạn sau 10 giây).

Cái mất khi dừng giữa chừng: phút check đã chạy (một lần 20 phút), và phần máy của nghi thức Thả quái thử thành mà Nhiếp chính giữ trong bộ nhớ cho người chấm kế tiếp.

## 6. Theo dõi

| Xem gì | Ở đâu |
|---|---|
| bảng nhiệm vụ, một quest | `elvaria quest list [--status <trạng thái>]`, `elvaria quest show <quest>` (phán quyết của lượt cuối, lý do trạm quân y, câu hỏi) |
| nhân vật, ai đang ngủ vì mana | `elvaria character list` |
| đồng hồ mana, phiên bản CLI, lỗi cấu hình | `elvaria doctor` |
| việc nhân vật làm | `quests/<quest>/journal.jsonl` |
| thư bàn giao | `quests/<quest>/handover.md` |
| thư về việc ngoài quest | `elvaria memo list [--all]`, `elvaria memo show <thư>` |
| mọi việc đang chờ bạn | `elvaria digest`; bản tấu của ngày: `digest/<yyyy-mm-dd>.md` |
| Tể tướng phân loại thư ngay, không chờ lịch | `elvaria triage` (một lần gọi model nếu có thư chờ) |
| prompt, settings, stdout của một lượt | `.runs/<quest>-<n>/` (người chấm: `.runs/<quest>-<n>/verify/`) |
| log setup và từng check | `.runs/<quest>-setup.log`, `.runs/<quest>-<n>/checks/<id>.log` |
| số đo của một khoảng ngày | `elvaria metrics --since <yyyy-mm-dd> [--until …] [--json]` (từ PS-06b có thêm thời gian quest nằm ở từng trạng thái, tỉ lệ đạt theo lượt làm, tỉ lệ bạn quyết thư theo lời khuyên của Tể tướng) |
| một kế hoạch so với thực tế | `elvaria metrics --plan <quest kế hoạch> [--json]`: từng quest con với vùng khai, file đã sửa, file đổi ngoài vùng, ước lượng và token lượt đầu, thư, lượt làm lại |

Trạng thái của quest, id (dùng cho `quest list --status <id>`) và tên hiện ra: `draft` Nháp, `open` Mở, `claimed` Đã nhận, `working` Đang làm, `review` Chờ nghiệm thu, `returned` Bị trả bài, `blocked` Chờ trả lời, `paused_mana` Tạm dừng (hết mana), `awaiting_seal` Chờ dấu vua, `done` Xong, `infirmary` Trạm quân y, `archived` Lưu trữ. Chuỗi in ra theo ngôn ngữ của vương quốc (`vi` mặc định; `init --locale en` đặt `en` cho cả vương quốc, `--locale` ở từng lệnh thắng).

Các lệnh trên chỉ đọc, không tốn mana, chạy được khi Nhiếp chính đang chạy. Sau một đợt chạy, `pnpm docs:gen --kingdom "<vương quốc>"` trong repo Elvaria sinh lại [tier-report.md](../tier-report.md) và [metrics-report.md](../metrics-report.md).

**Câu hỏi của nhân vật**: quest sang `Chờ trả lời`, chuông in câu hỏi. Trả lời bằng `elvaria answer <quest> "<câu>"`; trong 55 phút thì phiên cũ được nối lại, quá thì phiên mới đọc câu trả lời trong thư bàn giao.

**Thư** (PS-02, ADR 0024): nhân vật thấy việc ngoài quest của mình thì không tự sửa mà viết một dòng ở mục `Memos` của thư bàn giao. Khi lượt kết thúc qua nộp bài, câu hỏi hay phiên hỏng (không khi cầu dao cắt), Nhiếp chính lập `memos/<id>.json` và gửi tới Tể tướng; thư không đổi quest nào, và không ai trả lời thư. Xem bằng `elvaria memo list`; quyết một lần bằng `elvaria memo decide <thư> shelved` (gác), `rejected` (bác) hay `handled --quest <quest>` (đã có nhiệm vụ làm). Muốn Tể tướng soạn nhiệm vụ nháp từ thư thì `elvaria say --memo <thư> ["<lời thêm>"]` (tốn mana như mọi lần `say`): các bản nháp mang thư, và xác nhận một bản (`elvaria quest confirm`) là thư được đóng `handled` bởi nhiệm vụ đó (PS-03b).

**Phân loại thư và phạm vi ủy quyền** (PS-03b): mỗi ngày một lần, lúc `schedule.triage.at` (mặc định 07:30, nửa giờ trước bản tấu; `"triage": {"enabled": false}` để tắt), Nhiếp chính đang chạy mở một phiên Tể tướng cho cả lô thư gửi tới Tể tướng còn chờ (tối đa 20, cũ nhất trước; không có thư thì không gọi model), chỉ khi tộc của Tể tướng không có phiên nào đang chạy; từ lúc tới giờ đó tới khi phân loại bắt đầu, Nhiếp chính không mở phiên mới trên tộc ấy (việc đang chạy làm tiếp, tộc khác vẫn nhận việc), nên phân loại không bị việc nối nhau chen mãi. Tể tướng quyết mỗi thư: gộp vào một nhiệm vụ đang mở (nháp hay `open`), mở nhiệm vụ mới, gác lại, hay đưa lên bạn. Quyết định nằm trong `kingdom.delegation` thì Nhiếp chính áp luôn, không cần bạn; còn lại thư tới bạn kèm lời khuyên và lý do (`elvaria memo show <thư>`, mục thư trong bản tấu), nhiệm vụ mới thì thành bản nháp chờ bạn xác nhận. Mặc định `"delegation": {"max_rank": "D", "same_scope": true, "ask": [...]}`: việc tới hạng D, tệp của thư nằm trong vùng file của nhiệm vụ làm nó, và không chạm điều bạn giữ (`decision_change`, `contract_change`, `mana_over_budget`, `outward_action`, `protected_paths`; bỏ một mục khỏi `ask` là giao nó cho thế giới). `protected_paths` thì máy tự thấy, không chỉ dựa vào Tể tướng: thư nêu một tệp khớp `laws.protected_paths` của lãnh thổ thì tới bạn. Chạy tay bằng `elvaria triage` (tốn mana một lần gọi). Kết quả chỉ là lệnh hộp thư nguồn `chancellor`: Nhiếp chính dừng thì phiên dừng theo và lần khởi động sau chạy lại. `elvaria metrics` đếm thư bạn tự quyết và thư Tể tướng tự quyết.

**Thư phản biện** (PS-22): người làm cho một ghi chú của phán quyết trả bài là sai thì viết thư `objection` thay vì sửa cho qua; Nhiếp chính đưa nó tới một người chấm thứ hai (không phải người chấm đầu, không phải máy), và phán quyết thứ hai là cuối. Bạn chỉ gặp thư phản biện trong bản tấu khi không người chấm nào được đọc nó (thư thứ hai cho cùng phán quyết, thư chống phán quyết cuối hay lần trả của chính bạn): đọc bằng `elvaria memo show <thư>` rồi quyết bằng `elvaria memo decide`. Quest chờ người chấm thứ hai mà vương quốc không có ai hợp lệ thì vào mục `unjudgeable` như mọi quest thiếu người chấm: gọi thêm người chấm, hoặc quyết thư (`rejected`) để mọi người chấm lại được nhận.

**Thư phản biện đề bài** (PS-22b): người làm thấy đề bài sai, hoặc có cách hợp hơn mà đổi điều quest hứa, thì viết thư `amendment` và kết thúc phiên; quest chờ ở `blocked` như khi có câu hỏi. Quest Tể tướng soạn thì Tể tướng quyết, quest con của một kế hoạch thì pháp sư của kế hoạch quyết, mỗi thư một phiên không tool do Nhiếp chính đang chạy mở ngay khi tộc của người viết đề rảnh (tốn mana một phiên); trong lúc quest chờ, tộc đó không nhận phiên mới, để phiên của người viết đề không phải chờ mãi. Người viết đề nhận (viết lại mô tả quest), bác, hay đưa lên bạn; lý do vào phiên kế của người làm. Bạn chỉ gặp thư khi nó tới bạn: quest bạn tự viết bằng `quest add` (hay máy viết), thư thứ hai của cùng quest, quest hạng dưới `kingdom.dispatch.amendments.from_rank` (mặc định mọi hạng đều tới người viết đề), lần nhận vượt `kingdom.delegation` (mặc định từ hạng C), hay người viết đề đưa lên. Khi đó quest là một câu hỏi trong bản tấu và chuông rung: `elvaria quest show <quest>` nêu thư, `elvaria memo show <thư>` đọc thư và lý do, rồi `elvaria answer <quest> "<câu>"` (hay `elvaria memo decide <thư> accepted|rejected --note "<lý do>"`) cho quest đi tiếp; sửa mô tả trước bằng `elvaria quest edit` nếu bạn nhận thư. Nhận bằng `memo decide <thư> accepted` thì vùng của quest tự mở cho các file thư nêu, như khi người viết đề nhận (fix/amendment-owner-accept), khỏi `quest edit --scope`; trả lời bằng `answer` thì vùng không đổi. Vương quốc còn ghim một bản dựng trước PR #187 (merge vào `main` ở `1578486`; `elvaria doctor` in sha của bản ghim, và `git merge-base --is-ancestor 1578486 <sha ghim>` trong repo Elvaria thoát 0 khi bản ghim đã chứa #187) thì `memo decide` chưa mở vùng: thay đổi ở file thư nêu tính là ngoài vùng (người chấm thấy nó trong prompt như dấu hiệu lấn phạm vi, và một quest khác có file đó được làm cùng lúc). Với bản đó, trước `memo decide` chạy `elvaria quest edit <quest> --scope <glob> …` với mọi glob `quest show` đang in cộng các file thư nêu (`--scope` thay cả vùng); lần chạy thật (130) dùng cách này năm lần. `elvaria metrics` đếm thư lập, nhận, bác, tới bạn, và quest bị trả sau một lần bác.

**Bản tấu** (PS-03): mỗi ngày một lần, lúc `schedule.digest.at` của `kingdom.json` (mặc định 08:00 giờ vương quốc; `"digest": {"enabled": false}` để tắt), Nhiếp chính đang chạy ghi `digest/<ngày>.md` và rung chuông một lần: mọi việc chờ bạn, chia hai nhóm (phải quyết để việc chạy tiếp; chờ được), mỗi việc kèm khuyến nghị và lệnh `elvaria` để chạy. Không gọi model, không tốn mana; đồng hồ máy nhảy hay Nhiếp chính khởi động lại thì vẫn một bản một ngày, Nhiếp chính khởi động sau giờ đó thì ghi ngay, nhưng luôn sau phân loại thư của Tể tướng trong ngày (nếu `schedule.triage` bật): bản tấu chờ phân loại kết thúc và lệnh của nó vào sổ, kể cả khi phân loại còn chờ tộc của Tể tướng rảnh, nên một bản tấu có thể tới muộn: tới khi các phiên đang chạy trên tộc ấy kết thúc, hay khi tộc bị giữ vì phiên bản CLI thì tới khi `tribe check` qua. `elvaria digest` in bản tấu lúc này từ file và sổ sự kiện, không ghi gì; nhiệm vụ chờ người chấm chỉ có trong bản Nhiếp chính ghi. Nhiếp chính cũng rung chuông một lần cho nhiệm vụ có người chấm mà ai cũng hết mana (nêu kho và giờ reset nếu biết): chờ tới giờ reset, hoặc triệu hồi một người chấm khác model ở kho mana khác. `elvaria doctor` cảnh báo trước khi chuyện đó xảy ra: model người làm nào mà mọi người chấm khác model đều chung một kho mana.

**Tuần tra** (PS-26, 0 mana): mỗi ngày lúc `schedule.patrol.at` (mặc định 06:30, trước phân loại thư và bản tấu, nên bản tấu trong ngày mang kết quả), Nhiếp chính chạy `commands.setup` và mọi check của từng lãnh thổ git bật tuần tra trên một đất sạch `patrol-<lãnh thổ>` ở đầu nhánh gốc (phép thử của `territory check`), rồi các script quét, và ghi một dòng `patrol.ran`. Log ở `.runs/patrol-<lãnh thổ>/`, ghi đè mỗi lần; đất bị xóa sau mỗi lần, kể cả khi bạn dừng Nhiếp chính giữa chừng (lần khởi động sau chạy lại).

- Bật: `"patrol": {"enabled": true}` trong `schedule` của `kingdom.json` (tắt sẵn; `every` đọc theo ngày tròn: `P1D` mỗi ngày, `P7D` mỗi tuần), rồi `elvaria territory patrol <lãnh thổ> --on` cho từng lãnh thổ. Không có lệnh nào trong hai thì không tuần tra. Mỗi lần chạy tốn thời gian máy bằng một `territory check` (khoảng tám phút với repo Elvaria, đo 2026-11-15), không tốn mana.
- Script quét và quest nháp sửa trong `territories/<id>/territory.json`:

  ```json
  "patrol": {
    "scans": [{ "script": "link-check", "params": { "globs": ["docs/**/*.md"] } }, { "script": "todo-scan", "params": { "globs": ["src/**"] } }],
    "follow_up": { "kind": "fix", "rank": "D", "class": "knight" }
  }
  ```

- Đọc mục: một check đổi xanh sang đỏ (hay `commands.setup` hỏng, tên `setup`) là **một** mục `base_red` nhóm phải quyết, kèm dòng lỗi đầu, log, commit và các quest merge từ lần tuần tra xanh gần nhất (không có: thay đổi đến từ ngoài Elvaria); chuông rung một lần. Mục còn trong mọi bản tấu tới khi một lần tuần tra thấy check xanh lại. Check bị gạt vì môi trường (Docker tắt) không tính là đỏ. Lãnh thổ khai `follow_up` thì tuần tra lập thêm một quest nháp nêu đủ những thứ đó: `elvaria quest confirm <quest>` để nó mở, hoặc sửa đề trước (`quest edit`). Script quét không làm nhánh đỏ: `link-check` hỏng là một mục chờ được, `todo-scan` chỉ ghi số vào `patrol.ran`. `elvaria metrics` có bảng "Nhánh gốc đỏ sau merge".
- Nhánh gốc đỏ thì lãnh thổ dừng nhận việc (PS-09d). Khi lần tuần tra gần nhất thấy một check đỏ, Nhiếp chính không giao quest `open` nào của lãnh thổ đó và hàng đợi merge của nó đứng yên. Quest đang làm, đang chấm hay chờ dấu vẫn chạy tiếp, vì đất của chúng tách từ trước. Mục `base_red` của bản tấu ghi thêm số quest đang chờ, còn `quest list` và `quest show` đánh dấu chúng «chờ nhánh gốc xanh». Quest sửa do tuần tra lập (quest nháp sau khi bạn `confirm`) được miễn: nó được giao, được merge, rồi Nhiếp chính tuần tra lại khi đầu nhánh gốc đổi. Thấy xanh thì lãnh thổ nhận việc lại ở nhịp kế. Có ba cách ra khỏi trạng thái đỏ: xác nhận quest nháp của tuần tra; tự sửa nhánh gốc rồi chạy `elvaria territory patrol <lãnh thổ> --now` (cũng dùng khi một check chập chờn); hoặc tắt tuần tra của lãnh thổ, vì lãnh thổ không bật tuần tra thì không bao giờ bị coi là đỏ. Lần dò nhánh gốc mỗi 10 phút chỉ chạy khi lãnh thổ còn quest đã giao để hỏi, nên sau khi sửa tay ngoài Elvaria bạn nên dùng `--now`.
- Khi nào tắt: lãnh thổ đang sửa lớn, nhánh gốc đỏ đã biết và chưa ai sửa (mục cứ nằm đó, và lãnh thổ không nhận việc), hay máy bận việc khác buổi sáng: `elvaria territory patrol <lãnh thổ> --off` (xóa cả `scans` và `follow_up`), hoặc tắt lịch cho cả vương quốc.

## 7. Dấu vua và giao hàng

1. Đọc nhánh trong repo của lãnh thổ (`git log main..quest/<quest>`, `git diff main...quest/<quest>`), thư bàn giao và phán quyết (`quest show`).
2. `elvaria seal <quest> --note "…"`, hoặc `elvaria return <quest> --note "…" --fail-kind <kiểu>` để trả về người làm. `--note` của `return` bắt buộc, ít nhất 20 ký tự; `--fail-kind` là một trong `tests_fail`, `scope_creep`, `missing_i18n`, `wrong_facts`, `incomplete`, `style`, `unsafe`, `other` (mặc định `other`). `return --rejudge` khi lỗi là của người chấm: việc được chấm lại, người làm không bị tính trượt. Hai lệnh chỉ ghi vào `inbox/`: Nhiếp chính phải đang chạy thì quest mới chuyển.
3. Nhiếp chính viết thư giao hàng `.runs/<quest>-delivery.md`. Push **từ trong worktree của quest**, để pre-push hook của repo (nếu có) kiểm đúng nhánh đó; mở PR với thư giao hàng làm mô tả; merge. Repo không có remote thì merge nhánh `quest/<quest>` tại chỗ.
4. Lưu trữ để trả đất. Từ PS-08d Nhiếp chính tự làm việc này ở mọi chế độ giao hàng: nó dò nhánh gốc của lãnh thổ (fetch `origin` một lần) ngay sau mỗi `delivery.merged` và mỗi 10 phút khi còn quest `done` để hỏi; quest đã giao mà đầu nhánh đã nằm trong `main` (local hay `origin/main`) thì nó `archive`, gỡ worktree và cho Claude Code quên đường dẫn đó. Nhánh chưa có commit riêng không tính. Không muốn chờ thì `elvaria quest archive <quest>` (Nhiếp chính không chạy thì lệnh chờ tới lần `run` sau). Nhánh local ở lại; xóa khi đã merge (`git branch -d quest/<quest>`).

Với một đội, chỉ merge nhánh của **quest ghép**; hợp đồng và các phần vào `main` qua nó, và được lưu trữ cùng lúc với nó ở lần dò kế. Merge bằng `squash` không để lại tổ tiên: quest ghép được lưu trữ theo `delivery.merged` của chính nó (khi Nhiếp chính merge), còn hợp đồng và các phần thì bạn lưu trữ tay.

**Giao hàng tự động** (PS-08c, PS-08d; ADR 0023): `elvaria territory delivery <lãnh thổ> --mode pr` cho Nhiếp chính push `quest/<quest>` (chạy pre-push hook của repo) và mở PR với thư giao hàng làm mô tả; bạn đọc và merge PR, Nhiếp chính lưu trữ quest ở lần dò kế. `--mode pr_merge` thêm bước merge cho quest **đã có dấu**: Nhiếp chính hỏi forge mỗi 30 giây, merge khi các `required_checks` xanh (danh sách rỗng: ngay khi forge nói PR ghép được; cổng là check của chính Nhiếp chính trước người chấm), ở đúng đầu nhánh nó đã push, rồi xóa nhánh `quest/<quest>` trên remote (chỉ khi đầu nhánh còn đúng) và lưu trữ quest. Quest không qua dấu dừng ở PR như `pr`. Check đỏ, quá `--timeout` phút (mặc định 60) tính từ lúc push, conflict, đầu nhánh bị đổi trên forge, PR bị đóng: một `delivery.failed` và một mục bản tấu; Nhiếp chính không tự thử lại, quest ở `done`; sửa xong thì `elvaria quest deliver <quest>`. Lùi về một bản ghim trước PS-08 thì bỏ khóa `delivery` khỏi file lãnh thổ trước (bản cũ không đọc được nó).

**Ủy quyền dấu** (PS-08b; ADR 0023): việc nhỏ trong phạm vi bạn cho được Nhiếp chính merge mà không chờ dấu, trên lãnh thổ `pr_merge`. Bật bằng tay trong `kingdom.json` (§12; chưa có lệnh; cầu dao ở đoạn dưới): `"delegation": { …, "seal": { "max_rank": "D", "kinds": ["fix", "refactor", "document", "build"], "max_diff_lines": 400 } }` (`max_diff_lines` vắng thì 400; `elvaria doctor` báo dạng không có trong registry). Quest tạo bằng `quest add` (hay Tể tướng lập) không nói gì về dấu, dạng nằm trong `kinds` mà mặc định cần dấu, hạng tới `max_rank`, không thuộc đội, thì được miễn dấu: `quest show` ghi "không (được miễn nhờ ủy quyền dấu)". `--seal` hay `--no-seal` lúc tạo hay khi `quest edit` thì quest ra khỏi ủy quyền (`--no-seal` dừng ở PR). Máy chỉ nâng dấu, không hạ: việc chạm vùng bảo vệ, người nhận vượt cấp, file ngoài `scope_paths`, diff (dòng thêm cộng bớt, trừ file `shared_paths` kiểu `regenerate`) vượt trần, người chấm cùng họ model với người làm, máy chấm một mình, thư phản biện, hạng bị nâng quá `max_rank`, ủy quyền bị bỏ hay đổi; quest khi đó chờ dấu như thường, `quest show` và mục bản tấu ghi lý do. Mỗi quest merge không qua dấu là một mục "chưa gấp" ở bản tấu sáng hôm sau, kèm PR, commit merge và dòng hoàn tác: `git revert -m 1 <commit>` (`squash`: `git revert <commit>`); chạy nó trên nhánh gốc ở repo của bạn rồi tự push (Nhiếp chính không bao giờ push nhánh gốc). `elvaria metrics` đếm số quest merge không qua dấu theo lãnh thổ. Tắt: bỏ khóa `seal`; quest đã được miễn mà chưa xong sẽ chờ dấu ở lúc chấm đạt.

**Cầu dao của ủy quyền dấu** (PS-08g; ADR 0023): một lỗi lọt trên một quest merge không qua dấu làm ủy quyền dấu của lãnh thổ đó ngừng tới khi bạn bật lại; lãnh thổ khác không đổi. Hai tín hiệu: (1) tuần tra (§6) thấy một check của nhánh gốc đổi sang đỏ mà các merge từ lần tuần tra xanh gần nhất có một merge không qua dấu (quest bị nêu là merge không dấu cũ nhất trong số đó); (2) bạn báo: `elvaria quest escaped <quest> [--note "lỗi gì"]`, cho một quest đã vào nhánh gốc (Nhiếp chính merge, hay đã xong rồi lưu trữ), mỗi quest một lần. Báo trên quest đã qua dấu thì chỉ sổ đo đếm. Khi ngừng: chuông rung một lần, bản tấu có mục "chưa gấp" kèm lệnh bật lại. Việc vẫn chạy, chỉ là mọi quest mới ở lãnh thổ đó theo `seal_default` của dạng nhiệm vụ (chờ dấu); quest đang dở đã được miễn bị nâng dấu (lý do `suspended`) lúc nộp hay lúc chấm đạt; quest xong mà chưa merge dừng ở PR. Nhiếp chính khởi động lại vẫn giữ trạng thái ngừng (nó đọc lại từ log). `elvaria territory delegation <lãnh thổ>` in phạm vi ủy quyền, lãnh thổ có `pr_merge` không, và đang ngừng từ quest nào, vì sao.

Trước khi bật lại, đọc: (a) `elvaria quest show <quest bị nêu>`: PR, commit merge, thư bàn giao; (b) với tín hiệu (1), log của check đỏ (`log_path` ở mục `base_red` của `elvaria digest`) và các quest khác merge trong cùng khoảng (mục đó liệt kê; quest có dấu cũng có thể là thủ phạm), với tín hiệu (2), ghi chú của bạn; (c) lỗi đã được sửa hay hoàn tác chưa (dòng hoàn tác của mục `merged_unsealed`, hay quest nháp của tuần tra), và nhánh gốc đã xanh lại chưa (`elvaria territory patrol <lãnh thổ> --now`); (d) phạm vi `seal` có cần hẹp lại không (bớt dạng, hạ `max_rank` hay `max_diff_lines`). Rồi `elvaria territory delegation <lãnh thổ> --resume`: từ quest mới kế tiếp lãnh thổ lại được miễn dấu; quest đã bị nâng dấu trong lúc ngừng vẫn chờ dấu (máy không hạ dấu). `elvaria metrics`: bảng "Merge không qua dấu" có thêm cột số quest trong đó bị một tín hiệu nêu, và bảng "Lỗi lọt chủ nhân báo sau merge" (có dấu hay không).

**Hàng đợi merge** (PS-09): ở lãnh thổ giao `pr` hay `pr_merge`, mỗi lãnh thổ giao một quest một lúc, quest sửa ít file nóng và ít file trước. Trước khi push, Nhiếp chính ghép `main` vào nhánh quest, gỡ conflict của `shared_paths` theo luật, chạy lại `commands.setup`, `commands.generate` và mọi check; nhánh đã chứa `main` thì không làm gì. Quest có dấu dưới `pr_merge` giữ lượt tới khi PR được merge, nên quest sau luôn được ghép trên nó. PR đang mở mà `main` đi làm nó hết ghép sạch thì được cập nhật và push lại (tối đa 3 lần mỗi lần giao). Hỏng thì bản tấu có mục `delivery.failed` bước `update`: `conflict` (file ngoài luật, đất giữ nguyên), `checks_red` (commit merge nằm trên nhánh, chưa push; log ở `.runs/<quest>-delivery/checks/`), `generate_failed` (`.runs/<quest>-delivery/generate.log`) hay `update_failed`; gỡ trên nhánh rồi `elvaria quest deliver <quest>`. Việc giao hàng chiếm một chỗ của `dispatch.max_background`.

Bảng tra các cặp bước (`stage`) và lý do (`reason`) của `delivery.failed` khi việc giao hàng dừng. Bạn dừng Nhiếp chính giữa lúc giao hàng thì không có dòng nào: lần chạy sau giao lại (lần ghép nhánh gốc đã xong thì nó chỉ chạy phần sau lần ghép).

| Bước (`stage`) | Lý do (`reason`) | Nghĩa là | Làm gì |
|---|---|---|---|
| `update` | `conflict` | Xung đột khi ghép nhánh gốc (`main`) ở các file không giải quyết được bằng luật `shared_paths`, hoặc nhánh gốc đã vượt nhánh quest quá 3 lần (`UPDATE_ROUNDS_MAX`) trong hàng đợi merge | Đất giữ nguyên (lần ghép dở bị hủy). Vào worktree của quest gỡ conflict với nhánh gốc, commit, rồi `elvaria quest deliver <quest>` |
| `update` | `generate_failed` | Một lệnh của `commands.generate` thất bại (mã thoát khác 0) hoặc quá 10 phút bị ngắt | Đất giữ commit merge; thay đổi dở của generator có thể còn lại trên cây làm việc (chưa hoàn nguyên); log ở `.runs/<quest>-delivery/generate.log`. Đọc log, dọn thay đổi dở nếu có, sửa code hoặc lệnh generator trong lãnh thổ, rồi `elvaria quest deliver <quest>` |
| `update` | `checks_red` | Có check của lãnh thổ bị đỏ (thất bại hoặc quá giờ) trên commit merge mới (không phải lỗi môi trường) | Commit merge nằm trên nhánh quest ở local, chưa push; log từng check ở `.runs/<quest>-delivery/checks/<tên-check>.log`. Đọc log, sửa lỗi trên nhánh quest rồi `elvaria quest deliver <quest>` |
| `update` | `update_failed` | Git từ chối ghép trước merge (lỗi điểm rẽ, git cũ hơn 2.38), hoặc lỗi sau merge (`commands.setup` lỗi, hook pre-commit từ chối commit của generator, check của lãnh thổ không chạy được) | Phân biệt theo thời điểm lỗi: lỗi trước merge (git từ chối ghép) thì lần ghép bị hủy, đất giữ nguyên; lỗi sau merge (`commands.setup`, hook commit generator, check không chạy được) thì đất giữ commit merge trên nhánh quest (chưa push). Đọc `detail` trong bản tấu, sửa nguyên nhân (setup, hook, git) rồi `elvaria quest deliver <quest>` |
| `scan` | `push_refused` | Git ở worktree không đọc được số commit, HEAD, diff hoặc từng commit (`git log -p`) của nhánh quest đối chiếu với nhánh gốc (`main`) | Đất giữ nguyên (chưa push). Kiểm tra trạng thái git trong worktree của quest, gỡ lỗi repo rồi `elvaria quest deliver <quest>` |
| `scan` | `secret` | Phép quét phát hiện giá trị trong kho bảo vật (`treasury`) hoặc mẫu secret ở một dòng mà nhánh quest thêm so với nhánh gốc: trong diff gộp `${base}...HEAD`, hay trong phần thêm của một commit bất kỳ của `${base}..HEAD` (commit merge: phần nó thêm ngoài lần ghép tự động của git), vì `git push` đẩy mọi commit. Secret thêm ở một commit rồi xóa ở commit sau vẫn bị chặn. `paths` nêu tên file; `detail` (`elvaria quest show <quest>`) nêu từng commit đã thêm secret và file của nó | Đất giữ nguyên (chưa push). Secret phải ra khỏi lịch sử của nhánh trước khi `elvaria quest deliver <quest>` vì `git push` đẩy mọi commit (ví dụ: gỡ secret khỏi cây làm việc, `git reset --soft <nhánh gốc>` rồi commit lại; không rebase); và nên đổi secret đó nếu nó có thể đã lộ |
| `push` | `push_refused` | `git push origin quest/<id>` bị từ chối: remote từ chối nhận nhánh, hook pre-push thất bại, hoặc push quá 30 phút | Đất giữ nguyên (commit ở local); log push (đã che secret) ở `.runs/<quest>-delivery/push.log`. Đọc log, sửa lỗi pre-push hoặc quyền remote, rồi `elvaria quest deliver <quest>` |
| `push` | `forge_error` | Lãnh thổ bị mất, Nhiếp chính thiếu adapter cho forge, `vcs.remote` không trỏ tới repo trên forge, hoặc lỗi khi đọc kho bảo vật / thư giao hàng | Đất local giữ nguyên; remote có thể chưa nhận nhánh (lỗi trước push: thiếu adapter, remote sai, kho bảo vật) hoặc nhánh đã được push lên remote (lỗi sau push: không đọc được thư giao hàng trước khi mở PR). Đọc `detail`, chạy `elvaria doctor` kiểm tra remote và forge, sửa lỗi rồi `elvaria quest deliver <quest>` |
| `open` | `no_credential` | Nhánh đã push lên remote, nhưng git không có credential để gọi API mở hoặc tìm PR trên forge | Nhánh đã push lên remote, đất local giữ nguyên. Cấu hình credential git cho host của forge (Git Credential Manager, token), kiểm tra bằng `elvaria doctor`, rồi `elvaria quest deliver <quest>` |
| `open` | `forge_auth` | Nhánh đã push lên remote, nhưng forge từ chối xác thực (HTTP 401 hoặc 403: token hết hạn, bị thu hồi, thiếu quyền mở PR trên repo) | Nhánh đã push lên remote, đất local giữ nguyên. Đăng nhập lại hoặc cấp quyền mở PR cho token trên forge, rồi `elvaria quest deliver <quest>` |
| `open` | `forge_error` | Nhánh đã push lên remote, nhưng API của forge báo lỗi mạng, quá giờ, lỗi máy chủ 5xx hoặc phản hồi không đọc được khi mở/tìm PR | Nhánh đã push lên remote, đất local giữ nguyên. Đọc `detail` trong bản tấu, kiểm tra mạng/forge rồi `elvaria quest deliver <quest>` |
| `checks` | `no_credential` | Nhánh đã push và PR đã mở, nhưng git không có credential khi Nhiếp chính hỏi trạng thái check của PR trên forge | PR đã mở trên remote, đất local giữ nguyên. Đăng nhập credential git cho host của forge rồi `elvaria quest deliver <quest>` |
| `checks` | `forge_auth` | Nhánh đã push và PR đã mở, nhưng forge từ chối quyền (401/403) khi hỏi trạng thái check của PR | PR đã mở trên remote, đất local giữ nguyên. Kiểm tra lại quyền của token trên forge rồi `elvaria quest deliver <quest>` |
| `checks` | `forge_error` | Nhánh đã push và PR đã mở, nhưng forge gặp lỗi mạng, quá giờ hoặc lỗi máy chủ khi hỏi trạng thái check của PR | PR đã mở trên remote, đất local giữ nguyên. Đọc `detail` trong bản tấu, thử lại sau bằng `elvaria quest deliver <quest>` |
| `checks` | `checks_red` | Nhánh đã push và PR đã mở, nhưng có check bắt buộc (`required_checks`) trên forge bị đỏ (`failure`) | PR đã mở trên remote, đất local giữ nguyên; bản tấu nêu danh sách check đỏ. Đọc log check trên forge, sửa trên nhánh quest ở local, commit rồi `elvaria quest deliver <quest>` để cập nhật và push lại |
| `checks` | `checks_timeout` | Nhánh đã push và PR đã mở, nhưng check bắt buộc của PR chưa xong sau thời gian chờ (quá `--timeout` phút, mặc định 60, tính từ lúc push) | PR đã mở trên remote, đất local giữ nguyên; bản tấu nêu các check đang chờ. Kiểm tra CI trên forge xem có nghẽn không, nâng timeout của lãnh thổ hoặc kích hoạt lại check trên forge, rồi `elvaria quest deliver <quest>` |
| `merge` | `no_credential` | PR đã mở và check đã xanh, nhưng git không có credential khi Nhiếp chính gọi API merge PR | PR đã mở trên remote, đất local giữ nguyên. Cài đặt credential git cho host của forge rồi `elvaria quest deliver <quest>` |
| `merge` | `forge_auth` | PR đã mở và check đã xanh, nhưng forge từ chối quyền merge (401/403, tài khoản thiếu quyền write/merge vào nhánh gốc) | PR đã mở trên remote, đất local giữ nguyên. Cấp quyền merge trên repo forge cho tài khoản rồi `elvaria quest deliver <quest>` |
| `merge` | `forge_error` | PR bị đóng trước khi merge (`closed`), forge không trả về commit merge, hoặc API merge của forge gặp lỗi mạng / máy chủ 5xx | PR đã mở trên remote, đất local giữ nguyên. Đọc `detail` trong bản tấu; nếu PR bị đóng thì mở lại hoặc tạo nhánh mới, rồi `elvaria quest deliver <quest>` |
| `merge` | `head_moved` | Đầu nhánh của PR trên forge đã khác với commit SHA mà Nhiếp chính đã push (nhánh remote bị ai đó push đè trong lúc chờ merge) | PR đã mở trên remote, đất local giữ nguyên. Kiểm tra commit trên remote, đưa nhánh local về đúng trạng thái mong muốn rồi `elvaria quest deliver <quest>` |

**Sửa quest kế trước khi đóng dấu.** Quest có `depends_on` tới quest đang chờ dấu mở ngay khi bạn `seal`, và Nhiếp chính có thể giao nó ở nhịp kế. Đọc nhánh mà thấy quest kế cần đổi đề (một đường nối quest này để lại, một file đổi chỗ) thì `elvaria quest edit <quest kế> --description "…"` **trước** lệnh `seal`. Sau đó người làm đã đọc đề cũ, và một lần sửa mô tả lúc quest đang chạy dễ bị trả `stale`, vì Nhiếp chính cập nhật quest đang chạy nhiều lần mỗi phút (chỉ sửa trần mới bỏ qua phép so đó).

**Giao tay trên repo Elvaria** (lãnh thổ giao `manual`), như các lần chạy thật làm: trong worktree của quest, `git merge origin/main` (không rebase); file sinh ra bị conflict (`docs/events.md`, `docs/schemas/**`, vùng `docs:gen`…) thì lấy một bên rồi chạy lại generator (`pnpm docs:gen`, `pnpm schemas`); rồi `NODE_OPTIONS=--max-old-space-size=8192 pnpm check` xanh, push, mở PR với thư giao hàng, merge bằng merge commit.

**Dấu trên một kế hoạch** (PS-06b): `elvaria quest show <quest kế hoạch>` in tấu trình (các phương án bạn đã nhận khi xác nhận quest) tách khỏi phần còn lại của mô tả, và khi kế hoạch chờ dấu, mục `## Summary` của file `plans/<chủ đề>.md` pháp sư viết trong đất: trang để bạn đóng dấu. Muốn đọc cả file thì mở nó trong worktree của quest. Check `subquests` của Nhiếp chính đã trả về kế hoạch thiếu file đó hay thiếu một mục của nó trước khi người chấm đọc.

**Vùng bảo vệ** (PS-04): lãnh thổ khai `laws.protected_paths` (thứ canh giữ thế giới: luật, check, người chấm, sổ đo). Quest có thay đổi chạm một đường dẫn trong đó thì cần dấu vua dù dạng của nó không cần (kể cả `analyze`), và được ưu tiên người chấm cấp cao hơn như quest từ hạng B; phần của một đội chỉ được ưu tiên người chấm, dấu thì quest ghép của đội xin một lần cho cả đội; `quest show` có dòng "Vùng bảo vệ đã chạm". Không có gì bị chặn: đọc kỹ các file đó trong diff trước khi đóng dấu. Cách đặt và danh sách của lãnh thổ Elvaria: [elvaria-territory.md](elvaria-territory.md).

## 8. `doctor`, phiên bản CLI và việc ghim

Chạy `elvaria doctor` **đầu mỗi ngày chạy** và sau mỗi thay đổi cấu hình. Nó kiểm registry, git, CLI của từng tộc (đường dẫn, phiên bản, đăng nhập, hook đã build), shell của tộc, từng lãnh thổ và chương trình mà lệnh của chúng gọi, Docker khi một lệnh dùng nó, danh tính git (`user.email`) của từng repo, `.claude/rules/` có nằm trong `laws.patch_paths` không, lần thử gần nhất của từng lãnh thổ git (cảnh báo khi chưa thử, thử không đạt, hay setup hoặc check đã đổi từ đó; PS-25), model người làm mà mọi người chấm khác model chung một kho mana, hai người chấm trên một kho cũng tính (cảnh báo: kho đó đóng là bài của model đó không ai chấm; đếm theo kho từ PS-03), kho bảo vật, phiên còn sót, đồng hồ mana, và bản mà vương quốc ghim (lỗi khi bản ghim không còn trên đĩa hay `.state/build.json` không đọc được; cảnh báo khi lệnh chạy bằng mã khác với `--here`). Lỗi thì in "Chưa sẵn sàng: n lỗi"; cảnh báo không chặn.

Hai CLI **tự cập nhật qua đêm** theo VS Code (hai lần trong hai ngày của P1-50):

| `doctor` in | Nghĩa là | Làm gì |
|---|---|---|
| "Tộc claude: file đã ghim … không còn; tìm thấy …" (lỗi) | Claude Code (hay Codex, 2026-11-14) để binary trong thư mục mang số phiên bản; bản cũ đã bị gỡ. **Tộc không chạy được, Nhiếp chính giữ tộc** | đọc changelog giữa hai bản, `elvaria tribe check claude` (nó thử CLI vừa tìm thấy; qua thì ghim cho riêng tộc này), rồi khởi động lại `elvaria run` nếu nó đang chạy |
| "Tộc gemini: CLI ở … đã tự cập nhật từ bản … lên …. Nhiếp chính không mở phiên mới cho tộc tới khi …" (cảnh báo) | `agy.exe` bị thay tại chỗ; **ghim không giữ được bản cũ**, nên Nhiếp chính giữ tộc | đọc changelog, `elvaria tribe check gemini`: qua thì nó ghim bản mới cho riêng tộc gemini và tộc làm việc lại |
| "Tộc …: bản … đã được ghim nhưng chưa lần kiểm nào với CLI thật qua trên nó" (cảnh báo) | `doctor --pin` đã ghim lại mà không kiểm; Nhiếp chính vẫn giữ tộc | `elvaria tribe check <tộc>` |

**Giữ tộc** (fix/tribe-version-hold): trước mỗi kế hoạch, Nhiếp chính chạy `<cli> --version` (0 mana, mỗi tộc tối đa một lần một phút) trên CLI mà nó chạy cho từng tộc. CLI không còn, hay nói bản khác bản mà lần `tribe check` thật gần nhất đã qua (`tool.checked_version`; vương quốc chưa từng có lần kiểm thật thì bản đã ghim đứng thay), thì tộc không nhận phiên mới nào (nhận việc, chấm, trả lại, đánh thức); chuông kêu một lần, bản tấu có dòng kèm lệnh. Phiên đang chạy không bị giết. Từ fix/held-tribe-sessions, phiên ngoài kế hoạch cũng bị giữ: Tể tướng thuộc tộc bị giữ nhường Tể tướng của tộc khác; không còn ai thì phân loại thư theo lịch chờ tới khi hết giữ, còn `elvaria say` và `elvaria triage` không mở phiên, in dòng của chuông kèm `elvaria tribe check <tộc>`; thư sửa đề mà pháp sư của tộc bị giữ phải quyết thì chờ, không chuyển cho bạn. Hook của Elvaria chưa build là **lỗi** của mọi tộc ở `doctor` (trước đó tộc claude chỉ cảnh báo, gemini và adapter file không kiểm).

Trước khi kiểm: đọc changelog (`agy changelog`; https://code.claude.com/docs/en/changelog) tìm mục đổi `-p`, `--settings`, quyền, hook, stream-json, mã thoát và **mặc định** (agy 1.5.7 đổi chế độ mặc định của phiên `-p` sang Auto, 2026-11-13); đối chiếu các dòng có dấu ⚑ trong [cli-facts 2026-11-12](../reference/cli-facts-2026-11-12.md) và [2026-11-16](../reference/cli-facts-2026-11-16.md) (Claude Code 2.1.325: quyền `dontAsk` chặt hơn). Rồi `elvaria tribe check <tộc>` chạy bộ test hợp đồng với CLI thật (vài phiên ngắn, tốn chút mana): đỏ thì tộc vẫn bị giữ, không ghi gì, và đất tạm của phép hỏng được giữ ở `<vương quốc>/.runs/tribe-check-<tộc>-<stamp>/<phép>/` (lệnh in đường dẫn); qua thì nó ghim đường dẫn và phiên bản của riêng tộc đó. Model: `--model`, không thì `default_model` của tộc, không thì model rẻ nhất mà nhân vật của tộc chạy (PS-23). Một phiên được tối đa 300 s; `--timeout <giây>` cho dài hơn. `doctor --pin` vẫn có, nhưng ghim lại mọi tộc có CLI đổi trong cùng một lần mà không kiểm gì (Nhiếp chính vẫn giữ các tộc đó), và graphify chỉ khi một lãnh thổ bật `code_graph` hay graphify đã được ghim.

**Đồ thị code (PS-21, [ADR 0029](../adr/0029-code-graph-of-the-territory.md)).** Tùy chọn, mặc định tắt. Cài graphify (`uv tool install graphifyy`, Python 3.10–3.14), chạy `elvaria territory graph <lãnh thổ> --query '<tên mã>'` để thử (0 mana, đồ thị ở `.state/graphs/<lãnh thổ>/`), rồi đặt `"code_graph": true` trong `territories/<id>/territory.json` và chạy `elvaria doctor --pin` để ghim graphify. Từ đó Nhiếp chính dựng đồ thị ở commit gốc của mỗi quest, và nghề có `Glob` hoặc `Grep` (trừ nghề cấm trần `Bash`) hỏi được nó bằng `graphify query`, `path`, `explain`, `affected`. `doctor` cảnh báo khi graphify thiếu hay đổi phiên bản; thiếu graphify thì quest chạy như trước. Bật cờ trên lãnh thổ nào là chủ nhân chốt sau A/B của PS-21.

## 9. Đồng hồ mana

Nhiếp chính đọc hạn mức của từng tài khoản mà không gọi model (`claude -p /usage`, `agy -p /usage`), sau mỗi phiên và mỗi `mana.probe_interval_minutes` (15). Mỗi cửa sổ là một đồng hồ: 5 giờ, tuần, và trần tuần riêng mà tài khoản đặt cho một model (Argon ở tài khoản Antigravity; Fable, một model khác của Claude, ở tài khoản Claude); trần riêng chỉ ràng nhân vật chạy model đó.

- **Đóng sớm một phiên.** Đồng hồ không nhận phiên mới khi mức đã dùng cộng phần một phiên sẽ chạm `min(mana.cap_pct, 100 − mana.king_reserve_pct)` (mặc định 98). Phần một phiên là số Nhiếp chính đo được (P1-50: Argon 7,78 % tuần, Flash 1,97 % tuần, Claude 3 % tuần), 7 % khi chưa đo. `doctor` in từng đồng hồ, phần một phiên, và dòng "đóng sớm một phiên" khi nó đã đóng.
- **Đóng chỉ chặn phiên mới.** Phiên đang chạy chạy tiếp. Nhân vật dùng model bị chặn đứng yên; quest của họ chờ, không vào trạm quân y. Không có chuông riêng cho việc một quest chờ vì mọi người chấm hợp lệ bị đồng hồ chặn (vá ở PS-03): thấy quest `Chờ nghiệm thu` lâu mà không có check nào chạy thì xem `doctor`.
- **Hết giữa phiên.** Phiên gặp giới hạn của tài khoản thì quest sang `Tạm dừng (hết mana)`, giữ người làm; Nhiếp chính thăm dò lại sau giờ reset và việc tiếp tục bằng phiên mới từ thư bàn giao.
- **Sau khi bạn đăng nhập lại hay hạn mức được hồi**: `elvaria wake <tộc>` để Nhiếp chính đo ngay; không thì nó đo ở lần thăm dò kế.
- **Đổi model của một nhân vật** sang đồng hồ còn chỗ: `elvaria character model <id> <model>` (cùng tộc), áp cho phiên sau.
- Pool `claude_gpt_models` của tộc gemini mặc định tắt: đừng dùng model `claude-*` qua agy để chấm việc của tộc claude (cùng họ model).

## 10. Trạm quân y và các lệnh khi quest kẹt

Nhiếp chính hiệu chỉnh trần theo tộc mỗi nhịp từ file quest và nhân vật, không đọc sổ sự kiện để học hệ số.
`elvaria metrics --plan <quest kế hoạch>` in hệ số token, trần lượt, số mẫu riêng và nguồn của từng giá trị
trong cả vương quốc. Dưới 10 lượt đầu đã kết thúc có ước lượng token dương và đủ số đo, hệ số dùng
`breakers.estimate_factor` (mặc định 1,82), trần lượt dùng `max_turns` của tộc hoặc `breakers.max_turns`.
Đủ mẫu thì dùng trung vị token lượt đầu / ước lượng và trung vị số lượt (làm tròn lên); các phiên tiếp của
cùng lượt đầu được cộng lại. Mỗi tộc giữ cách đếm token riêng; lượt thiếu `turns` không thành mẫu 0.
Trần token giữ mức sàn theo hạng và mức ngân sách được nâng riêng; người chấm nhận hệ số trần token dành
cho người chấm sau cùng. `--json` giữ nguyên đối tượng độ chính xác của kế hoạch.

Quest vào trạm quân y thì dừng hẳn và chuông rung. `elvaria quest show <quest>` in lý do. Phần dở của người làm đã được commit lên nhánh (`chore: wip <quest> (<lý do>)`), trừ khi `quest show` nói commit bị từ chối.

Phiên người làm vượt trần không còn đưa quest vào trạm quân y ngay. Ở 85 % trần (phút, token hay lượt) Nhiếp chính nhắc phiên một lần (`wrap-up.json`, event `agent.session.wrap_up`) để nó dừng, commit và viết thư; ở 150 % nó cắt phiên. Cắt mà nhánh có commit mới (hay commit WIP có thay đổi) thì quest đi tiếp trong phiên mới của cùng lượt, cùng người làm, không tốn lần thử, không chuông, và không có trần số lần đi tiếp. Chỉ khi hai lần cắt liền nhau trong cùng lượt đều không có tiến triển thì quest vào trạm quân y (`breaker:no_progress`) và chuông rung: một lần cắt giảm nay không buộc bạn `retry`. Các trip `commit`, `secrets`, `forbidden_paths` và `no_session` giữ nguyên: vào trạm quân y ngay, không phiên tiếp nào mở. Người chấm vượt trần vẫn rời lượt chấm cho người kế.

| Lý do | Nghĩa là | Làm gì |
|---|---|---|
| không tiến triển (`breaker:no_progress`) | hai lần cắt liền nhau của phiên người làm trong cùng một lượt, ở trần phút, token hay lượt, mà cả hai đều không để lại commit mới | đọc `git log` và thư bàn giao; nâng trần (`quest edit --max-tokens` hay `--max-minutes`), hoặc chia nhỏ việc, rồi `retry` |
| commit bị từ chối | hook của repo từ chối commit, hoặc bản vá `elvaria.patch` không áp được | đọc lý do, sửa trong đất riêng (`<repo>/.elvaria/worktrees/<quest>`) rồi `retry` |
| đường dẫn cấm bị đổi | một chương trình của phiên ghi vào `laws.forbidden_paths` hay file `.env`; không có gì được commit | trả các file đó về như cũ hoặc xóa trong đất riêng, rồi `retry` |
| thiếu secret | kho bảo vật thiếu tên mà quest xin, hoặc lãnh thổ không cho | thêm vào kho bảo vật hay `secrets_allowed`, rồi `retry` |
| người chấm rời đi không ra phán quyết; cứ nộp phán quyết dở | hai người chấm của một lượt bị cầu dao cắt hay hỏng, hoặc ba người chấm dở | nâng trần (người chấm được gấp đôi trần của quest), `retry`: quest về chờ nghiệm thu với người chấm mới |
| đã hết số lần thử | ba lượt đều trượt | đọc các phán quyết; sửa mô tả (`quest edit --description`) hay `--max-attempts`, rồi `retry`; hoặc `retry <quest> --to <nhân vật>` |
| script hỏng, không dùng được tham số, không đạt | bậc script | đọc `.runs/<quest>-<n>/script.log`; quest tiếp nối (nếu có) đã được mở |

Ba mã `breaker:time`, `breaker:tokens`, `breaker:turns` chỉ còn xuất hiện trong dữ liệu cũ; Nhiếp chính không còn ghi chúng cho người làm.

Đổi trần khi quest đang có phiên thì phiên đó cũng theo trần mới từ nhịp kế: cầu dao của Nhiếp chính đọc trần của quest mỗi nhịp, nên hạ trần dưới số phút phiên đã chạy là cắt nó ngay (`quest edit` cảnh báo). Riêng agy tự giữ đồng hồ (`--print-timeout`) lúc mở phiên: nâng trần không kéo dài phiên agy đang chạy, phiên sau mới nhận trần mới. §4 có số đo để chọn trần token.

`retry` mở quest cho **mọi** nhân vật đúng nghề đang rảnh, như một quest mới: Nhiếp chính chọn, không nhất thiết là người vừa làm (`--to` của `quest add` không được lưu trên quest, nên không còn tác dụng sau trạm quân y; quest `q_20261112_gwrz5m` vì vậy về tay người khác). Muốn đúng một nhân vật làm lại, kể cả người vừa làm: `retry <quest> --to <nhân vật>`; CLI gửi lệnh `reassign`, nhân vật đó nhận đủ lượt thử như mới. Quest chỉ kẹt ở phần chấm (người chấm rời đi không ra phán quyết) và quest bậc script không nhận `--to`. `quest reassign <quest> --to <nhân vật>` gửi đúng lệnh `reassign` đó (`retry --to` và `reassign --to` cùng đi qua `giveQuestTo` của `apps/cli/src/quest/`).

**Quest ở trạm quân y mà việc đã xong** (cầu dao cắt phiên sau khi người làm đã làm xong, như d7 của lần chạy thật (130): 1 244 256 token trên trần 1 200 000): `elvaria quest submit <quest>` (từ nhánh `fix/quest-hold`). Ở nhịp sau, Nhiếp chính áp patch của người làm (nếu lãnh thổ có `laws.patch_paths`), commit phần còn trong đất riêng qua hook của lãnh thổ, đánh dấu vùng bảo vệ nếu việc chạm (quest chờ dấu vua), rồi quest sang chờ nghiệm thu, cùng người làm, cùng lượt và lượt thử: check máy chạy trước, người chấm mới đọc. Patch không áp được, hook từ chối commit hay một đường cấm bị đổi thì lệnh bị từ chối (dòng `command.rejected` mang `patch_refused`, `commit_refused` hay `forbidden_paths`), quest ở lại trạm quân y, phần việc vẫn trong đất riêng: sửa rồi gửi lại. Trượt thì quest về chính người làm với một lượt thử mới, như mọi lượt chấm. Lệnh chỉ nhận quest mà phiên cuối là của người làm: quest kẹt ở phần chấm dùng `retry`, quest hết lượt thử vì ba lần trượt dùng cách bên dưới.

Vương quốc còn ghim bản dựng trước `fix/quest-hold` (lệnh `quest submit` chưa có) thì làm vòng:

1. Trong đất riêng (`<repo>/.elvaria/worktrees/<quest>`), xem commit WIP (`git log -1`) và chạy check của lãnh thổ ngoài sandbox, với repo Elvaria là `NODE_OPTIONS=--max-old-space-size=8192 pnpm check`; `git status` vẫn sạch sau đó.
2. Xanh thì thêm vào cuối mô tả một mục `## Còn lại sau lượt cắt`: việc đã xong ở commit nào, check nào đã xanh, phiên sau chỉ cần kiểm lại và nộp. `elvaria quest edit <quest> --description "<mô tả cũ và mục mới>"` (`--description` thay cả mô tả).
3. `elvaria quest reassign <quest> --to <người vừa làm>`: phiên mới của chính người đó đọc mô tả và thư bàn giao, nộp, rồi người chấm chấm như mọi lượt. Ở d7: phiên 56 giây, 67 811 token, không đổi gì, người chấm pass.

Cùng cách khi người chấm nêu mỗi lượt một chỗ mới tới hết lượt thử (`quest submit` không nhận quest này, vì phiên cuối là của người chấm): mục `## Còn lại sau ba lượt chấm` gom mọi ghi chú còn mở, rồi `reassign --to` cùng người (quest kế hoạch và d5 của lần chạy (130)).

Các lệnh khác của chủ nhân:

| Tình huống | Lệnh |
|---|---|
| quest không ai nhận được (cấp thấp, sai nghề, tộc tắt) | `quest show` in sẵn lệnh `quest reassign … --to …` cho ứng viên tốt nhất |
| muốn một nhân vật cụ thể làm | `quest reassign <quest> --to <nhân vật>` (vượt hạng trần thì quest chờ dấu vua, trừ phần của đội: dấu nằm ở quest ghép) |
| nhân vật bị hạ cấp oan (check đỏ vì môi trường) | `elvaria character level <id> <cấp>` |
| nhân vật trượt cùng một kiểu ba lần liền thì bị đình chỉ vào Đền | sửa nguyên nhân (kinh, mô tả), rồi `elvaria character release <id>` |
| tạm cho một nhân vật nghỉ | `elvaria character suspend <id> --reason "…"` |
| giữ một quest chưa bắt đầu tới lần chạy sau (quest `open`, hay `claimed` chờ người `--to`) | `elvaria quest hold <quest> --reason "…"` (từ `fix/quest-hold`): Nhiếp chính không nhận, không bắt đầu nó, `quest list` ghi «đang giữ», bản tấu có một dòng «Đang giữ: …, lý do: …» ở nhóm chờ được (ý (D), PS-09d); trạng thái, mô tả, phụ thuộc và người `--to` giữ nguyên. Mở lại: `elvaria quest unhold <quest>`. Khác `cancel`, lệnh lưu trữ luôn quest (d8–d12 của lần chạy (130)) |
| bỏ một quest chưa xong | `elvaria quest cancel <quest>`; worktree của quest đã hủy ở lại, dọn tay. Quest ở trạm quân y thì `quest archive` (hay `cancel`, cùng lệnh): Nhiếp chính gỡ worktree, giữ nhánh cùng phần việc dở |

Chỗ từng thiếu đường, đã vá ở P1-55 và P1-56:

- (P1-56, đã vá) `quest archive` và `quest cancel` nhận quest ở trạm quân y; khi Nhiếp chính đang chạy, mọi lệnh gửi qua CLI chờ một nhịp và in câu trả lời của nó (`stale` kèm cách xử lý, hay "đã áp dụng"); Nhiếp chính không chạy thì lệnh chờ trong hộp thư như cũ.
- (P1-55, đã vá) Quest ghép: `retry` từ trạm quân y đưa quest tới hiệp sĩ, không chạy lại lượt gộp của máy trên commit vừa trượt; lượt máy không tính vào `max_attempts`; sau khi hiệp sĩ gỡ xung đột và nộp, Nhiếp chính gộp nốt các phần còn chờ trước check; người chấm khác model với mọi người từng làm quest; mỗi phiên chấm của một lượt có thư mục riêng `.runs/<quest>-<n>/verify`, `verify-2`, …
- (P1-55, đã vá) File nháp nhân vật lỡ tạo ở gốc đất riêng (tên có `tmp`/`temp`, đuôi `.tmp`, `.bak`…) không vào commit của Nhiếp chính: nó được chuyển sang `.runs/<quest>-<n>/set-aside/`, plot sạch. Commit bị hook của repo từ chối thì phần đã stage được chép ra `.runs/<quest>-<n>/wip.patch`, và quest chưa có `handover.md` có chữ thì Nhiếp chính viết một thư tối thiểu (file đã sửa, đoạn cuối output của hook); phần dở vẫn nằm đã stage trong plot.
- (fix/party-part-seal, đã vá) Phần của đội mà bản nháp bỏ trống `seal_required` không chờ dấu, kể cả dạng `build`, `refactor`; chỉ quest ghép chờ dấu của chủ nhân. Phiên người làm bị cầu dao cắt (trần token, thời gian, lượt…) mà không để lại thư thì Nhiếp chính viết thư tối thiểu: trip, SHA commit WIP hay vì sao chưa commit, các file đất đã đổi. Prompt pháp sư mới tới vương quốc qua `elvaria upgrade`.
- (fix/stop-letter, đã vá) Thư tối thiểu đó kèm thêm diff của nhánh từ chỗ quest bắt đầu, cắt ở 4 000 ký tự, đã che giá trị secret của phiên và các mẫu secret. Ở lần chạy (J) của PS-08d, phiên 1 đã sửa xong hai file rồi bị cắt; thư chỉ nêu tên file nên phiên 2 đọc lại code tới hết ngân sách mà không sửa gì.

## 11. Bài học: kinh, gazetteer, chiếu chỉ, prompt nghề

Bốn loại file văn bản mà mọi phiên đọc lúc mở; sửa xong thì phiên **kế tiếp** nhận, không cần dừng Nhiếp chính.

| File | Dành cho | Ghi gì |
|---|---|---|
| `decree.md` | mọi nhân vật, mọi tộc | chỉ dẫn chung của bạn (ví dụ luật viết commit). Nhân vật không đọc `~/.claude/CLAUDE.md` của bạn |
| `territories/<id>/gazetteer.md` | mọi phiên trên lãnh thổ đó | điều riêng của repo mà CLAUDE.md của nó không nói: file lớn và cách đọc, stack Docker dùng chung, file sinh ra |
| `temple/scripture.md` | mọi nhân vật | bài học rút từ những lần bị chấm trượt, mỗi dòng một điều kiểm được |
| `characters/<id>/scripture.md` | một nhân vật | bài học của riêng nó |
| `registry/prompts/<nghề>.md` | mọi nhân vật của nghề | cách làm của nghề; bản mặc định theo bản Elvaria (§13) |

Giữ ngắn: mọi dòng vào prompt của mọi phiên, và với tộc gemini prompt đi trên dòng lệnh (Windows dừng ở 32 767 ký tự). Kinh là điều nhân vật học từ chính việc của nó (ADR 0020); bài học về cách bạn điều phối thì không phải kinh.

**Phân loại trước khi viết** (bước 0 của [plans/lesson-sharing.md](../plans/lesson-sharing.md) §8, (178)). Hỏi bài học còn đúng ở đâu ngoài vương quốc này, rồi đặt nó ở bậc cao nhất được:

1. **Về chính Elvaria** (thư bàn giao, mục Not done, luật đạt của người chấm, đất nháp, commit của Nhiếp chính, cách pháp sư chia kế hoạch): sửa repo Elvaria, không viết kinh. Theo thang sửa lỗi: check hay script nếu máy làm được; không thì một câu trong mẫu prompt của `packages/runner-core/prompts/` hay prompt nghề của `packages/registry-default/prompts/`, đúng vai mà bài học nói tới; dữ kiện đã đo của một tộc trên một hệ điều hành thì vào adapter của tộc đó. Mọi vương quốc nhận khi `elvaria upgrade` (§13). Trong lúc chờ nhánh sửa merge, một dòng kinh tạm được: ghi vào §11 nhánh nào sẽ thay nó, và gỡ dòng sau `upgrade`.
2. **Về một repo** (lệnh, file lớn, file sinh, quy ước): vào địa chí của lãnh thổ, hay tốt hơn vào tài liệu của chính repo đó, đi theo repo bằng git.
3. **Còn lại** mới là kinh: thói quen làm việc, dữ kiện về một công cụ ngoài, dữ kiện về một tộc chưa đủ chắc để vào adapter. Phạm vi ở đầu câu: vai ("As a judge, …"), tộc và hệ điều hành ("As a Codex judge on Windows, …"), phiên bản CLI khi dữ kiện phụ thuộc nó. Không đường dẫn, tên repo, id quest hay tên nhân vật trong câu.

Mẫu tốt của loại 3 trong vương quốc thật: "lỗi lúc dựng container là lỗi môi trường, không phải test đỏ", "file lớn hơn khoảng 50 KB: tìm rồi đọc đúng đoạn". "Không để file nháp trong đất riêng" (P1-50) là bài học về Elvaria: nay nằm trong luật 3 của người làm (fix/lesson-step-0).

## 12. Sửa tay cấu hình của vương quốc

Được sửa tay: `kingdom.json` (phần `dispatch`, `mana`, `breakers`, `tribes[].max_concurrent`, `pools`), `territories/<id>/territory.json`, `registry/**`, và các file ở §11. Nhiếp chính đọc lại `kingdom.json`, registry và lãnh thổ ở mỗi nhịp, nên không cần dừng nó. **Không** sửa tay `quests/*.json`, `characters/*/character.json`: dùng `quest edit`, `character level|model|suspend|release`.

Cách P1-50 làm mỗi lần sửa, và nên giữ:

1. Chép file vào `.backup/<ngày giờ>-<nhãn>/` trước.
2. Ghi nguyên tử (ghi ra file tạm cạnh nó rồi đổi tên), để Nhiếp chính không đọc phải file dở.
3. So với bản sao: chỉ khác đúng dòng định sửa.
4. `elvaria doctor` vẫn "Sẵn sàng."; file sai schema thì `doctor` và `territory list` báo ngay.

Núm hay vặn:

| Trường | Mặc định | Khi nào đổi |
|---|---|---|
| `dispatch.max_background` | 2 | về 1 khi các check của lãnh thổ dùng chung một stack Docker (§14) |
| `territories/<id>` `max_concurrent` | 1 | lên 2 khi muốn hai quest cùng làm trên một lãnh thổ, và check chịu được |
| `tribes[].max_concurrent` | claude 2, gemini 1 | theo số phiên tài khoản chịu được cùng lúc |
| `mana.cap_pct`, `king_reserve_pct` | 98, 2 | để dành nhiều hơn cho việc của chính bạn trên cùng tài khoản |
| `breakers.max_attempts`, `attempt_minutes_low/high` | 3, 45/120 | hiếm; thường đổi trên từng quest bằng `quest edit` |

## 13. Sau mỗi lần cập nhật bản build: `elvaria upgrade`

Từ PS-04b, vương quốc chạy bằng một **bản ghim**: một worktree tách rời của repo Elvaria ở một commit, tại `<vương quốc>/.builds/<sha>/`, đã cài và đã build hook; con trỏ ở `.state/build.json` giữ bản đang ghim và bản trước. Mọi lệnh trên vương quốc đó (`run`, `say`, `quest add`, `migrate`…) tự chạy lại bằng bản ghim, dù bạn gõ nó từ checkout nào; `--here` chạy bằng chính mã bạn gõ, và `upgrade` luôn chạy bằng mã bạn gõ. Checkout chính chỉ còn là lối vào và là nguồn để dựng bản: pull hay sửa nó không đổi gì của vương quốc cho tới lần `upgrade` kế.

Khi `main` của Elvaria có thay đổi ở `packages/` hay `apps/` mà bạn muốn dùng:

1. **Dừng Nhiếp chính** lúc không phiên nào chạy. `upgrade` từ chối khi Nhiếp chính đang chạy hay còn phiên của một Nhiếp chính đã dừng (`doctor` nêu tên chúng), và giữ khóa của Nhiếp chính suốt lúc dựng và thử, nên `elvaria run` gõ trong lúc đó bị từ chối.
2. `git pull --ff-only` trong checkout chính, rồi `pnpm install --frozen-lockfile` và `pnpm --filter @elvaria/cli build` ở đó: lối vào phải đọc được vương quốc, và phải biết việc ghim (CLI build trước PS-04b không biết, nó chạy mọi lệnh bằng chính nó).
3. `elvaria upgrade` (mặc định `--ref main` của repo mà lệnh chạy từ đó; một commit, nhánh hay tag khác thì `--ref`). `main` ở đây là nhánh local của checkout, không phải `origin/main`, và `upgrade` không tự fetch: checkout chính chưa pull được (phiên khác đang làm trong đó) thì `git fetch origin` rồi `elvaria upgrade --ref origin/main` (lần chạy thật (130), 22:51). Khi đó phép thử dưới đây chạy bằng mã chưa pull của checkout. Nó dựng bản mới (vài phút: `pnpm install`, build hook), rồi thử, 0 mana, trên **một bản sao cấu hình** của vương quốc (`kingdom.json`, `registry/`, lãnh thổ, nhân vật, adapter; không quest, log hay hộp thư), nên vương quốc chưa bị ghi gì: `migrate` của bản mới, rồi `doctor` của nó, rồi bộ test hợp đồng của từng tộc đang bật với CLI giả mà bản mang theo (tộc dùng adapter file thì bỏ qua, có ghi); sau cùng một quest bậc script trên một vương quốc tạm. Qua hết mới chuyển con trỏ, rồi chạy `migrate` của bản mới trên vương quốc thật và in các dòng của nó; bản trước giữ lại, bản cũ hơn bị xóa. Hỏng ở bước thử nào thì con trỏ không đổi, bản mới bị xóa, và output của bước hỏng in ra; `doctor` của bản mới lỗi vì máy (đăng nhập hết hạn) thì sửa máy rồi chạy lại. Từ fix/held-tribe-sessions, tộc mà Nhiếp chính của bản mới tự giữ (CLI đã ghim không còn hay đổi bản so với lần `tribe check` thật gần nhất, như codex sau một lần VS Code cập nhật ngày 2026-11-14) chỉ là cảnh báo ở bước `doctor` này, nên `upgrade` vẫn chuyển; sau khi nâng, `elvaria doctor` vẫn báo lỗi tộc đó, chạy `elvaria tribe check <tộc>` (CLI thật, tốn chút mana) trước khi giao việc cho tộc. Phép thử là mã của `upgrade` bạn gõ (checkout chính sau bước 2), còn `doctor` là của bản mới: cả hai phải có thay đổi đó, nên nâng tới một `--ref` cũ hơn thì tộc bị giữ vẫn chặn như trước.
   `migrate` chuyển file cũ lên phiên bản mới (bản cũ vào `.backup/<stamp>/`), chép file registry mà vương quốc còn thiếu (từ PS-02 có `registry/memos.json`: thiếu nó thì registry không nạp, `doctor` báo lỗi và `run` không chạy) và thêm mục registry còn thiếu; nó **không ghi đè** file bạn đã có. Sau `migrate`, chính `upgrade` (fix/kingdom-upkeep) so mặc định của `registry/` giữa bản trước (con trỏ `previous`, còn ở `.builds/<sha>/`), bản mới và vương quốc: từng file prompt nghề (`prompts/*.md`) và script catalog (`scripts/*.mjs`), và từng mục của sáu file dữ liệu (`rituals.json`, `kinds.json`…) theo id. File hay mục mà bản mới đổi và vương quốc còn giữ đúng mặc định của bản trước thì được chép bản mới vào, bản cũ vào `.backup/<stamp>-registry/`. File hay mục bạn đã sửa (khác cả hai bản) thì giữ nguyên: `upgrade` nêu tên kèm lệnh `git diff --no-index -- "<mặc định cũ>" "<mặc định mới>"` cho thấy phần mặc định đã đổi, bạn chép tay theo §12. Mục JSON chỉ được chép khi registry có chúng vẫn nạp được (không thì nêu và không ghi gì). Lần `upgrade` đầu, hay khi bản trước không còn trên đĩa, thì không so được: `upgrade` nói vậy, bạn so tay. `--rollback` không trả lại các file này: bản cũ cần thì lấy từ `.backup/<stamp>-registry/`. `migrate` thật hỏng sau khi đã chuyển (hiếm: nó vừa qua trên bản sao) thì bản mới vẫn ghim, `upgrade` nói lý do: sửa rồi chạy `elvaria migrate`, hoặc `--rollback`.
4. `elvaria doctor` in "Sẵn sàng." và dòng "Bản ghim <sha>; bản trước <sha>"; nó nêu khóa registry mà bản mặc định có còn vương quốc thiếu.
5. `elvaria run`: dòng đầu nêu bản ghim nó chạy.

**Bản mới hỏng sau khi đã chuyển**: dừng Nhiếp chính, `elvaria upgrade --rollback` (về đúng bản trước, không dựng gì; còn phiên dở thì nó chỉ nêu, `run` kế tiếp dọn), rồi `elvaria run`. `migrate` của bản mới đã chạy trên vương quốc: file nó nâng phiên bản thì bản cũ không đọc được (lấy lại từ `.backup/<stamp>/` trước khi chạy), còn file và dòng log mà bản cũ không biết (một file registry mới, một loại event mới) thì nó bỏ qua; dòng log của một loại cũ có thêm trường mới thì bản cũ bỏ qua kèm cảnh báo, và quest hay nhân vật có trường mới thì Nhiếp chính cũ bỏ qua cho tới khi nâng cấp lại. Muốn quay lại bản vừa bỏ: `elvaria upgrade --ref <sha>` (nó thử lại, không dựng lại). Riêng một lần tăng `v` của event thì không lùi qua được: các bản dựng trước commit `534b105` (như `6a142ec`) chỉ nhận `v: 1`, từ `534b105` event ghi `v: 2`, nên sau `--rollback` qua mốc đó bản cũ không đọc được các dòng log ghi từ lúc nâng. Nâng qua một mốc như vậy thì sao lưu cả `events/` trước, và coi lần nâng là một chiều.

**Trường mới viết tay**: chỉ thêm một trường mới vào `kingdom.json`, `territory.json` hay `registry/` (bằng tay, hay bằng một lệnh `--here` của mã mới hơn) sau khi `upgrade` đã ghim một bản biết trường đó. Schema của các file này là strict: bản ghim cũ gặp một khóa lạ thì không nạp file, `doctor` báo lỗi và `run` không chạy (chủ nhân chốt thứ tự này ngày 2026-11-08, sau P1-24 và P1-28, cho luật mới của `territory.json`; gặp thật ngày 2026-11-14: `tribe check --here` ghi `tribes[].tool.checked_version` mà bản ghim `5253688` không đọc được, phải nâng ngay).

**Lần đầu**: vương quốc chưa ghim thì mọi lệnh chạy từ checkout bạn gõ, như ở giai đoạn 1; lần `upgrade` đầu ghim bản `main` và từ đó áp dụng như trên. Hook của các phiên lấy từ bản ghim, nên checkout chính không cần build hook nữa (vẫn cần nếu bạn chạy `--here`).

**Sau lần nâng lên một bản có PS-06** (Nghị hội): `migrate` không đổi một nghi thức vương quốc đã có, nên bước `check_plan_ready` của `council_review` chưa tới vương quốc. Từ fix/kingdom-upkeep, `upgrade` tự chép nghi thức và hai prompt dưới đây khi vương quốc còn giữ đúng mặc định của bản trước; các bước sau chỉ còn cần khi bạn đã sửa chúng, hoặc bản trước không còn trên đĩa. Làm theo thứ tự, lúc Nhiếp chính dừng:

1. `elvaria upgrade` trước: bản ghim cũ từ chối registry có một bước nghi thức nó không biết.
2. Ở checkout của repo Elvaria: `node scripts/ritual-steps.mjs --kingdom <vương quốc> --dry-run` in các bước hiện có và các bước mới; bỏ `--dry-run` để ghi. Script chép `registry/rituals.json` vào `.backup/<giờ>-ritual-steps/` trước, chỉ đổi `steps` của nghi thức đó, và từ chối khi bạn đã sửa các bước theo cách khác (`--force` thay hẳn).
3. `registry/prompts/mage.md` (mẫu `plans/<chủ đề>.md`, mẫu đề bài, `estimate.context`) và `registry/prompts/chancellor.md` đổi ở PS-06: chép bản mới vào vương quốc theo §12 (sao lưu, so). Mẫu đề bài và cách ước lượng đến với pháp sư từ bản ghim kể cả khi chưa chép, nhưng `mage.md` cũ vẫn dạy `seal_required` bắt buộc và không có mẫu `plans/`. Từ PS-06b check `subquests` trả về kế hoạch có file `plans/` thiếu một mục của mẫu (Summary, Survey, Shared decisions, Sub-quests, Done when, Unknowns): chưa chép `mage.md` mới thì kế hoạch đầu tiên gần như chắc bị trả một lần.
4. `elvaria doctor` in "Sẵn sàng.".

**Sau lần nâng lên một bản có PS-11** (nghi thức xem ảnh): `migrate` thêm nghi thức `visual_review` (bước mới `compare_screens`; bản ghim cũ từ chối registry có nó, nên `upgrade` trước như mọi lần) và tag `visual`. Ba mục của `registry/kinds.json` là giá trị đổi trong mục đã có: `upgrade` chép khi vương quốc còn giữ đúng mặc định của bản trước, không thì nêu tên và bạn thêm tay vào `ritual_overrides`, **sau** mục `e2e`/`integration` (quest mang cả hai giữ Thả quái thử thành): `build` và `refactor` thêm `{ "tags_any": ["visual"], "ritual": "visual_review" }`; `fix` (chưa có `ritual_overrides`) thêm `"ritual_overrides": [{ "tags_any": ["visual"], "ritual": "visual_review" }]`. **Đừng gắn tag `visual` trước khi PS-11b vào bản ghim**: chỉ người chấm thuộc tộc mà adapter khai `vision` (CLI đọc được ảnh; `tribe list` in nó trong cột năng lực) nhận quest đó, và trước PS-11b không adapter nào khai, nên quest gắn `visual` đứng ở `review` mãi, chuông `unjudgeable` và bản tấu (`unjudgeable_vision`) nói nó chờ một người chấm đọc được ảnh. Tể tướng và pháp sư thấy tag này trong danh sách tag như mọi tag, và `quest edit` không đổi tag: bản nháp mang `visual` thì đừng xác nhận, hủy nó và ra lại nhiệm vụ không có tag đó. Từ bản có PS-11b cả ba adapter khai `vision`: gắn `visual` khi lãnh thổ đã có check chụp ảnh (mục «Check chụp ảnh của lãnh thổ» ở §3).

Thay đổi chỉ ở `docs/` thì không cần làm gì. Khi repo Elvaria cũng là một lãnh thổ, checkout chính là gốc của worktree quest mới, còn code của Nhiếp chính nằm trong bản ghim: `pull` chỉ đổi điểm tách của quest mở sau đó.

## 14. Bài học vận hành của lần chạy lại mốc (P1-50)

26 lần chủ nhân can thiệp trong một ngày, theo nhóm ([báo cáo](phase-1-rerun.md) §4). Mỗi dòng: chuyện gì, và hôm nay làm gì cho tới khi task vá xong.

| Nhóm | Chuyện đã xảy ra | Hôm nay làm gì | Vá ở |
|---|---|---|---|
| Trần token (10 lần) | sàn hạng D, C, B thấp cho việc web nhiều file; mỗi lần cắt là một lần `edit` và `retry` | nâng trần trước khi xác nhận (§4) | P1-54 |
| Docker (5 lần) | Docker Desktop chưa chạy: `commands.reset` đỏ, bài bị chấm trượt, người làm bị hạ cấp | `doctor` cảnh báo Docker không chạy (P1-56); trả cấp bằng `character level` | P1-54, P1-56 (xong) |
| Docker | `reset` của quest này (`docker compose … down -v`) hạ stack e2e của quest kia ba lần; e2e đỏ bị đọc là chập chờn, Nhiếp chính sinh quest «Trừ tà» và hạ cấp người làm | `dispatch.max_background: 1` với lãnh thổ có stack Docker dùng chung; hủy sớm quest «Trừ tà» sinh từ lỗi dựng container | P1-54 |
| Người chấm (3 lần) | một trần mana đóng làm bài của một model không còn ai chấm | giữ hai người chấm khác model cho mỗi model người làm (§3); xem `doctor` khi quest chờ nghiệm thu lâu | PS-03 (chuông); P1-56 (cảnh báo của `doctor`, xong) |
| Việc nền | check 6 giây của một quest tài liệu chờ 41 phút sau các bộ e2e; người chấm sau check đỏ chờ khóa 9–33 phút | xác nhận quest nhỏ trước đợt có e2e, hoặc chấp nhận chờ | P1-54 |
| CLI thiếu đường (5 lần) | xem §10 | xem §10 | P1-55 (xong), P1-56 (xong) |
| Quyền của nghề và lãnh thổ (2 lần) | nhân vật không ghi được `.claude/rules/`; thư ký được bảo chạy `git log` | `laws.patch_paths` (§3; `territory add` và `doctor` gợi ý từ P1-56); mô tả không đòi lệnh mà nghề không có (§4) | P1-56 (xong), PS-06 |
| File lớn | trinh sát tộc gemini đọc một file 1 MB 25 lần, bị cắt hai lượt | từ P1-53 tộc gemini có `git grep`; ghi file lớn vào gazetteer (§11) | P1-52, P1-53 (xong) |
| agy | người chấm in một JSON giữ chỗ giữa câu trả lời, phán quyết thành "dở", mất một phiên chấm | từ P1-56 runner lấy JSON cuối của câu trả lời và bỏ ghi chú giữ chỗ: người chấm không ra phán quyết thì người chấm kế tiếp mở, không còn phán quyết "dở" từ một ghi chú giả | P1-56 (xong) |

Ba điều không phải lỗi, nhưng nên biết trước:

- **Người chấm hạng thấp tốn hơn người làm**: ở hạng E, người chấm tự chạy lại mọi check và tốn gấp 4 lần người làm; từ hạng D trở lên thường 0,1–0,5 lần.
- **Nghi thức Thả quái thử thành** (quest có tag `e2e` hay `integration`) chạy cả bộ check ba lần trong đất nháp: 45–75 phút phần máy trên dc1 trước khi người chấm mở.
- **Một ngày 88 phiên** đưa hạn mức tuần của tài khoản Claude (dùng chung với việc khác) từ 52 % lên 65 %, và đốt gần hết trần tuần Argon.

## 15. Chưa có ở giai đoạn 1

Chuông ngoài terminal, điện thoại, bản đồ (giai đoạn 2 và 3); quest Hợp nhất khi conflict (PS-09b), merge quest không qua dấu (PS-08b); Tể tướng tự phân loại thư (PS-03b); tộc Gemini CLI với API key và tộc Codex (P1-12c, P1-12d, để dành). Kế hoạch và trạng thái: [implementation-plan](../implementation-plan.md) §8.
