---
paths:
  - 'apps/cli/**'
---

# Luật · CLI / Rules · apps/cli

Áp dụng khi sửa `apps/cli/**`; cộng thêm vào [CLAUDE.md](../../CLAUDE.md).

## Ghi trạng thái (ADR 0005)

CLI ghi lệnh vào `inbox/<ulid>.json`, không ghi trạng thái quest. Ngoại lệ đã chốt, chỉ ở `apps/cli`: `init`, `doctor` và `tribe add|check|disable|look` ghi `kingdom.json`, `territory add` ghi file lãnh thổ, `character add` tạo file nhân vật mới (chỉ tạo, không ghi đè).

## Ảnh hưởng thay đổi

| Bạn đụng vào                                                          | Phải chạy                                                          |
| --------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `apps/cli/src/commands.ts`, `CommandSpec` của một lệnh, chuỗi `cli.*` | `pnpm --filter @elvaria/cli test`, `pnpm docs:gen` (`docs/cli.md`) |
