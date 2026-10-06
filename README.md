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
4. Các máy còn lại bấm **Vào phòng**, rồi bấm phím Bắn để tham gia và bấm Bắn lần nữa để sẵn sàng.
5. Khi mọi người đã sẵn sàng, chủ phòng bấm **Bắt đầu** (hoặc Enter, hoặc Bắn thêm một lần) để vào trận. Chỉ chủ phòng chọn được độ khó và chế độ chơi.

Mỗi máy vẫn cắm thêm tay cầm hoặc chơi 2 người chung bàn phím được. Tổng tối đa 4 người.
Chỉ cần Node.js 16 trở lên, không phải cài thêm thư viện nào. Lần đầu chạy, nếu Windows hỏi tường lửa, hãy chọn cho phép trên mạng **Private**.

**Chơi online qua Internet (Cloudflare, miễn phí):**

Bản online chạy trên Cloudflare Workers. Mỗi phòng là một Durable Object riêng, có mã phòng 4 ký tự.

```bash
npm install
npx wrangler login      # chỉ cần làm một lần, đăng nhập tài khoản Cloudflare trên trình duyệt
npm run deploy          # in ra địa chỉ dạng https://bao-lua.<tên-tài-khoản>.workers.dev
```

1. Một người mở địa chỉ đó, vào bước chọn nhân vật rồi bấm **Tạo phòng**. Bảng bên trái hiện mã phòng và link mời dạng `…/?room=ABCD`.
2. Gửi link cho bạn bè. Người được mời mở link, bấm **Vào phòng** (hoặc nhập mã phòng vào ô rồi bấm **Vào phòng**).
3. Máy tạo phòng chạy trận đấu, nên phải để cửa sổ đó luôn mở. Nếu người chơi ở xa nhau, máy ở xa sẽ thấy hơi trễ.

Chạy thử bản Cloudflare trên máy: `npm run dev:cf` rồi mở `http://localhost:8787`.

**AI của Cloudflare (Workers AI):** bản online dùng mô hình `llama-3.3-70b-instruct-fp8-fast` cho 3 việc:

- **Màn của ngày**: ở bước chọn nhân vật, chọn chế độ **Màn của ngày** (bấm nút hoặc phím **N**). AI thiết kế một màn mới mỗi ngày, gồm tên màn, địa hình, kẻ địch, vật phẩm, lời Chỉ huy và câu khiêu khích của trùm. Màn được lưu lại nên cả ngày ai cũng chơi cùng một màn. AI chỉ chọn các đoạn địa hình; khoảng cách hố, độ cao bậc và vị trí bục do code tự đặt ([src/daily.js](src/daily.js)), nên màn luôn vượt qua được.
- **Bộ đàm**: ở chế độ Chiến dịch, khi bắt đầu chơi AI viết lời Chỉ huy giao nhiệm vụ và câu khiêu khích của trùm cho cả 7 màn (một lần gọi, mất khoảng 10–20 giây, nên lời đầu tiên hiện ra sau khi màn 1 đã bắt đầu).
- **Tổng kết trận**: khi thắng hoặc cả đội ngã, AI bình luận vài câu dựa trên điểm, số địch hạ và số lần bị hạ của từng người.

Không cần cài thêm gì: `npm run deploy` tự bật Workers AI theo [wrangler.toml](wrangler.toml). Gói miễn phí có 10.000 "neuron" mỗi ngày. Mỗi lượt chơi chiến dịch tốn khoảng 250 neuron, màn của ngày khoảng 200 neuron cho cả ngày. Hết lượt miễn phí thì game vẫn chạy bình thường, chỉ không có lời thoại AI. Mỗi địa chỉ IP gọi được tối đa 6 lần mỗi phút.
AI viết bằng **tiếng Anh** (mô hình viết tiếng Anh tốt và ổn định hơn). Muốn chuyển sang tiếng Việt thì đổi `AI_LANG = "vi"` trong `wrangler.toml`; màn của ngày đã tạo trước đó vẫn giữ ngôn ngữ cũ.
Muốn tắt AI thì xóa khối `[ai]` trong `wrangler.toml`. Khi chạy LAN (`node server.js`) hoặc khi AI lỗi, Màn của ngày được tạo ngẫu nhiên theo ngày (máy chủ phòng và người vào phòng vẫn chơi cùng một màn).

## Điều khiển

