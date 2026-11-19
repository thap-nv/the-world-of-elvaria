# Sổ đo

> Sinh từ một vương quốc bằng `pnpm docs:gen --kingdom <thư mục>`; không sửa file này. Cùng số với `elvaria metrics` (implementation-plan §3.16.1, ADR 0027).

Khoảng: 2026-11-07T19:20:38+07:00 → 2026-11-19T13:31:06+07:00; 12588 dòng event, 92 quest, 171 phán quyết, 372 lệnh đã xử lý.

## Sổ đo (toàn bộ vương quốc)

Lượt: 294 (284 phiên của nhân vật, 10 lượt của máy); 1 phiên dừng vì hết mana; 0 phiên thêm bên trong một lượt.

Làm lại: 131 phiên (hạ tầng 47, đầu ra 72, câu hỏi 12, không rõ 0).

Đạt lượt đầu: 31/74 quest (42 %).

Lỗi lọt: 2 (chủ nhân trả bài sau một phán quyết đạt), 0 chủ nhân báo sau merge.

Lần cần chủ nhân: 140 lệnh, trên 64 của 88 quest.

Quest được đóng dấu: 51, tổng 44152710 token, trung bình 69.7 phút từ phiên đầu tới phiên cuối.

Lượt check bị gạt vì môi trường (Docker tắt, container mất): 0.

Lượt đọc file: 3493; 327 file bị một phiên đọc hơn một lần.

Lượt hỏi đồ thị code: 0 trong 0 phiên (query 0, path 0, explain 0, affected 0).

Phiên người làm: 149, 142 phiên có sửa file; trước lần sửa đầu: trung vị 12 lần gọi tool, 43 % mọi lần gọi của chúng (trung vị 41 %).

Lần nộp có file đổi ngoài vùng của quest: 2 (2 file).

## Theo ngày

| Ngày | Lượt | Làm lại (hạ tầng/đầu ra/câu hỏi/không rõ) | Đạt lượt đầu | Lệnh chủ nhân |
|---|---|---|---|---|
| 2026-11-07 | 3 | 0 (0/0/0/0) | 1/1 | 1 |
| 2026-11-08 | 49 | 19 (4/12/3/0) | 6/13 | 26 |
| 2026-11-09 | 36 | 14 (6/8/0/0) | 5/11 | 12 |
| 2026-11-10 | 20 | 9 (4/5/0/0) | 2/4 | 8 |
| 2026-11-11 | 91 | 43 (19/23/1/0) | 6/22 | 37 |
| 2026-11-12 | 10 | 4 (2/1/1/0) | 2/3 | 6 |
| 2026-11-14 | 25 | 9 (8/0/1/0) | 2/7 | 18 |
| 2026-11-15 | 42 | 26 (2/19/5/0) | 3/8 | 31 |
| 2026-11-17 | 11 | 7 (2/4/1/0) | 1/2 | 1 |
| 2026-11-18 | 7 | 0 (0/0/0/0) | 3/3 | 0 |

## Làm lại theo nguyên nhân

| Nguyên nhân | Căn cứ | Giá trị | Người làm | Người chấm | Tổng |
|---|---|---|---|---|---|
| hạ tầng | kết thúc phiên | breaker | 29 | 6 | 35 |
| hạ tầng | kết thúc phiên | crash | 2 | 4 | 6 |
| hạ tầng | loại lỗi của phán quyết | flaky | 2 | 2 | 4 |
| hạ tầng | kết thúc phiên | partial | 0 | 1 | 1 |
| hạ tầng | kết thúc phiên | timeout | 1 | 0 | 1 |
| đầu ra | loại lỗi của phán quyết | incomplete | 11 | 8 | 19 |
| đầu ra | loại lỗi của phán quyết | tests_fail | 8 | 9 | 17 |
| đầu ra | loại lỗi của phán quyết | wrong_facts | 8 | 8 | 16 |
| đầu ra | loại lỗi của phán quyết | other | 5 | 5 | 10 |
| đầu ra | loại lỗi của phán quyết | style | 2 | 2 | 4 |
| đầu ra | loại lỗi của phán quyết | unsafe | 2 | 2 | 4 |
| đầu ra | loại lỗi của phán quyết | scope_creep | 1 | 1 | 2 |
| câu hỏi | kết thúc phiên | blocked | 12 | 0 | 12 |

