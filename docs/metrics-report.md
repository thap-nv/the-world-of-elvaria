# Sổ đo

> Sinh từ một vương quốc bằng `pnpm docs:gen --kingdom <thư mục>`; không sửa file này. Cùng số với `elvaria metrics` (implementation-plan §3.16.1, ADR 0027).

Khoảng: 2026-11-07T19:20:38+07:00 → 2026-11-14T18:38:52+07:00; 9771 dòng event, 70 quest, 134 phán quyết, 289 lệnh đã xử lý.

## Sổ đo (toàn bộ vương quốc)

Lượt: 234 (225 phiên của nhân vật, 9 lượt của máy); 1 phiên dừng vì hết mana; 0 phiên thêm bên trong một lượt.

Làm lại: 98 phiên (hạ tầng 43, đầu ra 49, câu hỏi 6, không rõ 0).

Đạt lượt đầu: 24/61 quest (39 %).

Lỗi lọt (chủ nhân trả bài sau một phán quyết đạt): 1.

Lần cần chủ nhân: 108 lệnh, trên 51 của 70 quest.

Quest được đóng dấu: 39, tổng 28091001 token, trung bình 77.7 phút từ phiên đầu tới phiên cuối.

Lượt check bị gạt vì môi trường (Docker tắt, container mất): 0.

Lượt đọc file: 3201; 280 file bị một phiên đọc hơn một lần.

Lượt hỏi đồ thị code: 0 trong 0 phiên (query 0, path 0, explain 0, affected 0).

Phiên người làm: 120, 114 phiên có sửa file; trước lần sửa đầu: trung vị 12 lần gọi tool, 45 % mọi lần gọi của chúng (trung vị 46 %).

Lần nộp có file đổi ngoài vùng của quest: 0 (0 file).

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

## Làm lại theo nguyên nhân

| Nguyên nhân | Căn cứ | Giá trị | Người làm | Người chấm | Tổng |
|---|---|---|---|---|---|
| hạ tầng | kết thúc phiên | breaker | 25 | 6 | 31 |
| hạ tầng | kết thúc phiên | crash | 2 | 4 | 6 |
| hạ tầng | loại lỗi của phán quyết | flaky | 2 | 2 | 4 |
| hạ tầng | kết thúc phiên | partial | 0 | 1 | 1 |
| hạ tầng | kết thúc phiên | timeout | 1 | 0 | 1 |
| đầu ra | loại lỗi của phán quyết | tests_fail | 8 | 9 | 17 |
| đầu ra | loại lỗi của phán quyết | incomplete | 6 | 4 | 10 |
| đầu ra | loại lỗi của phán quyết | other | 4 | 4 | 8 |
| đầu ra | loại lỗi của phán quyết | wrong_facts | 4 | 4 | 8 |
| đầu ra | loại lỗi của phán quyết | style | 2 | 2 | 4 |
| đầu ra | loại lỗi của phán quyết | scope_creep | 1 | 1 | 2 |
| câu hỏi | kết thúc phiên | blocked | 6 | 0 | 6 |

## Đạt lượt đầu

| Nhóm | Khóa | Đạt | Đã quyết | Tỉ lệ |
|---|---|---|---|---|
| Nghề | astrologer | 0 | 1 | 0 % |
| Nghề | bard | 0 | 1 | 0 % |
| Nghề | knight | 19 | 43 | 44 % |
| Nghề | mage | 2 | 7 | 29 % |
| Nghề | scout | 1 | 3 | 33 % |
| Nghề | scribe | 2 | 6 | 33 % |
| Tag | backend | 10 | 26 | 38 % |
| Tag | db | 1 | 2 | 50 % |
| Tag | docs | 6 | 21 | 29 % |
| Tag | e2e | 3 | 19 | 16 % |
| Tag | frontend | 7 | 25 | 28 % |
| Tag | i18n | 3 | 14 | 21 % |
| Tag | infra | 4 | 5 | 80 % |
| Tag | integration | 0 | 5 | 0 % |
| Model | claude-opus-5-5 | 4 | 14 | 29 % |
| Model | claude-opus-5-5-high | 1 | 1 | 100 % |
| Model | claude-sonnet-5-5 | 13 | 29 | 45 % |
| Model | gemini-3.8-flash-high | 0 | 4 | 0 % |
| Model | gemini-4-argon-medium | 2 | 6 | 33 % |
| Model | gpt-6.1-sol | 4 | 7 | 57 % |
| Dạng | analyze | 0 | 1 | 0 % |
| Dạng | build | 17 | 37 | 46 % |
| Dạng | document | 2 | 6 | 33 % |
| Dạng | fix | 0 | 4 | 0 % |
| Dạng | plan | 2 | 7 | 29 % |
| Dạng | publish | 0 | 1 | 0 % |
| Dạng | refactor | 2 | 2 | 100 % |
| Dạng | research | 1 | 3 | 33 % |
| Lãnh thổ | dc1-se-team | 19 | 48 | 40 % |
| Lãnh thổ | elvaria | 5 | 13 | 38 % |

