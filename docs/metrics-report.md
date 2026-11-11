# Sổ đo

> Sinh từ một vương quốc bằng `pnpm docs:gen --kingdom <thư mục>`; không sửa file này. Cùng số với `elvaria metrics` (implementation-plan §3.16.1, ADR 0027).

Khoảng: 2026-11-07T19:20:38+07:00 → 2026-11-11T10:03:53+07:00; 4661 dòng event, 46 quest, 69 phán quyết, 144 lệnh đã xử lý.

## Sổ đo (toàn bộ vương quốc)

Lượt: 116 (111 phiên của nhân vật, 5 lượt của máy); 1 phiên dừng vì hết mana; 0 phiên thêm bên trong một lượt.

Làm lại: 43 phiên (hạ tầng 15, đầu ra 25, câu hỏi 3, không rõ 0).

Đạt lượt đầu: 15/31 quest (48 %).

Lỗi lọt (chủ nhân trả bài sau một phán quyết đạt): 1.

Lần cần chủ nhân: 49 lệnh, trên 23 của 41 quest.

Quest được đóng dấu: 21, tổng 14391324 token, trung bình 47.9 phút từ phiên đầu tới phiên cuối.

## Theo ngày

| Ngày | Lượt | Làm lại (hạ tầng/đầu ra/câu hỏi/không rõ) | Đạt lượt đầu | Lệnh chủ nhân |
|---|---|---|---|---|
| 2026-11-07 | 3 | 0 (0/0/0/0) | 1/1 | 1 |
| 2026-11-08 | 49 | 19 (4/12/3/0) | 6/13 | 26 |
| 2026-11-09 | 36 | 14 (6/8/0/0) | 5/11 | 12 |
| 2026-11-10 | 20 | 9 (4/5/0/0) | 2/4 | 8 |
| 2026-11-11 | 8 | 1 (1/0/0/0) | 1/2 | 2 |

## Làm lại theo nguyên nhân

| Nguyên nhân | Căn cứ | Giá trị | Người làm | Người chấm | Tổng |
|---|---|---|---|---|---|
| hạ tầng | kết thúc phiên | breaker | 8 | 4 | 12 |
| hạ tầng | kết thúc phiên | crash | 2 | 1 | 3 |
| đầu ra | loại lỗi của phán quyết | tests_fail | 5 | 4 | 9 |
| đầu ra | loại lỗi của phán quyết | style | 2 | 2 | 4 |
| đầu ra | loại lỗi của phán quyết | other | 2 | 2 | 4 |
| đầu ra | loại lỗi của phán quyết | wrong_facts | 2 | 2 | 4 |
| đầu ra | loại lỗi của phán quyết | incomplete | 2 | 2 | 4 |
| câu hỏi | kết thúc phiên | blocked | 3 | 0 | 3 |

## Đạt lượt đầu

| Nhóm | Khóa | Đạt | Đã quyết | Tỉ lệ |
|---|---|---|---|---|
| Nghề | astrologer | 0 | 1 | 0 % |
| Nghề | bard | 0 | 1 | 0 % |
| Nghề | knight | 11 | 18 | 61 % |
| Nghề | mage | 1 | 4 | 25 % |
| Nghề | scout | 1 | 3 | 33 % |
| Nghề | scribe | 2 | 4 | 50 % |
| Tag | backend | 5 | 9 | 56 % |
| Tag | docs | 5 | 10 | 50 % |
| Tag | e2e | 1 | 6 | 17 % |
| Tag | frontend | 4 | 10 | 40 % |
| Tag | i18n | 1 | 2 | 50 % |
| Tag | infra | 4 | 5 | 80 % |
| Model | claude-opus-5-5 | 2 | 6 | 33 % |
| Model | claude-opus-5-5-high | 1 | 1 | 100 % |
| Model | claude-sonnet-5-5 | 10 | 17 | 59 % |
| Model | gemini-3.8-flash-high | 0 | 2 | 0 % |
| Model | gemini-4-argon-medium | 2 | 5 | 40 % |
| Dạng | analyze | 0 | 1 | 0 % |
| Dạng | build | 10 | 16 | 63 % |
| Dạng | document | 2 | 4 | 50 % |
| Dạng | fix | 0 | 1 | 0 % |
| Dạng | plan | 1 | 4 | 25 % |
| Dạng | publish | 0 | 1 | 0 % |
| Dạng | refactor | 1 | 1 | 100 % |
| Dạng | research | 1 | 3 | 33 % |

## Lần cần chủ nhân, theo lệnh

| Lệnh | Số lần |
|---|---|
| return | 1 |
| retry | 8 |
| reassign | 2 |
| edit_quest | 32 |
| set_rank | 0 |
| answer | 3 |
| cancel | 3 |

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
| q_20261111_4xysc9 | build | knight | 2 | 0/0/0/0 | có | 271765 | 0 |
| q_20261111_7pzkfv | research | scout | 2 | 1/0/0/0 | không | 249913 | 2 |
| q_20261111_7yenh5 | build | knight | 1 | 0/0/0/0 | — | 150075 | 0 |
| q_20261111_cmemx7 | build | knight | 1 | 0/0/0/0 | — | 0 | 0 |
| q_20261111_hb5d6q | analyze | — | 1 | 0/0/0/0 | — | 0 | 0 |
| q_20261111_rxdmz4 | build | knight | 1 | 0/0/0/0 | — | 0 | 0 |

## Giới hạn đã biết

Làm lại là mọi phiên của nhân vật vượt một người làm và một người chấm mỗi quest; phiên dừng vì hết mana và lượt của máy không tính.

Check đỏ vì file do Elvaria sinh trong worktree hiện ra là đầu ra: phán quyết không nói file của ai làm check đỏ.

crash của người chấm gồm cả CLI chết lẫn phán quyết không hợp lệ.

cancelled gồm cả lần nhả khi Quản sự khởi động lại lẫn lần chủ nhân hủy.

Một mốc thời gian thuộc ngày nó được ghi, theo múi giờ của vương quốc; lệnh của chủ nhân đếm từ inbox/done, chỉ lệnh có dòng command.applied.