## Đạt lượt đầu

| Nhóm | Khóa | Đạt | Đã quyết | Tỉ lệ |
|---|---|---|---|---|
| Nghề | astrologer | 0 | 1 | 0 % |
| Nghề | bard | 0 | 1 | 0 % |
| Nghề | dwarf | 1 | 1 | 100 % |
| Nghề | knight | 25 | 52 | 48 % |
| Nghề | mage | 2 | 8 | 25 % |
| Nghề | scout | 1 | 4 | 25 % |
| Nghề | scribe | 2 | 7 | 29 % |
| Tag | backend | 16 | 35 | 46 % |
| Tag | db | 1 | 2 | 50 % |
| Tag | docs | 7 | 25 | 28 % |
| Tag | e2e | 3 | 19 | 16 % |
| Tag | frontend | 7 | 25 | 28 % |
| Tag | i18n | 3 | 14 | 21 % |
| Tag | infra | 4 | 5 | 80 % |
| Tag | integration | 1 | 7 | 14 % |
| Model | claude-opus-5-5 | 5 | 16 | 31 % |
| Model | claude-opus-5-5-high | 1 | 1 | 100 % |
| Model | claude-sonnet-5-5 | 14 | 31 | 45 % |
| Model | gemini-3.8-flash-high | 0 | 6 | 0 % |
| Model | gemini-4-argon-medium | 2 | 6 | 33 % |
| Model | gpt-6.1-sol | 9 | 14 | 64 % |
| Dạng | analyze | 0 | 1 | 0 % |
| Dạng | build | 21 | 44 | 48 % |
| Dạng | document | 2 | 7 | 29 % |
| Dạng | fix | 3 | 7 | 43 % |
| Dạng | plan | 2 | 8 | 25 % |
| Dạng | publish | 0 | 1 | 0 % |
| Dạng | refactor | 2 | 2 | 100 % |
| Dạng | research | 1 | 4 | 25 % |
| Lãnh thổ | dc1-se-team | 19 | 48 | 40 % |
| Lãnh thổ | elvaria | 12 | 26 | 46 % |

## Tỉ lệ đạt theo lượt làm

| Lượt | Đạt | Đã quyết | Tỉ lệ |
|---|---|---|---|
| 1 | 31 | 74 | 42 % |
| 2 | 23 | 41 | 56 % |
| 3 | 11 | 18 | 61 % |
| 4 | 6 | 7 | 86 % |

## Lần cần chủ nhân, theo lệnh

| Lệnh | Số lần |
|---|---|
| return | 2 |
| retry | 22 |
| reassign | 14 |
| edit_quest | 87 |
| set_rank | 0 |
| answer | 5 |
| cancel | 10 |

## Lời khuyên của Tể tướng trên các thư đưa lên chủ nhân

Làm theo lời khuyên: 0 trên 0 thư chủ nhân đã quyết sau một lời khuyên (—); thư đưa lên: 8.

| Lời khuyên | Đưa lên | Đã quyết | Quyết như lời khuyên |
|---|---|---|---|
| new_quest | 4 | 0 | 0 |
| owner | 4 | 3 | 0 |

## Lỗi lọt

| Quest | Lượt | Loại lỗi | Chấm lại |
|---|---|---|---|
| q_20261109_k8ejj6 | 1 | other | không |
| q_20261117_m8d5t2 | 2 | wrong_facts | không |

## Lỗi lọt chủ nhân báo sau merge (elvaria quest escaped)

Không có.

## Nhánh gốc đỏ sau merge

Không có.

## Quest được đóng dấu

