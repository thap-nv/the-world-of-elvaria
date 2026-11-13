# Lãnh thổ Elvaria: file nóng, vùng file và vùng bảo vệ

Ngày 2026-11-12, PS-05 ([kế hoạch giai đoạn 1.5](../plans/phase-1.5.md) mục PS-05, [ADR 0028](../adr/0028-plan-review-and-scope-paths.md)). Ai đọc: chủ nhân, phiên đặt `territory.json` của lãnh thổ `elvaria` (PS-07 đặt danh sách `shared_paths` dưới đây vào vương quốc; PS-05 không sửa vương quốc nào). Mục "Vùng bảo vệ" thêm ngày 2026-11-13, PS-04 ([kế hoạch giai đoạn 1.5](../plans/phase-1.5.md) mục PS-04, [ADR 0026](../adr/0026-guarded-self-change.md)); PS-04 cũng không sửa vương quốc nào: phiên điều phối đặt danh sách `protected_paths` sau khi PS-04 vào `main`, có sao lưu và hỏi chủ nhân.

## Vùng file và file nóng

Mỗi quest có thể khai `scope_paths`: các glob, tính từ gốc lãnh thổ, của những file nó sẽ sửa (`elvaria quest add --scope <glob>`, lặp lại cho nhiều glob; `quest edit --scope` thay cả vùng; Tể tướng và pháp sư khai khi soạn). Trong một lãnh thổ, Quản sự xếp việc theo ba luật (§3.16.5):

- **R1**: số quest đang làm nhỏ hơn `max_concurrent`, như trước.
- **R2**: quest bậc phiên không khai vùng chỉ bắt đầu khi lãnh thổ không có quest bậc phiên nào đang làm, và khi nó đang làm thì không quest nào bắt đầu. Khi nó đang chờ lãnh thổ trống, quest có vùng xếp sau nó trong hàng không bắt đầu, để nó không chờ mãi.
- **R3**: quest có vùng chờ khi một quest đang giữ vùng giao với nó. Quest giữ vùng từ lượt chạy đầu tới khi được lưu trữ, kể cả lúc đã xong và chờ chủ nhân merge; quest mà đất riêng dựng trên nhánh của quest giữ vùng (phụ thuộc đã xong, phần của đội trên nhánh hợp đồng, quest ghép với các phần nó ghép) không phải chờ.

Quest bậc script đứng ngoài R2 và R3. `elvaria quest list` ghi bên trạng thái quest đang chờ ai; `quest show` in thêm một dòng.

Hai vùng "giao nhau" theo chữ của glob: phần chữ trước ký tự đại diện đầu tiên của glob này mở đầu phần chữ của glob kia (`packages/**` giao `packages/domain/src/x.ts`; `apps/api/**` không giao `apps/web/**`). Nghi ngờ thì tính là giao. **File nóng** là file mà mọi nhánh song song cùng sửa: đặt chúng trong `scope_paths` của từng quest thì quest nào cũng giao vùng nhau và R3 xếp tất cả thành hàng một. Chúng nằm trong `territory.shared_paths`: một mục của vùng nằm trong `shared_paths` không tính vào giao nhau, và file trong `shared_paths` không bao giờ là "file ngoài vùng". Mỗi mục nêu cách ghép, cho hàng đợi merge của PS-09: `regenerate` chạy `commands.generate` của lãnh thổ trên kết quả ghép, `union` giữ dòng của cả hai phía.

File đổi ngoài vùng (trừ `shared_paths`) không làm quest trượt: Quản sự ghi chúng vào dòng `quest.submitted` (`data.out_of_scope`), đưa vào prompt người chấm (mục "Files changed outside the scope", giữa thư bàn giao và diff), và `elvaria metrics` đếm chúng.

## Danh sách `shared_paths` của lãnh thổ Elvaria

Theo bài học điều phối giai đoạn 1 (lượt soát kế hoạch giai đoạn 1.5 ngày 2026-11-12) và dòng gazetteer của lãnh thổ `elvaria` cùng ngày: các nhánh song song gặp nhau ở bảng §8 và cuối file §11 của kế hoạch triển khai, chỉ mục của domain, glossary, hai file locale và bảng lệnh của CLI; file sinh thì sinh lại.

