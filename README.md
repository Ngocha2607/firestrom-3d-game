# Bão Lửa

Game bắn súng màn hình ngang theo phong cách arcade, đồ họa **2.5D/3D bằng Three.js (WebGL 2)**. Mọi mô hình, texture, hiệu ứng và âm thanh đều được tạo bằng code, không dùng file ảnh hay file âm thanh.
Có 3 nhân vật, 3 màn chơi và 3 trùm. Chơi được từ 1 đến 4 người, trên cùng một máy hoặc qua mạng LAN.

## Chạy game

**Chơi trên một máy** (1 người, hoặc nhiều người chung bàn phím và tay cầm):

```bash
node server.js          # hoặc: npm start
```

Mở `http://localhost:8080`. Cũng có thể mở thẳng `index.html` bằng trình duyệt, nhưng khi đó không có chế độ LAN.

**Chơi nhiều máy qua LAN (cùng Wi-Fi):**

1. Trên một máy, chạy `node server.js`. Terminal sẽ in ra địa chỉ dạng `http://192.168.x.x:8080`.
2. Mọi máy (kể cả máy đang chạy server) mở địa chỉ đó trên trình duyệt.
3. Một máy bấm **Tạo phòng**. Máy này chạy trận đấu, nên hãy để cửa sổ của nó luôn mở và hiển thị trên màn hình.
4. Các máy còn lại bấm **Vào phòng**, rồi bấm phím Bắn để tham gia.

Mỗi máy vẫn cắm thêm tay cầm hoặc chơi 2 người chung bàn phím được. Tổng tối đa 4 người.
Chỉ cần Node.js 16 trở lên, không phải cài thêm thư viện nào. Lần đầu chạy, nếu Windows hỏi tường lửa, hãy chọn cho phép trên mạng **Private**.

## Điều khiển

| | Di chuyển / ngắm | Bắn | Nhảy | Lướt | Bão Lửa |
|---|---|---|---|---|---|
| Bàn phím 1 | W A S D | F | G hoặc Space | H | R |
| Bàn phím 2 | Phím mũi tên | `,` hoặc Numpad 1 | `.` hoặc Numpad 2 | `/` hoặc Numpad 3 | L hoặc Numpad 0 |
| Tay cầm | Cần trái / D-pad | X, RB, RT | A | B, LB, LT | Y |

- Giữ ↑ để bắn lên, bắn chéo khi vừa chạy vừa ngắm. Đang trên không thì giữ ↓ để bắn xuống. Đứng yên bấm ↓ để nằm.
- Bấm ↓ + Nhảy khi đứng trên bục mỏng để rơi xuống tầng dưới.
- Lướt giúp vượt hố xa và tránh đạn (không bị trúng đạn trong lúc lướt).
- P / Esc / Start: tạm dừng. M: tắt hoặc bật âm thanh. **Q: đổi chất lượng đồ họa** (Cao: có bóng đổ; Thấp: cho máy yếu).
- Đang chơi mà bấm Bắn trên một thiết bị mới là có thêm người tham gia giữa trận.

## Nội dung game

**Nhân vật**
- **Rex "Thiết Giáp"**: giáp dày, chịu được 2 phát bắn mỗi mạng.
- **Linh "Phong Vân"**: chạy nhanh nhất, nhảy được 2 lần trên không.
- **Tobi "Kỹ Sư"**: có drone hỗ trợ tự bắn kẻ địch gần nhất.

**Vũ khí** (bắn rơi các khoang bay để nhặt):
- **S**: đạn tỏa 5 tia.
- **L**: laser xuyên qua kẻ địch.
- **H**: tên lửa tự tìm mục tiêu.
- **R**: tăng tốc độ bắn.

Chết sẽ mất vũ khí đang dùng.

**Màn chơi**
1. **Cảng Neon**: trời mưa đêm. Trùm là **Cua Thép K-9**, biết nhảy đập đất tạo sóng xung kích.
2. **Lò Dung Nham**: có mạch nham phun lửa. Trùm là **Lò Rèn Vô Cực**, lõi chỉ trúng đạn khi đang mở.
3. **Thành Trên Mây**: đảo bay trên biển mây. Trùm là **Long Hạm Thiên Vân**, rồng bay lượn rồi lao sát mặt đất.

**Cơ chế chơi đội**
- **Bão Lửa**: cả đội tích chung một thanh năng lượng khi hạ địch. Khi đầy, bất kỳ ai bấm phím Bão Lửa sẽ gọi sấm sét đánh mọi kẻ địch trên màn hình, trừ 12% máu trùm và xoá hết đạn địch.
- **Hồi sinh**: người hết mạng biến thành hồn ma. Đồng đội đứng cạnh khoảng 2 giây là cứu sống được. Cả đội cùng hóa hồn ma thì thua.
- Máu trùm và tần suất kẻ địch tăng theo số người chơi.

## Cấu trúc

```
index.html         khung trang, CSS giao diện, điều khiển cảm ứng, bảng LAN
src/vendor/        Three.js r147 + bloom (đã tải về sẵn, chơi được khi không có mạng)
src/data.js        nhân vật, màu người chơi, kích thước thế giới mô phỏng
src/audio.js       âm thanh tổng hợp bằng WebAudio và nhạc nền
src/levels.js      dữ liệu 3 màn chơi
src/models.js      mô hình 3D có khớp: anh hùng, lính, tháp pháo, drone, bọ, trùm, vật phẩm
src/world3d.js     dựng hình: môi trường từng màn, shader nước/dung nham/mây, đèn động,
                   bóng đổ, hạt, vụ nổ, bloom, camera
src/ui.js          giao diện DOM: tiêu đề, chọn nhân vật, HUD, banner, chữ nổi
src/game.js        mô phỏng: vòng lặp, input, vật lý, AI, trùm, chơi đội, LAN
server.js          máy chủ LAN: phục vụ file tĩnh và chuyển tiếp WebSocket
```

Lõi mô phỏng (`game.js`) tách hẳn khỏi phần hiển thị: `world3d.js` và `ui.js` chỉ đọc trạng thái và vẽ.

Kiến trúc LAN: máy chủ phòng chạy toàn bộ mô phỏng ở 60 khung hình/giây. Các máy khách gửi phím bấm lên, và nhận lại ảnh chụp trạng thái 30 lần/giây kèm sự kiện âm thanh. `server.js` chỉ phục vụ `index.html` và thư mục `src/`, và chỉ chuyển tiếp tin nhắn chứ không chạy logic game.

Cần trình duyệt có WebGL 2 (Chrome, Edge, Firefox, Safari bản mới). Nếu máy chạy chậm, bấm **Q** để chuyển sang chất lượng thấp.