| Quest | Token | Phút (đầu → cuối) | Phút trong phiên |
|---|---|---|---|
| q_20261107_tbz2mb | 235665 | 4.2 | 3.2 |
| q_20261108_1de08e | 521009 | 18.5 | 17.8 |
| q_20261108_3js8ey | 600760 | 24.2 | 3.5 |
| q_20261108_3px4ac | 877182 | 5.1 | 4.8 |
| q_20261108_41fbnb | 931624 | 37.5 | 11.2 |
| q_20261108_82cbcx | 511125 | 12.9 | 6.7 |
| q_20261108_agexz8 | 436728 | 7.8 | 7.4 |
| q_20261108_czqqp6 | 324387 | 6.6 | 6.5 |
| q_20261108_f9smyt | 2612514 | 46.7 | 45.9 |
| q_20261108_g9h28z | 171692 | 4.9 | 3.3 |
| q_20261108_g9w4r4 | 425749 | 311.8 | 9.9 |
| q_20261108_jhzape | 706675 | 24.4 | 3.6 |
| q_20261108_zpvebk | 1765246 | 17.6 | 7.5 |
| q_20261108_zwvedg | 598412 | 12.5 | 3.4 |
| q_20261109_jnpeh4 | 905158 | 37.9 | 22.5 |
| q_20261109_k8ejj6 | 474582 | 75.3 | 13.3 |
| q_20261109_qbzgmb | 352747 | 10.8 | 7.6 |
| q_20261109_skffqk | 1008178 | 54.4 | 19.8 |
| q_20261109_y90za6 | 152347 | 5.4 | 2.9 |
| q_20261110_d3c9d9 | 79311 | 38.1 | 1.3 |
| q_20261110_vtrjmr | 700233 | 249.9 | 229.6 |
| q_20261111_3f5tjv | 1422617 | 239.0 | 121.6 |
| q_20261111_3gjkg9 | 1405356 | 79.0 | 23.4 |
| q_20261111_3tgerv | 968333 | 43.7 | 29.6 |
| q_20261111_57v2hj | 868664 | 396.5 | 36.6 |
| q_20261111_76bkt3 | 288795 | 247.6 | 5.6 |
| q_20261111_7yenh5 | 1017530 | 133.9 | 34.8 |
| q_20261111_cmemx7 | 586010 | 155.2 | 19.9 |
| q_20261111_jeyy8t | 858844 | 151.1 | 18.0 |
| q_20261111_nr5nj2 | 894631 | 50.9 | 15.0 |
| q_20261111_rxdmz4 | 1123536 | 84.6 | 35.0 |
| q_20261111_zaq7w0 | 610151 | 254.1 | 14.5 |
| q_20261111_zc5ssm | 527718 | 12.3 | 11.8 |
| q_20261112_gwrz5m | 695456 | 66.8 | 26.2 |
| q_20261112_mwv6vn | 617023 | 20.0 | 9.4 |
| q_20261112_wgnyv5 | 112661 | 9.6 | 3.3 |
| q_20261114_42nr8g | 156713 | 7.6 | 1.4 |
| q_20261114_mggach | 1051861 | 53.1 | 15.3 |
| q_20261114_rbwpcr | 493778 | 19.3 | 13.3 |
| q_20261115_5k5xxv | 3620613 | 83.1 | 48.8 |
| q_20261115_7wvx50 | 955349 | 29.8 | 23.7 |
| q_20261115_fh4hbp | 2883435 | 91.6 | 59.8 |
| q_20261115_m2pkrz | 1893477 | 35.5 | 26.9 |
| q_20261115_ncx3k3 | 1616599 | 56.2 | 23.8 |
| q_20261115_p64dv4 | 756896 | 39.5 | 18.2 |
| q_20261115_qyppt6 | 828785 | 29.2 | 23.2 |
| q_20261117_7t6wsn | 542580 | 24.8 | 16.5 |
| q_20261117_k5y5j0 | 202349 | 20.3 | 6.9 |
| q_20261117_m8d5t2 | 2069464 | 76.5 | 69.7 |
| q_20261117_rg43ry | 329515 | 15.6 | 7.9 |
| q_20261118_1vrgtm | 362647 | 19.6 | 8.3 |

## Merge không qua dấu (ủy quyền dấu)

| Lãnh thổ | Đã merge | Không qua dấu | Trong đó, bị nêu vì lỗi lọt |
|---|---|---|---|
| elvaria | 4 | 0 | 0 |

## Thời gian ở từng trạng thái (phút, các lần ở đã kết thúc)

