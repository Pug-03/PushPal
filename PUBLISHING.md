# วิธีเอา PushPal ขึ้น GitHub, VS Code Marketplace และ Open VSX

คู่มือนี้เขียนสำหรับมือใหม่ ทำตามทีละขั้นได้เลย คำสั่งทั้งหมดให้รันในโฟลเดอร์ `pushpal/`

> สิ่งที่ต้องมี: บัญชี GitHub, Node.js 20 ขึ้นไป (`node -v`), git

---

## ส่วนที่ 0 — ตรวจของก่อนปล่อย (ทำทุกครั้ง)

```bash
npm ci
npm test          # ต้องผ่านทั้งหมด
npm run package   # ได้ไฟล์ pushpal-1.0.0.vsix
```

ลองติดตั้งไฟล์ .vsix ในเครื่องตัวเองก่อน: VS Code → `⇧⌘P` → **Extensions: Install from VSIX…**

### เปลี่ยนค่าที่เป็นของคุณใน `package.json`

| ช่อง | ตอนนี้ | ต้องเป็น |
|---|---|---|
| `publisher` | `pushpal` | **Publisher ID ของคุณ** ที่จะสร้างในส่วนที่ 2 |
| `repository.url`, `bugs.url`, `homepage` | `github.com/Pug-03/PushPug` | URL repo จริงของคุณ |

และแก้ชื่อใน `LICENSE` ถ้าต้องการ (ตอนนี้ใส่ `Pug-03`)

> ID ของส่วนขยายจะเป็น `<publisher>.pushpal` โค้ดอ่านค่านี้ตอนรันเอง ไม่ต้องแก้ที่อื่น

---

## ส่วนที่ 1 — ขึ้น GitHub

1. ไปที่ <https://github.com/new>
   - Repository name: `pushpal`
   - เลือก **Public**
   - **ไม่ต้อง** ติ๊ก Add README / .gitignore / license (เรามีแล้ว)
   - กด **Create repository**
2. ในเทอร์มินัล (โฟลเดอร์ `pushpal/`):
   ```bash
   git remote add origin https://github.com/<ชื่อคุณ>/pushpal.git
   git push -u origin main
   ```
3. เปิดแท็บ **Actions** ใน GitHub จะเห็น CI รันเทสต์บน Ubuntu, macOS, Windows รอให้เป็นสีเขียว

### ปล่อยเวอร์ชันพร้อมไฟล์ .vsix บน GitHub Releases

CI จะสร้าง .vsix และแนบใน Release ให้อัตโนมัติเมื่อคุณสร้าง tag ที่ขึ้นต้นด้วย `v`:

```bash
git tag v1.0.0
git push origin v1.0.0
```

รอสักครู่ แล้วดูที่แท็บ **Releases** ของ repo จะมี `pushpal-1.0.0.vsix` ให้ดาวน์โหลด

> รอบถัดไป: แก้ `version` ใน `package.json` + เพิ่มหัวข้อใน `CHANGELOG.md` → commit → `git tag v1.0.1` → push tag

---

## ส่วนที่ 2 — ขึ้น VS Code Marketplace

### 2.1 สร้าง Publisher (ครั้งเดียว)

1. ไปที่ <https://marketplace.visualstudio.com/manage> แล้วล็อกอินด้วยบัญชี Microsoft
2. กด **Create publisher**
   - **ID**: ชื่อสั้นๆ ไม่มีช่องว่าง เช่น `pug03` (เปลี่ยนทีหลังไม่ได้)
   - **Name**: ชื่อที่จะโชว์ เช่น `Pug-03`
3. เอา ID นี้ไปใส่ช่อง `publisher` ใน `package.json` แล้ว commit

### 2.2 สร้าง Personal Access Token (PAT)

1. ไปที่ <https://dev.azure.com> (ล็อกอินบัญชีเดียวกัน ถ้าถามให้สร้าง organization ก็สร้างชื่ออะไรก็ได้)
2. มุมขวาบน รูปคน/ไอคอนตั้งค่า → **Personal access tokens** → **New Token**
   - Name: `vsce`
   - Organization: **All accessible organizations** (สำคัญ)
   - Expiration: เลือกได้สูงสุด 1 ปี
   - Scopes: กด **Show all scopes** → หา **Marketplace** → ติ๊ก **Manage**
