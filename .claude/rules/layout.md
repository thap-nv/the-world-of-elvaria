---
paths:
  - 'packages/**'
  - 'apps/**'
---

# Luật · bố cục thư mục / Rules · folder layout

Áp dụng khi thêm, đổi tên hay xóa file trong `packages/` và `apps/`. Luật đầy đủ R1–R8 và ba ngưỡng: [implementation-plan §4.2](../../docs/implementation-plan/4-code-quality.md) mục "Luật thư mục R1–R8"; lý do: [plans/architecture-health.md](../../docs/plans/architecture-health.md) mục "Cấu trúc đích" (AH-02).

## Trước khi tạo file

- Đặt file vào thư mục khái niệm của nó (`src/<khái-niệm>/`, tên số ít, id glossary). Gốc `src/` chỉ cho phần ráp nối: `index.ts`, file ráp, `types.ts` và `constants.ts` dùng chung. Không có thư mục khái niệm hợp thì tạo một, đừng thả file ở gốc.
- Ngưỡng file chạy (không tính spec và fixture): gốc `src/` ≤ 20, ≤ 10 khi package trên 40 file chạy; mọi thư mục khác ≤ 30 file trực tiếp.
- Spec đứng cạnh file nó thử; spec kịch bản vào thư mục khái niệm, kịch bản qua nhiều khái niệm vào `src/flows/`.
- Đồ dùng test: mã TS ở `src/**/__fixtures__/`, dữ liệu và chương trình giả chạy như tiến trình ở `<package>/fixtures/`. Không tạo thư mục `test/`.
- Không đặt `x.ts` cạnh `xs.ts`, không đặt tên vì trần (`-types`, `-more`, `-2`): tách theo khái niệm.
- Thứ đã có ở package khác thì chuyển về nhà chung (R7), không chép.

## Cổng `pnpm layout`

- `pnpm layout` (trong `pnpm check` và `pnpm check:changed`) đỏ khi có vi phạm R2, R3, R4 hay cặp tên của R6 không nằm trong `layout-baseline.json`, hay một số đếm vượt số ghi.
- Danh sách chỉ được giảm. Dọn xong một chỗ thì cổng cũng đỏ cho tới khi chạy `pnpm layout --prune` (chỉ hạ, không thêm) và commit file đó cùng commit dọn. Đừng sửa tay để thêm dòng: `scripts/src-layout.spec.ts` đỏ khi danh sách lớn lên so với chỗ nhánh tách khỏi `main`.
- Cổng đỏ vì một file mới thì chuyển file vào thư mục khái niệm; ngưỡng sai cho một trường hợp thật thì hỏi chủ nhân, đừng nới.

## Độ phức tạp của hàm

ESLint `complexity` 15 cho mọi file mã (K9). Hàm cũ vượt ngưỡng nằm ở `eslint-suppressions.json`, theo cùng luật với các luật thời gian của spec ([tests.md](tests.md)): sửa một hàm xuống dưới ngưỡng thì chạy `pnpm exec eslint --prune-suppressions <file>`; không `--suppress-rule complexity` cho hàm mới, tách hàm.