| Trạng thái | Số lần | Trung vị | Lâu nhất |
|---|---|---|---|
| Nháp | 15 | 6.1 | 1385.8 |
| Mở | 114 | 1.1 | 1451.9 |
| Đã nhận | 120 | 0.2 | 16.4 |
| Đang làm | 171 | 4.2 | 206.5 |
| Chờ nghiệm thu, chưa có người chấm | 129 | 2.6 | 205.3 |
| Chờ nghiệm thu, người chấm đang chấm | 123 | 1.4 | 90.0 |
| Bị trả bài | 38 | 0.1 | 21.5 |
| Chờ dấu vua | 53 | 5.2 | 1367.1 |
| Xong | 76 | 111.8 | 4968.6 |
| Chờ trả lời | 13 | 6.3 | 20.4 |
| Tạm dừng (hết mana) | 1 | 301.7 | 301.7 |
| Trạm quân y | 36 | 6.2 | 1611.0 |

## Theo quest

| Quest | Dạng | Nghề | Lượt | Làm lại (hạ tầng/đầu ra/câu hỏi/không rõ) | Đạt lượt đầu | Token | Lệnh chủ nhân |
|---|---|---|---|---|---|---|---|
| q_20261107_efqmx9 | build | knight | 1 | 0/0/0/0 | — | 110019 | 1 |
| q_20261107_tbz2mb | build | knight | 2 | 0/0/0/0 | có | 235665 | 0 |
| q_20261108_1de08e | document | scribe | 4 | 0/2/0/0 | không | 521009 | 2 |
| q_20261108_2yhyv1 | document | scribe | 0 | 0/0/0/0 | — | 0 | 1 |
| q_20261108_3js8ey | build | knight | 3 | 0/0/1/0 | có | 600760 | 1 |
| q_20261108_3px4ac | refactor | knight | 4 | 2/0/0/0 | có | 877182 | 2 |
| q_20261108_41fbnb | document | scribe | 4 | 0/2/0/0 | không | 931624 | 2 |
| q_20261108_82cbcx | analyze | astrologer | 3 | 1/0/0/0 | không | 511125 | 3 |
| q_20261108_8818y5 | batch | — | 1 | 0/0/0/0 | — | 0 | 0 |
| q_20261108_agexz8 | document | scribe | 2 | 0/0/0/0 | có | 436728 | 0 |
| q_20261108_czqqp6 | document | scribe | 2 | 0/0/0/0 | có | 324387 | 0 |
| q_20261108_f9smyt | research | scout | 6 | 0/4/0/0 | không | 2612514 | 2 |
| q_20261108_g9h28z | build | knight | 2 | 0/0/0/0 | có | 171692 | 0 |
| q_20261108_g9w4r4 | research | scout | 3 | 0/0/0/0 | có | 425749 | 3 |
| q_20261108_jhzape | publish | bard | 5 | 0/2/1/0 | không | 706675 | 2 |
| q_20261108_m0d7e6 | research | scout | 1 | 0/0/0/0 | — | 0 | 2 |
| q_20261108_n7a6be | fix | — | 1 | 0/0/0/0 | — | 0 | 0 |
| q_20261108_zpvebk | build | knight | 5 | 0/2/1/0 | không | 1765246 | 3 |
| q_20261108_zwvedg | plan | mage | 3 | 1/0/0/0 | không | 598412 | 3 |
| q_20261109_7qter5 | build | knight | 2 | 0/0/0/0 | có | 366355 | 0 |
| q_20261109_bdyrzv | build | knight | 3 | 1/0/0/0 | có | 527605 | 0 |
| q_20261109_hwww36 | plan | mage | 2 | 0/0/0/0 | có | 272677 | 0 |
| q_20261109_jnpeh4 | build | knight | 7 | 0/4/0/0 | không | 905158 | 2 |
| q_20261109_k8ejj6 | build | knight | 4 | 0/2/0/0 | không | 474582 | 2 |
| q_20261109_ms5j7d | build | knight | 2 | 0/0/0/0 | có | 258619 | 0 |
| q_20261109_qbzgmb | plan | mage | 3 | 1/0/0/0 | không | 352747 | 2 |
| q_20261109_skffqk | fix | knight | 5 | 1/2/0/0 | không | 1008178 | 2 |
| q_20261109_sxpv31 | build | knight | 5 | 1/2/0/0 | không | 562854 | 2 |
| q_20261109_vt5nzg | build | knight | 4 | 2/0/0/0 | không | 1205786 | 3 |
| q_20261109_y90za6 | build | knight | 2 | 0/0/0/0 | có | 152347 | 0 |
| q_20261110_79ddnf | build | knight | 5 | 1/2/0/0 | không | 1042477 | 2 |
| q_20261110_d3c9d9 | build | knight | 2 | 0/0/0/0 | — | 79311 | 0 |
| q_20261110_rstw4c | build | knight | 2 | 0/0/0/0 | có | 604828 | 0 |
| q_20261110_t9rw6g | build | knight | 2 | 0/0/0/0 | có | 372830 | 1 |
| q_20261110_vtrjmr | plan | mage | 6 | 3/1/0/0 | không | 700233 | 4 |
| q_20261111_2cse0x | fix | knight | 6 | 0/4/0/0 | không | 879067 | 1 |
| q_20261111_3f5tjv | build | knight | 4 | 2/0/0/0 | không | 1422617 | 3 |
| q_20261111_3gjkg9 | document | scribe | 6 | 2/2/0/0 | không | 1405356 | 4 |
| q_20261111_3tgerv | fix | knight | 3 | 1/0/0/0 | không | 968333 | 3 |
| q_20261111_4xysc9 | build | knight | 2 | 0/0/0/0 | có | 271765 | 0 |
| q_20261111_57v2hj | build | knight | 12 | 3/5/0/0 | không | 868664 | 3 |
| q_20261111_76bkt3 | build | knight | 6 | 0/3/0/0 | không | 288795 | 1 |
| q_20261111_7pzkfv | research | scout | 2 | 1/0/0/0 | không | 925720 | 2 |
| q_20261111_7yenh5 | build | knight | 8 | 1/4/1/0 | không | 1017530 | 1 |
| q_20261111_8gg2w0 | build | knight | 4 | 0/2/0/0 | không | 534049 | 1 |
| q_20261111_cmemx7 | build | knight | 5 | 1/2/0/0 | không | 586010 | 2 |
| q_20261111_gashpm | build | knight | 2 | 0/0/0/0 | có | 257150 | 1 |
| q_20261111_hb5d6q | analyze | — | 1 | 0/0/0/0 | — | 0 | 0 |
| q_20261111_jeyy8t | build | knight | 2 | 0/0/0/0 | có | 858844 | 1 |
| q_20261111_nr5nj2 | plan | mage | 3 | 1/0/0/0 | không | 894631 | 2 |
| q_20261111_qk3s1r | fix | knight | 3 | 0/1/0/0 | không | 528208 | 1 |
| q_20261111_qwpn0g | build | knight | 2 | 0/0/0/0 | có | 362475 | 1 |
| q_20261111_rxdmz4 | build | knight | 6 | 3/1/0/0 | không | 1123536 | 4 |
| q_20261111_sc0hyz | build | knight | 3 | 1/0/0/0 | không | 679781 | 2 |
| q_20261111_td77zr | fix | knight | 1 | 0/0/0/0 | — | 217966 | 1 |
| q_20261111_typ8nd | build | knight | 2 | 0/0/0/0 | có | 320919 | 1 |
| q_20261111_vmkteq | document | scribe | 3 | 1/0/0/0 | không | 609123 | 2 |
| q_20261111_zaq7w0 | build | knight | 4 | 2/0/0/0 | không | 610151 | 0 |
| q_20261111_zc5ssm | plan | mage | 2 | 0/0/0/0 | có | 527718 | 0 |
| q_20261112_gwrz5m | build | knight | 4 | 2/0/0/0 | không | 695456 | 4 |
| q_20261112_mwv6vn | build | knight | 3 | 0/0/1/0 | có | 617023 | 2 |
| q_20261112_wgnyv5 | build | knight | 2 | 0/0/0/0 | có | 112661 | 0 |
| q_20261114_42nr8g | build | knight | 2 | 0/0/0/0 | — | 156713 | 1 |
| q_20261114_4g4vst | build | knight | 4 | 1/0/1/0 | không | 1475419 | 4 |
| q_20261114_a6d8mm | build | knight | 2 | 0/0/0/0 | có | 2136633 | 1 |
| q_20261114_b5n3tj | build | knight | 4 | 2/0/0/0 | không | 1312995 | 4 |
| q_20261114_b6dxqw | build | knight | 3 | 1/0/0/0 | không | 950792 | 3 |
| q_20261114_mggach | plan | mage | 5 | 3/0/0/0 | không | 1051861 | 2 |
| q_20261114_rbwpcr | refactor | knight | 2 | 0/0/0/0 | có | 493778 | 0 |
| q_20261114_rrjpgx | build | knight | 3 | 1/0/0/0 | không | 708416 | 3 |
| q_20261115_16khsq | plan | mage | 0 | 0/0/0/0 | — | 0 | 2 |
| q_20261115_5k5xxv | build | knight | 7 | 0/2/3/0 | không | 3620613 | 5 |
| q_20261115_7wvx50 | build | knight | 2 | 0/0/0/0 | có | 955349 | 1 |
| q_20261115_byxq11 | research | scout | 8 | 1/5/0/0 | không | 3185762 | 4 |
| q_20261115_fh4hbp | build | knight | 8 | 0/6/0/0 | không | 2883435 | 5 |
| q_20261115_fspfxs | research | scout | 0 | 0/0/0/0 | — | 0 | 1 |
| q_20261115_m2pkrz | plan | mage | 8 | 0/6/0/0 | không | 1893477 | 1 |
| q_20261115_mqmt6q | plan | mage | 0 | 0/0/0/0 | — | 0 | 2 |
| q_20261115_ncx3k3 | build | knight | 5 | 1/0/2/0 | không | 1616599 | 5 |
| q_20261115_p64dv4 | build | dwarf | 2 | 0/0/0/0 | có | 756896 | 2 |
| q_20261115_qyppt6 | build | knight | 2 | 0/0/0/0 | có | 828785 | 0 |
| q_20261115_vqm963 | plan | mage | 0 | 0/0/0/0 | — | 0 | 2 |
| q_20261115_zts5cp | research | scout | 0 | 0/0/0/0 | — | 0 | 1 |
| q_20261117_7t6wsn | fix | knight | 3 | 0/0/1/0 | có | 542580 | 0 |
| q_20261117_k5y5j0 | fix | knight | 2 | 0/0/0/0 | có | 202349 | 0 |
| q_20261117_m8d5t2 | document | scribe | 8 | 2/4/0/0 | không | 2069464 | 1 |
| q_20261117_rg43ry | fix | knight | 2 | 0/0/0/0 | có | 329515 | 0 |
| q_20261118_1vrgtm | build | knight | 3 | 0/0/0/0 | có | 362647 | 0 |

