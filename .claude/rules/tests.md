---
paths:
  - '**/*.spec.ts'
---

# Luật · test / Rules · tests

Áp dụng khi sửa `*.spec.ts`; cộng thêm vào [CLAUDE.md](../../CLAUDE.md) ("Mỗi thay đổi có test đi kèm") và implementation-plan §6. Nguồn: đề xuất (a), (b) lấy từ repo Orca, chốt ở (196), làm ở nhánh `fix/test-guards`.

## Test phải đỏ được khi code sai

Một test chỉ có giá trị khi nó đỏ lúc code sai. Bốn kiểu dưới đây xanh dù code sai thế nào; đừng viết chúng. Người chấm gặp kiểu này thì coi thay đổi là chưa có test (prompt nghề `judge` của `registry-default`).

- **Lấy giá trị mong đợi từ chính mã đang thử**: gọi lại hàm đang thử, hay dựng giá trị mong đợi bằng cùng helper, cùng regex, cùng phép tính mà code dùng. Viết giá trị mong đợi bằng tay, suy từ đề bài (chuỗi, số, object literal).
- **Chỉ assert mock**: `expect(fake).toHaveBeenCalled()` mà không xem kết quả. Mock chỉ để dựng tình huống; assert điều người dùng thấy: file ghi ra, event, lệnh trong `inbox/`, dòng in ra, mã thoát.
- **Ghim hằng số**: `expect(LIMIT).toBe(5)` chỉ nhắc lại dòng khai báo. Test hành vi mà hằng số quyết định: tới ngưỡng thì dừng, dưới ngưỡng thì chưa.
- **Thử thư viện ngoài**: test rằng zod từ chối kiểu sai, `path.join` nối đường dẫn, git tạo commit. Test schema của mình (trường nào bắt buộc, giá trị nào bị từ chối) thì được, vì đó là hợp đồng của repo.

## Thời gian thật

- ESLint chặn trong `*.spec.ts` ([packages/config/eslint-test-time.mjs](../../packages/config/eslint-test-time.mjs)):
  - `elvaria/no-real-wait`: `setTimeout`, `setInterval` toàn cục hay import từ `node:timers` và `node:timers/promises` (kể cả đổi tên như `sleep`); vòng `while`, `do … while` có `await`; `expect.poll`, `vi.waitFor`, `vi.waitUntil`.
  - `elvaria/no-real-clock`: `Date.now()`, `new Date()` không đối số, `Date()`, `performance.now()`, `process.hrtime`.
  - `elvaria/timeout-reason`: timeout riêng của `it`, `test`, `describe`, hook hay `vi.setConfig` cần một comment nói vì sao, đặt ở dòng ngay trên lời gọi test, ngay trên timeout, trên cùng dòng với nó, hay cạnh khai báo của hằng số trong file mà timeout dùng. Comment ở cuối dòng cuối của thân test không tính.
- Thay vào đó: await chính sự kiện (một promise, `exit` của tiến trình con, một dòng output), hay `vi.useFakeTimers()`. File gọi `vi.useFakeTimers()` thì timer toàn cục và đồng hồ là giả, luật không báo; `vi.setSystemTime()` một mình chỉ giả `Date`. Timer import từ `node:timers` vẫn là thật.
- Vi phạm có trước luật nằm ở `eslint-suppressions.json` ở gốc repo (cơ chế bulk suppressions của ESLint, tự nạp). Danh sách chỉ được ngắn đi: file có nhiều vi phạm hơn số ghi thì lint đỏ; sửa xong một chỗ thì lint cũng đỏ cho tới khi chạy `pnpm exec eslint --prune-suppressions <file>`.
- Đừng chạy `--suppress-rule` hay `--suppress-all` để thêm vi phạm mới vào danh sách: `packages/config/suppressions.spec.ts` đỏ khi một số đếm hay tổng của một luật tăng so với chỗ nhánh tách khỏi `main`. Đổi tên một spec thì chuyển mục của nó sang tên mới; tổng không đổi nên test vẫn xanh. Một ca mới thật sự cần thời gian thật thì hỏi chủ nhân trước khi tắt luật cho dòng đó (CLAUDE.md cấm tắt luật khi chưa có chỉ thị).
