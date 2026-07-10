# AGENTS.md — Quy Tắc Bắt Buộc GHN Dashboard

## ⛔ QUY TẮC SỐ 1 — KHÔNG ĐƯỢC VI PHẠM

**TUYỆT ĐỐI KHÔNG được:**
- Push code lên branch `main`
- Merge branch `dev` vào `main`
- Deploy lên Netlify (baotuanloc.netlify.app)
- Sửa Google Apps Script đang production

**Mọi phát triển, thử nghiệm, sửa lỗi đều PHẢI thực hiện trên branch `dev`.**

**Chỉ được phép push lên `main` / deploy online KHI ANH TỰ YÊU CẦU bằng lời rõ ràng.**

---

## Môi Trường

| | Branch | URL | Backend |
|---|---|---|---|
| ONLINE Production | `main` | baotuanloc.netlify.app | Google Apps Script |
| OFFLINE Dev | `dev` | http://localhost:3000 | Node.js local |

---

## Quy Trình

Làm trên dev -> Test localhost -> Anh yêu cầu -> Merge main -> Netlify deploy