## Thư theo kiểu

| Dạng | Đã lập | Tới chủ nhân | Bạn quyết | Phân loại quyết |
|---|---|---|---|---|
| amendment | 7 | 6 | 6 | 1 |
| proposal | 9 | 5 | 1 | 3 |

## Phản biện theo người chấm đầu

Không có.

## Phản biện đề bài

| Đã lập | Nhận | Bác | Tới chủ nhân | Bị trả sau khi bác |
|---|---|---|---|---|
| 7 | 7 | 0 | 6 | 0 |

## File một phiên đọc lại (tối đa 10 dòng, nhiều lượt nhất trước)

| Phiên | Quest | Đường dẫn | Lượt đọc |
|---|---|---|---|
| e35a36f4-5fbf-425c-aa7c-fb4d10464ca3 | q_20261111_7pzkfv | docs/implementation-plan.md | 17 |
| 2993c246-8c47-40d2-ac8a-e017caec1bb4 | q_20261111_nr5nj2 | apps/api/openapi.json | 12 |
| 85a6f2d5-df72-4a6c-ba92-12e7c6f4850a | q_20261108_3px4ac | apps/web/src/features | 10 |
| c2e0a7b8-da28-4061-8653-232e87ca72c0 | q_20261108_3px4ac | apps/web/src/features | 10 |
| 6ac07373-05df-4c09-b981-682eeea7e7c6 | q_20261111_7pzkfv | docs/implementation-plan.md | 9 |
| afc816d1-5bcf-4cc2-b21d-bebc3398babe | q_20261111_rxdmz4 | apps/web/src/features/members/MemberDetail.tsx | 9 |
| c31dff0a-6737-4329-a1ca-a7a90de10473 | q_20261110_rstw4c | apps/api/openapi.json | 9 |
| f076880a-99dd-4c8e-8bde-08791623ee4a | q_20261109_7qter5 | packages/shared/src/api-types.ts | 9 |
| 229e8b03-d84f-4d56-b970-41d59cdae45e | q_20261110_vtrjmr | packages/shared/src/api-types.ts | 8 |
| 4583762b-2f34-402d-8b0a-9e224cfcb3e9 | q_20261109_bdyrzv | packages/shared/src/api-types.ts | 8 |

