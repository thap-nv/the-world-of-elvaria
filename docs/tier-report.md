# Ba bậc chạy việc: số đo

> Sinh từ event log của một vương quốc bằng `pnpm docs:gen --kingdom <thư mục>`; không sửa file này. Số đo để chỉnh `kingdom.json` (`breakers.subagent_max_turns`, `subagent_max_minutes`, `context_budget_tokens`): implementation-plan §3.12, ADR 0017.

Khoảng: 2026-11-07T19:20:38+07:00 → 2026-11-12T07:00:50+07:00; 7785 dòng event, 59 quest.

## Theo bậc

| Bậc | Quest | Lần chạy | Phiên | Token | Ghi chú |
|---|---|---|---|---|---|
| Script | 3 | 3 | 0 | 0 | không model, mana 0 |
| Học đồ | — | 2 | — | trong phiên | 0.2 phút; 0 lần bị cắt ở maxTurns; 0 lần quá giờ; 0 lời gọi tool |
| Phiên | 56 | 192 | 190 | 35887887 | 3673 lượt; 5208 lời gọi tool của nhân vật |

Tỉ lệ: 5 % quest bậc script; 3 % quest có học đồ; 2 lần học đồ trên 190 phiên. Token của học đồ đã nằm trong token của phiên (`modelUsage` gộp). Ngoài quest (Tể tướng): 11 phiên, 51351 token.

## Theo quest

| Quest | Bậc | Dạng | Trạng thái | Lần chạy | Phiên | Token | Học đồ | Bị cắt | Quá giờ |
|---|---|---|---|---|---|---|---|---|---|
| `q_20261107_efqmx9` | session | build | archived | 1 | 1 | 110019 | 0 | 0 | 0 |
| `q_20261107_tbz2mb` | session | build | archived | 2 | 2 | 235665 | 0 | 0 | 0 |
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
| `q_20261108_g9w4r4` | session | research | archived | 2 | 3 | 425749 | 0 | 0 | 0 |
| `q_20261108_3js8ey` | session | build | archived | 2 | 3 | 600760 | 0 | 0 | 0 |
| `q_20261109_hwww36` | session | plan | done | 2 | 2 | 272677 | 0 | 0 | 0 |
| `q_20261109_ms5j7d` | session | build | done | 2 | 2 | 258619 | 0 | 0 | 0 |
| `q_20261109_bdyrzv` | session | build | done | 3 | 3 | 527605 | 0 | 0 | 0 |
| `q_20261109_y90za6` | session | build | done | 2 | 2 | 152347 | 0 | 0 | 0 |
| `q_20261109_qbzgmb` | session | plan | done | 3 | 3 | 352747 | 0 | 0 | 0 |
| `q_20261109_7qter5` | session | build | done | 2 | 2 | 366355 | 0 | 0 | 0 |
| `q_20261109_sxpv31` | session | build | done | 5 | 5 | 562854 | 1 | 0 | 0 |
| `q_20261109_vt5nzg` | session | build | done | 4 | 4 | 1205786 | 0 | 0 | 0 |
| `q_20261109_jnpeh4` | session | build | done | 7 | 6 | 905158 | 0 | 0 | 0 |
| `q_20261109_skffqk` | session | fix | done | 5 | 5 | 1008178 | 0 | 0 | 0 |
| `q_20261109_k8ejj6` | session | build | done | 4 | 4 | 474582 | 0 | 0 | 0 |
| `q_20261110_vtrjmr` | session | plan | done | 6 | 4 | 700233 | 0 | 0 | 0 |
| `q_20261110_rstw4c` | session | build | done | 2 | 2 | 604828 | 0 | 0 | 0 |
| `q_20261110_t9rw6g` | session | build | done | 2 | 2 | 372830 | 0 | 0 | 0 |
| `q_20261110_79ddnf` | session | build | done | 5 | 5 | 1042477 | 0 | 0 | 0 |
| `q_20261110_d3c9d9` | session | build | done | 2 | 1 | 79311 | 0 | 0 | 0 |
| `q_20261111_4xysc9` | session | build | archived | 2 | 2 | 271765 | 0 | 0 | 0 |
| `q_20261111_zc5ssm` | session | plan | done | 2 | 2 | 527718 | 1 | 0 | 0 |
| `q_20261111_nr5nj2` | session | plan | done | 3 | 3 | 894631 | 0 | 0 | 0 |
| `q_20261111_rxdmz4` | session | build | archived | 6 | 6 | 1123536 | 0 | 0 | 0 |
| `q_20261111_3f5tjv` | session | build | archived | 4 | 4 | 1422617 | 0 | 0 | 0 |
| `q_20261111_7yenh5` | session | build | archived | 7 | 8 | 1017530 | 0 | 0 | 0 |
| `q_20261111_cmemx7` | session | build | archived | 5 | 5 | 586010 | 0 | 0 | 0 |
| `q_20261111_zaq7w0` | session | build | archived | 4 | 4 | 610151 | 0 | 0 | 0 |
| `q_20261111_3gjkg9` | session | document | archived | 6 | 6 | 1405356 | 0 | 0 | 0 |
| `q_20261111_hb5d6q` | script | analyze | done | 1 | 0 | 0 | 0 | 0 | 0 |
| `q_20261111_7pzkfv` | session | research | infirmary | 2 | 2 | 925720 | 0 | 0 | 0 |
| `q_20261111_sc0hyz` | session | build | done | 3 | 3 | 679781 | 0 | 0 | 0 |
| `q_20261111_typ8nd` | session | build | done | 2 | 2 | 320919 | 0 | 0 | 0 |
| `q_20261111_gashpm` | session | build | done | 2 | 2 | 257150 | 0 | 0 | 0 |
| `q_20261111_vmkteq` | session | document | done | 3 | 3 | 609123 | 0 | 0 | 0 |
| `q_20261111_8gg2w0` | session | build | done | 4 | 4 | 534049 | 0 | 0 | 0 |
| `q_20261111_qwpn0g` | session | build | done | 2 | 2 | 362475 | 0 | 0 | 0 |
| `q_20261111_57v2hj` | session | build | archived | 12 | 10 | 868664 | 0 | 0 | 0 |
| `q_20261111_jeyy8t` | session | build | done | 2 | 2 | 858844 | 0 | 0 | 0 |
| `q_20261111_3tgerv` | session | fix | done | 3 | 3 | 968333 | 0 | 0 | 0 |
| `q_20261111_2cse0x` | session | fix | done | 6 | 6 | 879067 | 0 | 0 | 0 |
| `q_20261111_76bkt3` | session | build | archived | 6 | 5 | 288795 | 0 | 0 | 0 |
| `q_20261111_td77zr` | session | fix | archived | 1 | 1 | 217966 | 0 | 0 | 0 |
| `q_20261111_qk3s1r` | session | fix | archived | 3 | 3 | 528208 | 0 | 0 | 0 |
