# Ba bậc chạy việc: số đo

> Sinh từ event log của một vương quốc bằng `pnpm docs:gen --kingdom <thư mục>`; không sửa file này. Số đo để chỉnh `kingdom.json` (`breakers.subagent_max_turns`, `subagent_max_minutes`, `context_budget_tokens`): implementation-plan §3.12, ADR 0017.

Khoảng: 2026-11-07T19:20:38+07:00 → 2026-11-20T13:55:41+07:00; 14617 dòng event, 109 quest.

## Theo bậc

| Bậc | Quest | Lần chạy | Phiên | Token | Ghi chú |
|---|---|---|---|---|---|
| Script | 3 | 3 | 0 | 0 | không model, mana 0 |
| Học đồ | — | 4 | — | trong phiên | 0.3 phút; 0 lần bị cắt ở maxTurns; 0 lần quá giờ; 0 lời gọi tool |
| Phiên | 106 | 326 | 333 | 73528778 | 7957 lượt; 9448 lời gọi tool của nhân vật |

Tỉ lệ: 3 % quest bậc script; 4 % quest có học đồ; 4 lần học đồ trên 333 phiên. Token của học đồ đã nằm trong token của phiên (`modelUsage` gộp). Ngoài quest (Tể tướng): 43 phiên, 479182 token.

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
| `q_20261109_hwww36` | session | plan | archived | 2 | 2 | 272677 | 0 | 0 | 0 |
| `q_20261109_ms5j7d` | session | build | archived | 2 | 2 | 258619 | 0 | 0 | 0 |
| `q_20261109_bdyrzv` | session | build | archived | 3 | 3 | 527605 | 0 | 0 | 0 |
| `q_20261109_y90za6` | session | build | archived | 2 | 2 | 152347 | 0 | 0 | 0 |
| `q_20261109_qbzgmb` | session | plan | archived | 3 | 3 | 352747 | 0 | 0 | 0 |
| `q_20261109_7qter5` | session | build | archived | 2 | 2 | 366355 | 0 | 0 | 0 |
| `q_20261109_sxpv31` | session | build | archived | 5 | 5 | 562854 | 1 | 0 | 0 |
| `q_20261109_vt5nzg` | session | build | archived | 4 | 4 | 1205786 | 0 | 0 | 0 |
| `q_20261109_jnpeh4` | session | build | archived | 7 | 6 | 905158 | 0 | 0 | 0 |
| `q_20261109_skffqk` | session | fix | archived | 5 | 5 | 1008178 | 0 | 0 | 0 |
| `q_20261109_k8ejj6` | session | build | archived | 4 | 4 | 474582 | 0 | 0 | 0 |
| `q_20261110_vtrjmr` | session | plan | archived | 6 | 4 | 700233 | 0 | 0 | 0 |
| `q_20261110_rstw4c` | session | build | archived | 2 | 2 | 604828 | 0 | 0 | 0 |
| `q_20261110_t9rw6g` | session | build | archived | 2 | 2 | 372830 | 0 | 0 | 0 |
| `q_20261110_79ddnf` | session | build | archived | 5 | 5 | 1042477 | 0 | 0 | 0 |
| `q_20261110_d3c9d9` | session | build | archived | 2 | 1 | 79311 | 0 | 0 | 0 |
| `q_20261111_4xysc9` | session | build | archived | 2 | 2 | 271765 | 0 | 0 | 0 |
| `q_20261111_zc5ssm` | session | plan | archived | 2 | 2 | 527718 | 1 | 0 | 0 |
| `q_20261111_nr5nj2` | session | plan | archived | 3 | 3 | 894631 | 0 | 0 | 0 |
| `q_20261111_rxdmz4` | session | build | archived | 6 | 6 | 1123536 | 0 | 0 | 0 |
| `q_20261111_3f5tjv` | session | build | archived | 4 | 4 | 1422617 | 0 | 0 | 0 |
| `q_20261111_7yenh5` | session | build | archived | 7 | 8 | 1017530 | 0 | 0 | 0 |
| `q_20261111_cmemx7` | session | build | archived | 5 | 5 | 586010 | 0 | 0 | 0 |
| `q_20261111_zaq7w0` | session | build | archived | 4 | 4 | 610151 | 0 | 0 | 0 |
| `q_20261111_3gjkg9` | session | document | archived | 6 | 6 | 1405356 | 0 | 0 | 0 |
| `q_20261111_hb5d6q` | script | analyze | archived | 1 | 0 | 0 | 0 | 0 | 0 |
| `q_20261111_7pzkfv` | session | research | archived | 2 | 2 | 925720 | 0 | 0 | 0 |
| `q_20261111_sc0hyz` | session | build | archived | 3 | 3 | 679781 | 0 | 0 | 0 |
| `q_20261111_typ8nd` | session | build | archived | 2 | 2 | 320919 | 0 | 0 | 0 |
| `q_20261111_gashpm` | session | build | archived | 2 | 2 | 257150 | 0 | 0 | 0 |
| `q_20261111_vmkteq` | session | document | archived | 3 | 3 | 609123 | 0 | 0 | 0 |
| `q_20261111_8gg2w0` | session | build | archived | 4 | 4 | 534049 | 0 | 0 | 0 |
| `q_20261111_qwpn0g` | session | build | archived | 2 | 2 | 362475 | 0 | 0 | 0 |
| `q_20261111_57v2hj` | session | build | archived | 12 | 10 | 868664 | 0 | 0 | 0 |
| `q_20261111_jeyy8t` | session | build | archived | 2 | 2 | 858844 | 0 | 0 | 0 |
| `q_20261111_3tgerv` | session | fix | archived | 3 | 3 | 968333 | 0 | 0 | 0 |
| `q_20261111_2cse0x` | session | fix | archived | 6 | 6 | 879067 | 0 | 0 | 0 |
| `q_20261111_76bkt3` | session | build | archived | 6 | 5 | 288795 | 0 | 0 | 0 |
| `q_20261111_td77zr` | session | fix | archived | 1 | 1 | 217966 | 0 | 0 | 0 |
| `q_20261111_qk3s1r` | session | fix | archived | 3 | 3 | 528208 | 0 | 0 | 0 |
| `q_20261112_wgnyv5` | session | build | archived | 2 | 2 | 112661 | 0 | 0 | 0 |
| `q_20261112_mwv6vn` | session | build | archived | 2 | 3 | 617023 | 0 | 0 | 0 |
| `q_20261112_gwrz5m` | session | build | archived | 4 | 4 | 695456 | 0 | 0 | 0 |
| `q_20261114_mggach` | session | plan | archived | 5 | 5 | 1051861 | 0 | 0 | 0 |
| `q_20261114_rbwpcr` | session | refactor | archived | 2 | 2 | 493778 | 0 | 0 | 0 |
| `q_20261114_b5n3tj` | session | build | archived | 4 | 4 | 1312995 | 0 | 0 | 0 |
| `q_20261114_4g4vst` | session | build | archived | 3 | 4 | 1475419 | 0 | 0 | 0 |
| `q_20261114_a6d8mm` | session | build | archived | 2 | 2 | 2136633 | 0 | 0 | 0 |
| `q_20261114_rrjpgx` | session | build | archived | 3 | 3 | 708416 | 0 | 0 | 0 |
| `q_20261114_b6dxqw` | session | build | archived | 3 | 3 | 950792 | 1 | 0 | 0 |
| `q_20261114_42nr8g` | session | build | archived | 2 | 1 | 156713 | 0 | 0 | 0 |
| `q_20261115_2r6538` | session | plan | draft | 0 | 0 | 0 | 0 | 0 | 0 |
| `q_20261115_8ap4j0` | session | fix | draft | 0 | 0 | 0 | 0 | 0 | 0 |
| `q_20261115_dgwf3a` | session | plan | archived | 0 | 0 | 0 | 0 | 0 | 0 |
| `q_20261115_m2pkrz` | session | plan | archived | 8 | 8 | 1893477 | 0 | 0 | 0 |
| `q_20261115_5k5xxv` | session | build | archived | 4 | 7 | 3620613 | 0 | 0 | 0 |
| `q_20261115_qyppt6` | session | build | archived | 2 | 2 | 828785 | 0 | 0 | 0 |
| `q_20261115_byxq11` | session | research | archived | 8 | 8 | 3185762 | 0 | 0 | 0 |
| `q_20261115_p64dv4` | session | build | archived | 2 | 2 | 756896 | 0 | 0 | 0 |
| `q_20261115_fh4hbp` | session | build | archived | 8 | 8 | 2883435 | 0 | 0 | 0 |
| `q_20261115_7wvx50` | session | build | archived | 2 | 2 | 955349 | 0 | 0 | 0 |
| `q_20261115_ncx3k3` | session | build | archived | 3 | 5 | 1616599 | 0 | 0 | 0 |
| `q_20261115_fspfxs` | session | research | archived | 0 | 0 | 0 | 0 | 0 | 0 |
| `q_20261115_mqmt6q` | session | plan | archived | 0 | 0 | 0 | 0 | 0 | 0 |
| `q_20261115_zts5cp` | session | research | archived | 0 | 0 | 0 | 0 | 0 | 0 |
| `q_20261115_16khsq` | session | plan | archived | 0 | 0 | 0 | 0 | 0 | 0 |
| `q_20261115_vqm963` | session | plan | archived | 0 | 0 | 0 | 0 | 0 | 0 |
| `q_20261117_m8d5t2` | session | document | archived | 8 | 8 | 2069464 | 0 | 0 | 0 |
| `q_20261117_7t6wsn` | session | fix | archived | 2 | 3 | 542580 | 0 | 0 | 0 |
| `q_20261117_rg43ry` | session | fix | archived | 2 | 2 | 329515 | 0 | 0 | 0 |
| `q_20261117_basq1e` | session | fix | archived | 0 | 0 | 0 | 0 | 0 | 0 |
| `q_20261117_k5y5j0` | session | fix | archived | 2 | 2 | 202349 | 0 | 0 | 0 |
| `q_20261118_1vrgtm` | session | build | archived | 3 | 2 | 362647 | 0 | 0 | 0 |
| `q_20261119_txr2c6` | session | build | archived | 2 | 3 | 643670 | 0 | 0 | 0 |
| `q_20261119_7jb6de` | session | fix | archived | 2 | 2 | 262330 | 0 | 0 | 0 |
| `q_20261119_tkv9e4` | session | document | archived | 2 | 2 | 395634 | 0 | 0 | 0 |
| `q_20261119_hh9z0a` | session | fix | archived | 3 | 5 | 690126 | 1 | 0 | 0 |
| `q_20261120_csc4ma` | session | refactor | archived | 2 | 2 | 661346 | 0 | 0 | 0 |
| `q_20261120_8km8rm` | session | fix | archived | 4 | 4 | 660470 | 0 | 0 | 0 |
| `q_20261120_yp3jmk` | session | plan | archived | 6 | 6 | 1084317 | 0 | 0 | 0 |
| `q_20261120_mxpx9q` | session | build | archived | 2 | 2 | 608569 | 0 | 0 | 0 |
| `q_20261120_hasm74` | session | refactor | archived | 2 | 2 | 154878 | 0 | 0 | 0 |
| `q_20261120_kxnqyc` | session | fix | archived | 3 | 3 | 122528 | 0 | 0 | 0 |
| `q_20261120_22124s` | session | fix | archived | 4 | 4 | 439568 | 0 | 0 | 0 |
| `q_20261120_2c0sj1` | session | fix | archived | 4 | 4 | 1541595 | 0 | 0 | 0 |
| `q_20261120_yvrgwh` | session | refactor | archived | 2 | 2 | 272416 | 0 | 0 | 0 |
| `q_20261120_4m6cte` | session | fix | archived | 2 | 2 | 93255 | 0 | 0 | 0 |
| `q_20261120_fbvq67` | session | fix | archived | 4 | 4 | 310473 | 0 | 0 | 0 |
| `q_20261120_hezs1j` | session | fix | archived | 2 | 2 | 262113 | 0 | 0 | 0 |
| `q_20261120_09t42t` | session | fix | archived | 2 | 2 | 478385 | 0 | 0 | 0 |