## Bài học trong kinh: lượt nạp, trúng, trượt và tác dụng

Chưa phiên nào ghi dấu vết nạp theo dòng (load_trace.lessons, từ PS-12), nên chưa có bài học nào để đếm.

## Loại lỗi theo thời gian (số lượt trượt trên số lượt được chấm, mỗi khoảng 20 lượt)

| Loại lỗi | Lượt trượt | Mỗi 20 lượt được chấm (cũ → mới) |
|---|---|---|
| incomplete | 11 | 0/20 · 1/20 · 2/20 · 3/20 · 5/20 · 0/10 |
| tests_fail | 8 | 1/20 · 4/20 · 2/20 · 1/20 · 0/20 · 0/10 |
| wrong_facts | 8 | 2/20 · 0/20 · 1/20 · 1/20 · 2/20 · 2/10 |
| other | 5 | 1/20 · 1/20 · 1/20 · 1/20 · 1/20 · 0/10 |
| style | 2 | 2/20 · 0/20 · 0/20 · 0/20 · 0/20 · 0/10 |
| unsafe | 2 | 0/20 · 0/20 · 0/20 · 0/20 · 2/20 · 0/10 |
| flaky | 2 | 0/20 · 0/20 · 1/20 · 1/20 · 0/20 · 0/10 |
| scope_creep | 1 | 0/20 · 0/20 · 0/20 · 1/20 · 0/20 · 0/10 |