Mỗi người chơi dùng **bàn phím của riêng mình** (cả bàn phím điều khiển một nhân vật):

| | Di chuyển / ngắm | Bắn | Nhảy | Lướt | Bão Lửa |
|---|---|---|---|---|---|
| Bàn phím | W A S D hoặc phím mũi tên | J hoặc Z | K, X hoặc Space | L, C hoặc Shift | I hoặc V |
| Tay cầm | Cần trái / D-pad | X, RB, RT | A | B, LB, LT | Y |

**4 người, 4 bàn phím:** mỗi người ngồi một máy và vào chung phòng qua mạng LAN (xem bên trên).
Trình duyệt không phân biệt được nhiều bàn phím cắm vào **cùng một máy**: cắm 4 bàn phím vào một PC thì cả 4 sẽ điều khiển chung một nhân vật.
Muốn thêm người trên cùng một máy thì cắm tay cầm. Nếu thật sự cần 2 người chung một bàn phím, bấm **Tab** ở màn chọn nhân vật để bật chế độ chia đôi:
người bên trái dùng W A S D + F/G/H/R, người bên phải dùng phím mũi tên + `,` `.` `/` L.

- **Tự bắn** bật sẵn cho mọi người: không cần giữ phím Bắn, chỉ cần di chuyển và ngắm. Ở sảnh chọn nhân vật, mỗi người bấm phím Bão Lửa (I / V, tay cầm Y) để bật hoặc tắt cho riêng mình.
- Giữ ↑ để bắn lên, bắn chéo khi vừa chạy vừa ngắm. Đang trên không thì giữ ↓ để bắn xuống. Đứng yên bấm ↓ để nằm.
- Bấm ↓ + Nhảy khi đứng trên bục mỏng để rơi xuống tầng dưới.
- Lướt giúp vượt hố xa và tránh đạn (không bị trúng đạn trong lúc lướt).
- P / Esc / Start: tạm dừng. M: tắt hoặc bật âm thanh. **Q: đổi chất lượng đồ họa** (Cao: có bóng đổ; Thấp: cho máy yếu).
- Đang chơi mà bấm Bắn trên một thiết bị mới là có thêm người tham gia giữa trận.

## Độ khó

Chọn ở sảnh chọn nhân vật (bấm nút trên màn hình, hoặc ↑ / ↓ trên bàn phím hay tay cầm của bất kỳ người chơi nào):

| | Dễ | Thường | Khó |
|---|---|---|---|
| Mạng mỗi người | 5 | 3 | 2 |
| Giáp | +1 lớp cho mọi nhân vật | như thiết kế | như thiết kế |
| Địch bắn | thưa hơn, đạn chậm hơn 20% | bình thường | dày hơn, đạn nhanh hơn 25% |
| Máu trùm | ×0.75 | ×1 | ×1.35 |
| Điểm | ×0.75 | ×1 | ×1.5 |

## Nội dung game

**Nhân vật** (5)
- **Rex "Thiết Giáp"**: giáp dày, chịu được 2 phát bắn mỗi mạng.
- **Linh "Phong Vân"**: chạy nhanh nhất, nhảy được 2 lần trên không.
- **Tobi "Kỹ Sư"**: có drone hỗ trợ tự bắn kẻ địch gần nhất.
- **Mai "Lưu Tinh"**: xạ thủ, mọi phát bắn mạnh hơn 40% và đạn bay nhanh hơn.
- **Bảo "Ảnh Phong"**: ninja, lướt xuyên kẻ địch gây sát thương, thời gian hồi lướt chỉ bằng một nửa.

**Vũ khí** (bắn rơi các khoang bay để nhặt; chết sẽ mất vũ khí)
- **S** Đạn tỏa: 5 tia.
- **L** Laser: xuyên qua kẻ địch, xuyên cả khiên.
- **H** Tên lửa: tự tìm mục tiêu.
- **F** Súng lửa: tầm ngắn, phun liên tục, xuyên nhiều kẻ địch.
- **B** Bom chùm: ném vòng cung, nổ lan, rồi bắn ra 4 bom con.
- **T** Sấm sét: tia điện đánh ngay mục tiêu phía trước và nảy sang tối đa 3 mục tiêu khác.
- **R** Bắn nhanh: tăng tốc độ bắn cho vũ khí đang cầm.

