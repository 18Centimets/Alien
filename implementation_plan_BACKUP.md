# Kế Hoạch Triển Khai: Module "Sức Khỏe Hạ Tầng Kho"

## Mục tiêu
Thêm module **"Sức Khỏe Hạ Tầng"** vào Dashboard GHN Command Center, hiển thị trực quan tình trạng 6 nhóm hạ tầng kho Hưng Yên theo hệ thống mã màu 4 cấp (Xanh/Vàng/Cam/Đỏ).

## Câu hỏi cần xác nhận

> [!IMPORTANT]
> Mày cần trả lời 2 câu hỏi này trước khi tao bắt tay vào code:

### Câu 1: Dữ liệu kiểm tra hạ tầng hiện ở đâu?
- **(A)** Mày **đã có** file Excel kiểm tra hạ tầng trên máy → Gửi cho tao hoặc cho tao biết đường dẫn file.
- **(B)** Mày **chưa có** file nào → Tao sẽ tạo Google Sheet mẫu sẵn cho mày, mày chỉ cần điền vào.

### Câu 2: Mày muốn nhập dữ liệu ở đâu?
- **(A)** Trực tiếp trên **Google Sheet** (đồng bộ tự động lên Dashboard — khuyến nghị)
- **(B)** Trên **Excel máy tính** rồi tao viết script chuyển lên

---

## Giai đoạn triển khai (4 bước)

### Bước 1: Tạo Google Sheet "Kiểm Tra Hạ Tầng" *(Tao làm)*
Tao sẽ thiết kế cấu trúc Sheet với các cột:

| Cột | Ý nghĩa | Ví dụ |
|---|---|---|
| Ngày kiểm tra | Ngày thực hiện kiểm tra | 15/05/2026 |
| Nhóm | 1 trong 6 nhóm hạ tầng | Nhóm 3 — PCCC |
| Hạng mục | Tên thiết bị/hệ thống cụ thể | Sprinkler khu B |
| Tình trạng | Tốt / Khá / TB / Kém | Kém |
| Mô tả | Chi tiết vấn đề | Rỉ sét 3 đầu phun |
| Hành động | Đề xuất xử lý | Thay thế khẩn cấp |
| Người kiểm tra | Ai thực hiện | Nguyễn Văn Bảo |

---

### Bước 2: Cập nhật Apps Script *(Mày dán code tao gửi)*
Thêm đoạn đọc Sheet "Kiểm tra hạ tầng" vào Apps Script hiện tại, tương tự cách đã làm với "Cấp phát các BC" và "Nhật ký xe nâng".

#### [MODIFY] Apps Script (trên Google Sheet của mày)
- Thêm đọc sheet mới `infraHealth`
- Trả về mảng các hạng mục kèm tình trạng + nhóm

---

### Bước 3: Xây dựng UI trên Dashboard *(Tao code)*

#### [MODIFY] [index.html](file:///e:/Học AI/Bài tập/ghn-dashboard/index.html)
- Thêm nav item **"Sức Khỏe Kho"** vào sidebar (sau "Nhật Ký Xe Nâng")
- Thêm section mới `#infra-health` với:
  - 6 ô KPI (mỗi nhóm 1 ô) với % sức khỏe + mã màu
  - Biểu đồ tròn (Pie chart) tỷ lệ 4 mức
  - Bảng "Top 10 hạng mục cần xử lý gấp"
  - Banner cảnh báo khi có hạng mục ĐỎ

#### [MODIFY] [app.js](file:///e:/Học AI/Bài tập/ghn-dashboard/app.js)
- Thêm hàm `fetchInfraHealth()` để lấy dữ liệu từ API
- Thêm hàm `renderInfraHealthModule()` để vẽ 6 ô + biểu đồ + bảng
- Tính toán % sức khỏe: `(số Tốt + số Khá) / tổng * 100`
- Logic mã màu: Xanh ≥80%, Vàng 60-79%, Cam 40-59%, Đỏ <40%

#### [MODIFY] [index.css](file:///e:/Học AI/Bài tập/ghn-dashboard/index.css)
- CSS cho 6 ô KPI dạng grid
- Hiệu ứng nhấp nháy cho cảnh báo ĐỎ
- Badge màu theo 4 cấp

---

### Bước 4: Đồng bộ lên Netlify *(Tao chạy lệnh git)*
```bash
git add . && git commit -m "feat: add infrastructure health module" && git push
```

---

## Giao diện dự kiến

```
┌──────────────────────────────────────────────────────────────┐
│  🏭 SỨC KHỎE HẠ TẦNG KHO HƯNG YÊN                         │
│  Kỳ kiểm tra: 15/05/2026 | Người KT: Nguyễn Văn Bảo        │
│                                                              │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐                     │
│  │ 🏗️ XÂY   │ │ ⚡ ĐIỆN   │ │ 🔥 PCCC  │                     │
│  │ DỰNG     │ │          │ │          │                      │
│  │  🟢 92%  │ │  🟡 78%  │ │  🔴 45%  │                     │
│  │ Ổn định  │ │ ↓ Giảm   │ │ ⚠ KHẨN   │                     │
│  └──────────┘ └──────────┘ └──────────┘                      │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐                     │
│  │ 🚜 VẬN   │ │ 💻 CNTT  │ │ ❄️ HVAC  │                     │
│  │ HÀNH     │ │ & AN NINH│ │          │                      │
│  │  🟢 88%  │ │  🟡 72%  │ │  🟢 90%  │                     │
│  │ ↑ Tốt lên│ │ Ổn định  │ │ Ổn định  │                     │
│  └──────────┘ └──────────┘ └──────────┘                      │
│                                                              │
│  ⚠️ CẢNH BÁO: 2 hạng mục ĐỎ — Xử lý trong 48h             │
│  ┌──────────────────────────────────────────────────────┐    │
│  │ TOP 10 HẠNG MỤC CẦN XỬ LÝ GẤP                      │    │
│  │ #  Nhóm    Hạng mục              Tình trạng  Hành động│   │
│  │ 1  PCCC    Sprinkler khu B       🔴 Kém     Thay thế │    │
│  │ 2  PCCC    Đèn khẩn cấp khu C   🔴 Kém     Thay pin │    │
│  │ 3  Điện    Tủ MSB                🟠 TB      Bảo trì  │    │
│  │ ...                                                   │    │
│  └──────────────────────────────────────────────────────┘    │
│                                                              │
│  [🥧 Biểu đồ tròn tỷ lệ 4 mức]  [📊 So sánh 2 kỳ]        │
└──────────────────────────────────────────────────────────────┘
```

## Verification Plan

### Kiểm tra tự động
- Mở Dashboard local → xem module mới có hiển thị đúng không
- Kiểm tra API Apps Script trả về dữ liệu `infraHealth`
- Push lên GitHub → kiểm tra trên baotuanloc.netlify.app

### Kiểm tra thủ công
- Nhập 1 hạng mục ĐỎ vào Sheet → xác nhận banner cảnh báo xuất hiện
- Nhập đủ 6 nhóm → xác nhận 6 ô KPI hiện đúng %