## Lỗi lặp trong 50 lượt được chấm gần nhất (từ 3 phán quyết cùng loại)

| Loại lỗi | Số lần | Phán quyết | Nghề | Tộc | Model | Lãnh thổ | Tag | Bài học đã nạp |
|---|---|---|---|---|---|---|---|---|
| incomplete | 8 | q_20261111_8gg2w0-1, q_20261111_2cse0x-1, q_20261111_qk3s1r-1, q_20261115_m2pkrz-1, q_20261115_m2pkrz-3, q_20261115_5k5xxv-1, q_20261115_byxq11-4, q_20261115_fh4hbp-3 | knight, mage, scout | claude, codex, gemini | claude-sonnet-5-5, claude-opus-5-5, gpt-6.1-sol, gemini-3.8-flash-high | dc1-se-team, elvaria | frontend, i18n, e2e, backend, docs, integration | |
| wrong_facts | 5 | q_20261111_2cse0x-2, q_20261115_byxq11-2, q_20261115_byxq11-3, q_20261117_m8d5t2-1, q_20261117_m8d5t2-2-user | knight, scout, scribe | claude, gemini | claude-sonnet-5-5, gemini-3.8-flash-high | dc1-se-team, elvaria | frontend, i18n, e2e, integration, docs | |

## Sau lời nhắc thu dọn, theo tộc (phiên người làm đã kết thúc)

| Tộc | Được nhắc | Tự kết thúc | Bị cắt | Token thêm (trung vị) | Phút tới lúc kết thúc (trung vị) | Tiếp sức |
|---|---|---|---|---|---|---|
| gemini | 3 | 1 | 2 | 206504 | 5.0 | 0 |

## Cỡ prompt theo vai và khối (ký tự)

| Vai | Phần | Khối | Phiên | Trung vị | Lớn nhất |
|---|---|---|---|---|---|
| Người làm | — | cả prompt | 55 | 20509 | 54775 |
| Người làm | system | role | 55 | 7114 | 8265 |
| Người làm | system | class | 55 | 1002 | 14027 |
| Người làm | user | continuation | 25 | 15909 | 25397 |
| Người làm | user | answer | 8 | 5403 | 6685 |
| Người làm | user | quest | 47 | 4426 | 11504 |
| Người làm | user | gazetteer | 47 | 3153 | 4037 |
| Người làm | user | scripture | 47 | 2265 | 2956 |
| Người làm | user | memos | 9 | 1004 | 3996 |
| Người làm | user | resumed | 8 | 210 | 210 |
| Người chấm | — | cả prompt | 37 | 36096 | 44562 |
| Người chấm | system | role | 37 | 3294 | 4111 |
| Người chấm | system | class | 37 | 1177 | 1692 |
| Người chấm | user | review | 37 | 21968 | 26278 |
| Người chấm | user | quest | 37 | 4651 | 11504 |
| Người chấm | user | gazetteer | 37 | 3153 | 4037 |
| Người chấm | user | scripture | 37 | 2265 | 2956 |