**Vật phẩm hỗ trợ** (có trong khoang tiếp tế mỗi màn; hạ địch cũng có xác suất nhỏ rơi Giáp, Khiên hoặc Pin, tháp pháo rơi nhiều hơn)
- **Hộp giáp (+)**: +1 lớp giáp, tối đa vượt mức gốc 1 lớp; nhân vật nào cũng nhặt được.
- **Khiên năng lượng**: bất tử 8 giây, đạn địch chạm vào bị vỡ; nhấp nháy khi sắp hết.
- **Tim**: +1 mạng. Mỗi màn có một khoang chứa Tim ngay trước đấu trường trùm.
- **Pin Bão Lửa**: nạp ngay 50% thanh Bão Lửa của cả đội.

Lõi của khoang tiếp tế nhấp nháy theo màu của món đồ bên trong, nhìn là biết trước sẽ rơi ra gì.

**Màn chơi** (7, gồm 3 kiểu chơi)
1. **Cảng Neon** (cuộn ngang): mưa đêm. Trùm **Cua Thép K-9** nhảy đập đất tạo sóng xung kích.
2. **Pháo Đài Ngầm** (góc nhìn sau lưng, kiểu màn Căn cứ của Contra): đứng ở mép trước hành lang, bắn sâu vào trong.
   Mỗi phòng có các lõi năng lượng trên tường; phá hết lõi phụ thì lõi chính lộ ra, phá lõi chính để sang phòng sau.
   Hàng rào điện bật tắt sẽ chặn đạn (laser xuyên qua được). Lính chạy ra từ hai cửa; đạn ngang ngực thì **nằm (↓)** để né,
   lựu đạn lăn sát đất thì **nhảy** qua. Giữ **↑ + ←/→** để bắn chéo. Qua 3 phòng là tới trùm **Cổng Pháo Đài**: lõi chỉ trúng
   được khi cổng mở, kèm 4 tháp pháo.
3. **Lò Dung Nham** (cuộn ngang): mạch nham phun lửa. Trùm **Lò Rèn Vô Cực**, lõi chỉ trúng đạn khi đang mở.
4. **Thác Sấm** (cuộn dọc, kiểu màn Thác nước của Contra): leo ngược thác nước qua các bục gỗ, có đá lăn từ trên xuống.
   Rơi khỏi đáy màn hình là mất mạng. Camera đi theo người leo cao nhất nhưng không bỏ rơi người ở dưới.
   Trùm **Thần Đá Thác Sấm**: miệng mở ra mới bắn được lõi lửa bên trong; hai bàn tay đá đập xuống tạo sóng xung kích.
5. **Thành Trên Mây** (cuộn ngang): đảo bay, biển mây. Trùm **Long Hạm Thiên Vân** bay lượn rồi lao sát mặt đất.
6. **Hầm Băng** (cuộn ngang): mặt băng trơn trượt, cột băng rơi. Trùm **Voi Băng MK-II** phun băng và húc ngang đấu trường.
7. **Trạm Nguyệt Cầu** (cuộn ngang): trọng lực thấp. Trùm cuối **Mắt Thần Nguyệt** có giáp xoay, laser có cảnh báo, gọi drone.

**Kẻ địch:** lính robot, **lính khiên** (chặn đạn bắn thẳng từ phía trước; bắn từ trên cao, từ phía sau, hoặc dùng laser/bom/sấm sét),
tháp pháo, drone, bọ nhảy, mạch nham, cột băng.

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
worker/index.js    bản online trên Cloudflare: Worker phục vụ file tĩnh, mỗi phòng một Durable Object chuyển tiếp WebSocket
worker/build.js    chép index.html + src/ vào dist/ trước khi deploy
wrangler.toml      cấu hình Cloudflare
```

Lõi mô phỏng (`game.js`) tách hẳn khỏi phần hiển thị: `world3d.js` và `ui.js` chỉ đọc trạng thái và vẽ.

Kiến trúc LAN: máy chủ phòng chạy toàn bộ mô phỏng ở 60 khung hình/giây. Các máy khách gửi phím bấm lên, và nhận lại ảnh chụp trạng thái 30 lần/giây kèm sự kiện âm thanh. `server.js` chỉ phục vụ `index.html` và thư mục `src/`, và chỉ chuyển tiếp tin nhắn chứ không chạy logic game.

Cần trình duyệt có WebGL 2 (Chrome, Edge, Firefox, Safari bản mới). Nếu máy chạy chậm, bấm **Q** để chuyển sang chất lượng thấp.
