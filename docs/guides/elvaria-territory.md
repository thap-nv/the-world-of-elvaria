# Lãnh thổ Elvaria: file nóng và vùng file

Ngày 2026-11-12, PS-05 ([kế hoạch giai đoạn 1.5](../plans/phase-1.5.md) mục PS-05, [ADR 0028](../adr/0028-plan-review-and-scope-paths.md)). Ai đọc: chủ nhân, phiên đặt `territory.json` của lãnh thổ `elvaria` (PS-07 đặt danh sách dưới đây vào vương quốc; PS-05 không sửa vương quốc nào), và PS-04, task thêm mục `protected_paths` của lãnh thổ này vào cùng file.

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

## Bẫy

- `union` với file JSON (glossary, locale) có thể để lại JSON hỏng (thiếu dấu phẩy giữa hai khối cùng thêm ở cuối). Sau khi ghép phải chạy lại check: `pnpm i18n:check`, `pnpm docs:check`; PS-09 chạy lại check của lãnh thổ sau mỗi lần ghép.
- Vùng khai quá rộng (`packages/**`) giao với mọi quest khác và làm lãnh thổ chạy từng quest một; vùng khai thiếu thì người chấm thấy file ngoài vùng. Khai theo thư mục của việc (`packages/domain/src/dispatch/**`), không theo package.
- Ví dụ thật: PS-05 và PS-03 cùng sửa `packages/domain/src/dispatch/plan-tick.ts`; với vùng khai đúng, R3 cho quest sau chờ quest trước được lưu trữ, thay vì hai nhánh conflict khi merge.
