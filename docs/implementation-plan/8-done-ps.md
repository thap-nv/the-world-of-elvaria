# Kế hoạch triển khai Elvaria · §8, task đã xong: Chặng tự cường — task `PS-…` (kế hoạch sản phẩm 0.8 mục 14, §3.16)

Một phần §8 của [kế hoạch triển khai](../implementation-plan.md): dòng của các task đã xong, theo thứ tự của bảng. Task chưa xong ở bảng §8 của file chính; `pnpm plan:split` chuyển dòng xong từ đó sang cuối bảng này.

### Chặng tự cường — task `PS-…` (kế hoạch sản phẩm 0.8 mục 14, §3.16)

| # | Task | File chạm | Xong khi | Trạng thái |
|---|---|---|---|---|
| PS-01 | **Sổ đo, phần đọc** ([plans/phase-1.5.md](../plans/phase-1.5.md) mục PS-01; §3.16.1, ADR 0027): `metricsOf` và bảng nguyên nhân làm lại trong domain; bộ đọc và lệnh `elvaria metrics`; `docs/metrics-report.md` qua `docs:gen --kingdom`. Mở trước P1-51 (chốt 2026-11-11) | `p/domain/src/metrics/**` (mới), `a/cli/src/metrics/**` (mới), `scripts/docs-metrics-report.mjs` và các chỗ của một tài liệu sinh mới, glossary, locale. Không đổi schema; không đổi cách tính của `tier-report`. File thật: `p/domain/src/metrics/` (`causes`, `window`, `rework`, `judgement`, `rates`, `ledger`, `metrics-of` + spec, fixture), `p/domain/src/index.ts`, `a/cli/src/metrics/` (`read`, `view`, `metrics` + spec), `a/cli/src/commands.ts`, `scripts/docs-metrics-report.mjs` + spec, `scripts/docs-gen.mjs`, `scripts/docs-tier-report.spec.ts`, `.claude/hooks/guard-edit.mjs` + spec, `glossary.json`, `vi.json`, `en.json`, README của domain, cli, scripts, `CLAUDE.md`, `docs/cli.md`, `docs/glossary.md`, `docs/metrics-report.md` | domain 100 %; trên vương quốc thật, `elvaria metrics` cho ngày 2026-11-08 ra 49 phiên và 19 lượt làm lại; bảng phân loại máy đặt cạnh 12 / 6 / 1 của [báo cáo giai đoạn 1](../guides/phase-1-report.md) §6 (phân loại tay theo nguyên nhân gốc), từng chỗ lệch có giải thích ở §11 | xong (2026-11-11, 76d5772) |