## Tỉ lệ đạt theo lượt làm

| Lượt | Đạt | Đã quyết | Tỉ lệ |
|---|---|---|---|
| 1 | 24 | 61 | 39 % |
| 2 | 21 | 35 | 60 % |
| 3 | 10 | 14 | 71 % |
| 4 | 4 | 4 | 100 % |

## Lần cần chủ nhân, theo lệnh

| Lệnh | Số lần |
|---|---|
| return | 1 |
| retry | 22 |
| reassign | 9 |
| edit_quest | 66 |
| set_rank | 0 |
| answer | 5 |
| cancel | 5 |

## Lời khuyên của Tể tướng trên các thư đưa lên chủ nhân

Làm theo lời khuyên: 0 trên 0 thư chủ nhân đã quyết sau một lời khuyên (—); thư đưa lên: 1.

| Lời khuyên | Đưa lên | Đã quyết | Quyết như lời khuyên |
|---|---|---|---|
| owner | 1 | 1 | 0 |

## Lỗi lọt

| Quest | Lượt | Loại lỗi | Chấm lại |
|---|---|---|---|
| q_20261109_k8ejj6 | 1 | other | không |

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

## Thời gian ở từng trạng thái (phút, các lần ở đã kết thúc)

| Trạng thái | Số lần | Trung vị | Lâu nhất |
|---|---|---|---|
| Nháp | 12 | 5.4 | 183.4 |
| Mở | 95 | 0.6 | 326.8 |
| Đã nhận | 101 | 0.2 | 16.4 |
| Đang làm | 135 | 3.9 | 206.5 |
| Chờ nghiệm thu, chưa có người chấm | 105 | 2.5 | 205.3 |
| Chờ nghiệm thu, người chấm đang chấm | 99 | 1.4 | 90.0 |
| Bị trả bài | 27 | 0.2 | 21.5 |
| Chờ dấu vua | 40 | 4.5 | 447.6 |
| Xong | 64 | 141.0 | 4968.6 |
| Chờ trả lời | 7 | 9.1 | 20.4 |
| Tạm dừng (hết mana) | 1 | 301.7 | 301.7 |
| Trạm quân y | 30 | 5.3 | 1611.0 |

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

## Thư theo kiểu

| Dạng | Đã lập | Tới chủ nhân | Bạn quyết | Phân loại quyết |
|---|---|---|---|---|
| amendment | 1 | 1 | 1 | 0 |
| proposal | 3 | 0 | 0 | 0 |

## Phản biện theo người chấm đầu

Không có.

## Phản biện đề bài

| Đã lập | Nhận | Bác | Tới chủ nhân | Bị trả sau khi bác |
|---|---|---|---|---|
| 1 | 1 | 0 | 1 | 0 |

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

## Cỡ prompt theo vai và khối (ký tự)

| Vai | Phần | Khối | Phiên | Trung vị | Lớn nhất |
|---|---|---|---|---|---|
| Người làm | — | cả prompt | 20 | 17193 | 51134 |
| Người làm | system | role | 20 | 6842 | 7659 |
| Người làm | system | class | 20 | 1002 | 13349 |
| Người làm | user | continuation | 8 | 15056 | 19004 |
| Người làm | user | quest | 18 | 4427 | 11504 |
| Người làm | user | answer | 2 | 3585 | 6685 |
| Người làm | user | scripture | 18 | 2265 | 2265 |
| Người làm | user | gazetteer | 18 | 1385 | 2524 |
| Người làm | user | memos | 1 | 1163 | 1163 |
| Người làm | user | resumed | 2 | 210 | 210 |
| Người chấm | — | cả prompt | 13 | 34068 | 43897 |
| Người chấm | system | role | 13 | 2827 | 3643 |
| Người chấm | system | class | 13 | 1177 | 1177 |
| Người chấm | user | review | 13 | 22820 | 24918 |
| Người chấm | user | quest | 13 | 4427 | 11504 |
| Người chấm | user | scripture | 13 | 2265 | 2265 |
| Người chấm | user | gazetteer | 13 | 1363 | 2524 |

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