```json
"commands": {
  "generate": ["pnpm schemas", "pnpm docs:gen"]
},
"shared_paths": [
  { "glob": "docs/implementation-plan.md", "merge": "union" },
  { "glob": "docs/implementation-plan/11-*.md", "merge": "union" },
  { "glob": "packages/domain/src/index.ts", "merge": "union" },
  { "glob": "packages/i18n/src/glossary.json", "merge": "union" },
  { "glob": "packages/i18n/src/locales/vi.json", "merge": "union" },
  { "glob": "packages/i18n/src/locales/en.json", "merge": "union" },
  { "glob": "apps/cli/src/commands.ts", "merge": "union" },
  { "glob": "docs/schemas/**", "merge": "regenerate" },
  { "glob": "docs/glossary.md", "merge": "regenerate" },
  { "glob": "docs/events.md", "merge": "regenerate" },
  { "glob": "docs/cli.md", "merge": "regenerate" },
  { "glob": "docs/dependency-graph.md", "merge": "regenerate" }
]
```

- `docs/implementation-plan.md` giữ bảng §8 (dòng task chưa xong) và §10; các file `11-<ngày>.md` nhận dòng §11 mới ở cuối. Vùng `<!-- docs:gen plan-index -->` của file chính là phần sinh: sau khi ghép `union`, `pnpm docs:gen` sinh lại nó.
- `apps/cli/src/commands.ts` không có trong danh sách của kế hoạch: thêm theo lời phiên điều phối khi mở PS-05 (bảng lệnh là chỗ chung của mọi task thêm lệnh).
- Lãnh thổ có mục `regenerate` thì phải có `commands.generate` (schema territory từ chối nếu thiếu). `pnpm schemas` chạy trước `pnpm docs:gen`.
- Chưa vào danh sách: snapshot prompt của `packages/runner-core/src/prompt/__snapshots__/` (task nào đổi prompt cũng đổi chúng, nhưng không lệnh `generate` nào sinh lại chúng: sinh bằng `vitest -u`), và `docs/plans/phase-1.5.md` (mỗi task sửa mục của mình, hiếm khi cùng một đoạn). Xét lại khi PS-09 đo được số conflict thật.

## Vùng bảo vệ

`laws.protected_paths` (tùy chọn) là các glob, tính từ gốc lãnh thổ, của thứ canh giữ thế giới: luật, check, người chấm, sổ đo, bản nâng cấp. Khác `forbidden_paths`, vùng bảo vệ không chặn gì: nhân vật vẫn đọc, sửa, và Quản sự vẫn commit. Ở mỗi lần nộp, Quản sự đọc thay đổi của đất riêng (cùng lần đọc với `forbidden_paths`, từ lúc đất riêng tách nhánh, cả file chưa commit) và khớp chúng với `protected_paths` theo cùng cách: glob khớp ở mọi độ sâu, nên `CLAUDE.md` cũng nêu `packages/x/CLAUDE.md`; thà chờ dấu nhầm. Khi có đường dẫn khớp:

- quest được đặt `protected_changes` (các đường dẫn đã chạm, gộp qua mọi lần nộp) và `seal_required: true` (bất kể `seal_default` của dạng, kể cả dạng `analyze` hay `research`); phán quyết đạt thì quest chờ dấu vua (`awaiting_seal`) và chuông kêu như mọi quest cần dấu. Phần của một đội (`part`, phần test chấp nhận `acceptance`) thì chỉ được đặt `protected_changes`, không bắt dấu (chủ nhân chốt 2026-11-13): phần không bao giờ vào nhánh gốc một mình, và quest ghép của đội luôn cần dấu;
- người chấm được chọn như quest từ hạng B: sau luật khác họ model và khác tộc, người cấp cao hơn đứng trước (P1-48); luật tách vai không đổi;
- `elvaria quest show` có dòng "Vùng bảo vệ đã chạm" nêu các đường dẫn.

Dấu đã đặt thì không gỡ: lần nộp sau không còn chạm vùng bảo vệ vẫn giữ dấu, như máy không bao giờ hạ `seal_required` (một lần nhìn của chủ nhân rẻ hơn một thay đổi lọt vào thứ canh giữ). Lượt ghép của máy trong một đội cũng đọc thay đổi của mình: phần nào chạm vùng bảo vệ thì quest ghép mang `protected_changes` và được ưu tiên người chấm mạnh (quest ghép vốn luôn cần dấu), nên đọc kỹ các file đó ở dấu của quest ghép: đó là lần nhìn duy nhất của chủ nhân trên thay đổi của các phần. Quest bậc script không commit gì nên không bao giờ chạm.