## Giới hạn đã biết

Làm lại là mọi phiên của nhân vật vượt một người làm và một người chấm mỗi quest; phiên dừng vì hết mana và lượt của máy không tính.

Check đỏ vì file do Elvaria sinh trong worktree hiện ra là đầu ra: phán quyết không nói file của ai làm check đỏ.

crash của người chấm gồm cả CLI chết lẫn phán quyết không hợp lệ.

cancelled gồm cả lần nhả khi Nhiếp chính khởi động lại lẫn lần chủ nhân hủy.

Một mốc thời gian thuộc ngày nó được ghi, theo múi giờ của vương quốc; lệnh của chủ nhân đếm theo dòng command.applied: loại lệnh lấy từ dòng (từ PS-01b) hoặc từ inbox/done, quest lấy từ inbox/done.

Lượt check bị gạt vì môi trường chỉ đếm được trên dòng check.end ghi từ PS-01b; trước đó chúng hiện ra như check đỏ.

Lượt đọc là dòng agent.tool loại read có đường dẫn; dòng không mang phiên chỉ vào tổng. Dòng ghi trước PS-21 còn tính Glob, Grep và LS (agy: grep_search, find_by_name, list_dir) là đọc; từ PS-21 chúng là tìm.

Số lần gọi trước lần sửa đầu đếm các dòng agent.tool của từng phiên người làm, kể cả của học đồ; vai lấy từ nhật ký lượt, nên các phiên thêm bên trong một lượt, mà nhật ký không ghi, bị bỏ qua.

Cỡ prompt tính bằng ký tự, đã cắt khoảng trắng hai đầu, từ dấu vết nạp trên dòng mở phiên (từ PS-01b); phiên theo sau trong một lượt không có.

Thời gian ở một trạng thái tính từ dòng đưa quest vào tới dòng đưa nó đi, đếm vào ngày nó kết thúc; quest còn ở đó thì không tính. Review chưa có người chấm gồm cả lúc máy chạy check.

Lời khuyên "owner" không khuyên gì nên không vào tỉ lệ; merge và new_quest là làm theo khi chủ nhân giao việc cho một quest (handled), shelve khi chủ nhân gác thư. Chỉ tính thư chủ nhân quyết, không tính thư phân loại tự quyết.

Sau lời nhắc chỉ đếm phiên người làm có dòng agent.session.wrap_up (Nhiếp chính ghi lời nhắc khi phiên qua soft_pct) và đã có dòng agent.session.end; phiên còn chạy không tính, và phiên tính vào ngày của lời nhắc. Bị cắt là killed, max_turns hay budget: cầu dao, trần của CLI, hay Nhiếp chính dừng phiên vì lý do khác (hết mana, chủ nhân dừng); phiên kết thúc vì lỗi chỉ vào cột được nhắc. Token thêm chỉ tính khi lời nhắc theo thước token và dòng kết thúc có usage. Bảng không nói lời nhắc của hook có tới model không (câu (f)).

Tiếp sức đếm phiên được nhắc mà một dòng agent.session.usage ghi limit cao hơn lần trước của cùng phiên trên cùng thước: chủ nhân đã nâng ngân sách khi phiên còn chạy.

Bảng bài học đếm theo lượt của người làm, lấy dòng mở phiên đầu của lượt, nên phiên theo sau hay phiên chạy lại không đếm thêm; chỉ lượt có dấu vết nạp theo dòng (từ PS-12) mới có. Trúng và trượt cần dòng nêu loại lỗi nó chữa; dòng đã bị xóa khỏi file kinh vẫn có số đếm nhưng không còn câu. Tác dụng so các lượt thuộc phạm vi của dòng trước lần nạp đầu với các lượt có nạp. Sổ không ghi hệ điều hành của lượt, nên khóa os không lọc ở đây; dòng chỉ người chấm đọc không có lượt người làm để đo, nên cột này trống.
