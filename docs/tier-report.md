# Ba bậc chạy việc: số đo

> Sinh từ event log của một vương quốc bằng `pnpm docs:gen --kingdom <thư mục>`; không sửa file này. Số đo để chỉnh `kingdom.json` (`breakers.subagent_max_turns`, `subagent_max_minutes`, `context_budget_tokens`): implementation-plan §3.12, ADR 0017.

Khoảng: 2026-11-07T19:20:38+07:00 → 2026-11-08T13:13:54+07:00; 2132 dòng event, 19 quest.

## Theo bậc

| Bậc | Quest | Lần chạy | Phiên | Token | Ghi chú |
|---|---|---|---|---|---|
| Script | 2 | 2 | 0 | 0 | không model, mana 0 |
| Học đồ | — | 0 | — | trong phiên | 0.0 phút; 0 lần bị cắt ở maxTurns; 0 lần quá giờ; 0 lời gọi tool |
| Phiên | 17 | 46 | 50 | 10842892 | 638 lượt; 1504 lời gọi tool của nhân vật |

Tỉ lệ: 11 % quest bậc script; 0 % quest có học đồ; 0 lần học đồ trên 50 phiên. Token của học đồ đã nằm trong token của phiên (`modelUsage` gộp). Ngoài quest (Tể tướng): 0 phiên, 0 token.

## Theo quest

| Quest | Bậc | Dạng | Trạng thái | Lần chạy | Phiên | Token | Học đồ | Bị cắt | Quá giờ |
|---|---|---|---|---|---|---|---|---|---|
| `q_20261107_efqmx9` | session | build | archived | 1 | 1 | 110019 | 0 | 0 | 0 |
| `q_20261107_tbz2mb` | session | build | done | 2 | 2 | 235665 | 0 | 0 | 0 |
| `q_20261108_8818y5` | script | batch | archived | 1 | 0 | 0 | 0 | 0 | 0 |
| `q_20261108_n7a6be` | script | fix | archived | 1 | 0 | 0 | 0 | 0 | 0 |
| `q_20261108_g9h28z` | session | build | archived | 2 | 2 | 171692 | 0 | 0 | 0 |
| `q_20261108_41fbnb` | session | document | archived | 4 | 4 | 931624 | 0 | 0 | 0 |
| `q_20261108_1de08e` | session | document | archived | 4 | 4 | 521009 | 0 | 0 | 0 |
| `q_20261108_f9smyt` | session | research | archived | 6 | 6 | 2612514 | 0 | 0 | 0 |
| `q_20261108_82cbcx` | session | analyze | archived | 3 | 3 | 511125 | 0 | 0 | 0 |
| `q_20261108_jhzape` | session | publish | archived | 4 | 5 | 706675 | 0 | 0 | 0 |
| `q_20261108_zwvedg` | session | plan | archived | 3 | 3 | 598412 | 0 | 0 | 0 |
| `q_20261108_3px4ac` | session | refactor | archived | 4 | 4 | 877182 | 0 | 0 | 0 |
| `q_20261108_zpvebk` | session | build | archived | 4 | 5 | 1765246 | 0 | 0 | 0 |
| `q_20261108_m0d7e6` | session | research | archived | 1 | 1 | 14105 | 0 | 0 | 0 |
| `q_20261108_agexz8` | session | document | archived | 2 | 2 | 436728 | 0 | 0 | 0 |
| `q_20261108_czqqp6` | session | document | archived | 2 | 2 | 324387 | 0 | 0 | 0 |
| `q_20261108_2yhyv1` | session | document | archived | 0 | 0 | 0 | 0 | 0 | 0 |
| `q_20261108_g9w4r4` | session | research | done | 2 | 3 | 425749 | 0 | 0 | 0 |
| `q_20261108_3js8ey` | session | build | archived | 2 | 3 | 600760 | 0 | 0 | 0 |