### Danh sách `protected_paths` của lãnh thổ Elvaria

Theo §3.16.4 và [ADR 0026](../adr/0026-guarded-self-change.md): danh sách "Đọc trước khi sửa" của `CLAUDE.md`, cộng luật và cổng của repo (`.claude/**`, `CLAUDE.md`, `docs/adr/**`, `.github/**`, `packages/hooks/**`), mã sổ đo (`packages/domain/src/metrics/**`), ba file registry quyết định ai làm, ai chấm, chấm theo nghi thức nào, và (chủ nhân chốt 2026-11-12, sau PS-04b) phần thử của `elvaria upgrade`, vì nó quyết định bản nào được ghim. Chủ nhân chốt thêm ngày 2026-11-13 (đề xuất (b) của PS-04): cổng và preset lint của repo (`.husky/**`, `packages/config/**`) và prompt người chấm (`verifier.md`, `rejudge.md`).

```json
"laws": {
  "protected_paths": [
    "packages/domain/src/quest/transitions.ts",
    "packages/domain/src/quest/transition.ts",
    "packages/domain/src/quest/effects.ts",
    "packages/domain/src/verify/**",
    "packages/domain/src/mana/**",
    "packages/eventlog/src/redact*",
    "packages/runner-core/src/treasury/**",
    "packages/config/boundaries.mjs",
    "docs/schemas/**",
    "packages/domain/src/schema/**",
    ".claude/**",
    "CLAUDE.md",
    "docs/adr/**",
    ".github/**",
    "packages/hooks/**",
    "packages/domain/src/metrics/**",
    "packages/registry-default/rituals.json",
    "packages/registry-default/classes.json",
    "packages/registry-default/kinds.json",
    "apps/cli/src/upgrade/**",
    ".husky/**",
    "packages/config/**",
    "packages/runner-core/prompts/verifier.md",
    "packages/runner-core/prompts/rejudge.md"
  ]
}
```

- Thêm vào `laws` đang có của `territories/elvaria/territory.json` (giữ `forbidden_paths`, `patch_paths`…), không thay cả khối. Sao lưu file trước, rồi `elvaria doctor` để kiểm file còn đọc được.
- Glob thư mục viết `<thư mục>/**`: tên thư mục trần (`docs/adr`) không khớp file bên trong.
- `docs/schemas/**` vừa là file nóng (`shared_paths`, `regenerate`) vừa là vùng bảo vệ: hai luật độc lập. Quest đổi schema zod sinh lại `docs/schemas/**` và cần dấu; quest chỉ chạy `pnpm schemas` mà không đổi gì thì không chạm.
- Danh sách là dữ liệu: chủ nhân thu hẹp hay mở rộng bằng cách sửa file. Vương quốc đang ghim một bản trước PS-04 không đọc được lãnh thổ có trường này (`laws` là `strictObject`): chỉ thêm sau khi vương quốc ghim một bản có PS-04 (`elvaria upgrade`), và sau một lần `elvaria upgrade --rollback` về bản trước PS-04 thì gỡ nó đi.

## Bẫy

- `union` với file JSON (glossary, locale) có thể để lại JSON hỏng (thiếu dấu phẩy giữa hai khối cùng thêm ở cuối). Sau khi ghép phải chạy lại check: `pnpm i18n:check`, `pnpm docs:check`; PS-09 chạy lại check của lãnh thổ sau mỗi lần ghép.
- Vùng khai quá rộng (`packages/**`) giao với mọi quest khác và làm lãnh thổ chạy từng quest một; vùng khai thiếu thì người chấm thấy file ngoài vùng. Khai theo thư mục của việc (`packages/domain/src/dispatch/**`), không theo package.
- Ví dụ thật: PS-05 và PS-03 cùng sửa `packages/domain/src/dispatch/plan-tick.ts`; với vùng khai đúng, R3 cho quest sau chờ quest trước được lưu trữ, thay vì hai nhánh conflict khi merge.