3. กด Create แล้ว **ก๊อป token เก็บไว้** (จะไม่แสดงอีก)

### 2.3 Publish

```bash
npx vsce login <publisher-id>     # วาง token ที่ก๊อปไว้
npx vsce publish                  # สร้างแพ็กเกจและอัปโหลด
```

ภายในไม่กี่นาทีจะค้นเจอใน Marketplace (บางครั้งต้องรอตรวจสอบ ~5–10 นาที)

> ภาพใน README บน Marketplace ดึงจาก GitHub ตาม `repository.url` ดังนั้นต้อง push ขึ้น GitHub ก่อน publish

---

## ส่วนที่ 3 — ขึ้น Open VSX (สำหรับ VSCodium, Cursor, Gitpod ฯลฯ)

1. ไปที่ <https://open-vsx.org> → **Log in** ด้วย GitHub
2. ไปที่ Settings ของคุณ → ยอมรับ **Eclipse Foundation Publisher Agreement** (ต้องสร้างบัญชี Eclipse และใส่ชื่อ GitHub ให้ตรงกัน)
3. Settings → **Access Tokens** → **Generate New Token** → ก๊อปเก็บไว้
4. สร้าง namespace ให้ตรงกับ `publisher` (ครั้งเดียว):
   ```bash
   npx ovsx create-namespace <publisher-id> -p <open-vsx-token>
   ```
5. Publish ไฟล์ .vsix ที่สร้างไว้:
   ```bash
   npx ovsx publish pushpal-1.0.0.vsix -p <open-vsx-token>
   ```

---

## ให้ CI publish ให้อัตโนมัติ (แนะนำ)

`.github/workflows/ci.yml` มี step publish ขึ้น Marketplace และ Open VSX อยู่แล้ว ทำงานเมื่อ push tag `v*` และมี secret ครบ (ถ้ายังไม่ใส่ secret ขั้นนั้นจะถูกข้าม ไม่ทำให้ CI พัง)

ตั้งค่าครั้งเดียว: GitHub repo → Settings → Secrets and variables → Actions → New repository secret

- `VSCE_PAT` = token จากส่วนที่ 2.2
- `OVSX_PAT` = token จากส่วนที่ 3

### ปล่อยเวอร์ชันใหม่ (ทุกครั้ง)

1. เพิ่มหัวข้อเวอร์ชันใหม่ใน `CHANGELOG.md` แล้ว commit ให้ working tree สะอาด
2. รัน:
   ```bash
   npm run release
   ```
   คำสั่งนี้ขึ้นเลข `version` (เช่น 1.0.0 → 1.0.1) + commit + สร้าง tag `v1.0.1` + push ขึ้น GitHub
3. CI รันเทสต์ → แนบ .vsix ใน GitHub Releases → publish ขึ้น Marketplace/Open VSX
4. คนใช้ได้อัปเดตอัตโนมัติภายในไม่กี่ชั่วโมง ไม่ต้องทำอะไร

> ถ้าเป็นฟีเจอร์ใหม่ใช้ `npm version minor` (1.0.x → 1.1.0) แทน แล้ว `git push --follow-tags`

---

## เช็กลิสต์ก่อนกด publish

- [ ] `publisher` และ URL ใน `package.json` เป็นของคุณแล้ว
- [ ] `npm test` ผ่าน, CI บน GitHub เป็นสีเขียว
- [ ] ลองติดตั้ง .vsix ในเครื่องแล้ว wizard เปิดเอง, ดึงโค้ดได้, แจ้งเตือนขึ้น
- [ ] `version` ใน `package.json` ใหม่กว่าเวอร์ชันที่เคยปล่อย และอัปเดต `CHANGELOG.md` แล้ว
- [ ] repo บน GitHub เป็น Public และ push แล้ว (ภาพใน README จะได้ขึ้น)
