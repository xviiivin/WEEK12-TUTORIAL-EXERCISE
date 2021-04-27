# WEEK13-EXERCISE

ในสัปดาห์นี้เราจะเรียนเกี่ยวกับการทำระบบ Authentication และ Authorization โดยพระเอกในสัปดาห์นี้คือตัว [Middleware](https://expressjs.com/en/guide/using-middleware.html) ของ express.js

โดยสิ่งที่เราจะทำกันในสัปดาห์นี้คือ

- Login Page
- Login API
- เก็บ Token ใน LocalStorage
- ใส่ Token ใน header เวลาเรียกใช้ API
- IsLoggedIn Middleware
- Navigation Guard
- ซ่อนปุ่มแก้ไข/ปุ่มลบ
- IsOwner Middleware

# Setup

## Setup Database

ในสัปดาห์นี้มีการเพิ่มตารางใหม่เข้ามาใน Database คือตาราง `tokens`

```SQL
CREATE TABLE `tokens` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `user_id` bigint(20) unsigned NOT NULL,
  `token` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `tokens_UN` (`token`),
  KEY `token_FK` (`user_id`),
  CONSTRAINT `token_FK` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
)
```

นักศีกษาสามารถสร้างตารางใหม่เองหรือใช้การ import ข้อมูลจาก `db/webpro-3.sql` ก็ได้

## Clone / Download

```bash
git clone https://github.com/it-web-pro/WEEK12-EXERCISE.git
```

## Backend Server

```bash
cd backend
npm install
npm run serve
```

## Frontend Server

```bash
cd frontend
npm install
npm run serve
```

ลองตรวจสอบดูว่าใช้งานได้

- <http://localhost:3000>
- <http://localhost:8080/#/>
- <http://localhost:8080/#/user/login>

# Tutorial

## 1. Logger Middleware

เพื่อเป็นการทำความเข้าใจพื้นฐานเกี่ยวกับ Middleware เราจะมาทดลองทำ Middleware สำหรับให้พิมพ์ request ที่เข้ามาทุกอันเช่น

```bash
Example app listening at http://localhost:3000
2021-04-27T10:19:21 | OPTIONS: /user/me
2021-04-27T10:19:21 | GET: /user/me
2021-04-27T10:19:21 | OPTIONS: /?search=
2021-04-27T10:19:21 | GET: /?search=
```

สร้าง Logger Middleware ในไฟล์ `backend/middlewares/index.js`

```javascript
-------------------------------------------------------------------
File: backend/middlewares/index.js
-------------------------------------------------------------------
+ | async function logger (req, res, next) {
+ |     const timestamp = new Date().toISOString().substring(0, 19)
+ |     console.log(`${timestamp} | ${req.method}: ${req.originalUrl}`)
+ |     next()
+ | }
  |
+ | module.exports = {
+ |     logger
+ | }
```

สั่งใช้งาน Logger Middleware ของเราในระดับ Application-Level

```javascript
-------------------------------------------------------------------
File: backend/index.js
-------------------------------------------------------------------
  | const express = require("express")
  | 
  | const app = express();
  | const cors = require('cors')
+ | const { logger } = require('./middlewares')
+ | app.use(logger)
  | app.use(cors())
  | 
  | // Statics
  | app.use(express.static('static'))
  | app.use(express.json())
  | // ...
```

ทดลองยิง request จาก Postman แล้วดูรายการ log ใน console ของ backend

## 2. Login API

ตัวอย่าง Request & Response

```txt
POST /user/login
Payment: 
    username: admi"
    password: Aa123456
Response: 
    { token: "jscRQI1EC!kKdW#en@swQA5jZ9wySb5..." }
```

โค๊ด

```javascript
-------------------------------------------------------------------
File: backend/routes/user.js
-------------------------------------------------------------------
  | const express = require("express")
  | const pool = require("../config")
  | const Joi = require('joi')
  | const bcrypt = require('bcrypt');
+ | const { generateToken } = require("../utils/token");
  |
  | router.post('/user/signup', async (req, res, next) => {
  | // ...
  | })
  |
+ | const loginSchema = Joi.object({
+ |     username: Joi.string().required(),
+ |     password: Joi.string().required()
+ | })
+ | 
+ | router.post('/user/login', async (req, res, next) => {
+ |     try {
+ |         await loginSchema.validateAsync(req.body, { abortEarly: false })
+ |     } catch (err) {
+ |         return res.status(400).send(err)
+ |     }
+ |     const username = req.body.username
+ |     const password = req.body.password
+ | 
+ |     const conn = await pool.getConnection()
+ |     await conn.beginTransaction()
+ | 
+ |     try {
+ |         // Check if username is correct
+ |         const [users] = await conn.query(
+ |             'SELECT * FROM users WHERE username=?', 
+ |             [username]
+ |         )
+ |         const user = users[0]
+ |         if (!user) {    
+ |             throw new Error('Incorrect username or password')
+ |         }
+ | 
+ |         // Check if password is correct
+ |         if (!(await bcrypt.compare(password, user.password))) {
+ |             throw new Error('Incorrect username or password')
+ |         }
+ | 
+ |         // Check if token already existed
+ |         const [tokens] = await conn.query(
+ |             'SELECT * FROM tokens WHERE user_id=?', 
+ |             [user.id]
+ |         )
+ |         let token = tokens[0]?.token
+ |         if (!token) {
+ |             // Generate and save token into database
+ |             token = generateToken()
+ |             await conn.query(
+ |                 'INSERT INTO tokens(user_id, token) VALUES (?, ?)', 
+ |                 [user.id, token]
+ |             )
+ |         }
+ | 
+ |         conn.commit()
+ |         res.status(200).json({'token': token})
+ |     } catch (error) {
+ |         conn.rollback()
+ |         res.status(400).json(error.toString())
+ |     } finally {
+ |         conn.release()
+ |     }
+ | })
  |
  | exports.router = router
```

ทดสอบ API ด้วย Postmann

## 3. Protected API

สร้าง Middleware สำหรับตรวจสอบว่า request มาจาก client ทีมีการ login แล้วหรือยัง?

```javascript
-------------------------------------------------------------------
File: backend/middlewares/index.js
-------------------------------------------------------------------
  | //...
  |
+ | async function isLoggedIn (req, res, next) {
+ |     let authorization = req.headers.authorization
+ | 
+ |     if (!authorization) {
+ |         return res.status(401).send('You are not logged in')
+ |     }
+ | 
+ |     let [part1, part2] = authorization.split(' ')
+ |     if (part1 !== 'Bearer' || !part2) {
+ |         return res.status(401).send('You are not logged in')
+ |     }
+ |     
+ |     // Check token
+ |     const [tokens] = await pool.query('SELECT * FROM tokens WHERE token = ?', [part2])
+ |     const token = tokens[0]
+ |     if (!token) {
+ |         return res.status(401).send('You are not logged in')
+ |     }
+ | 
+ |     // Set user
+ |     const [users] = await pool.query(
+ |         'SELECT id, username, first_name, last_name, email, picture, mobile, join_date ' + 
+ |         'FROM users WHERE id = ?', [token.user_id]
+ |     )
+ |     req.user = users[0]
+ | 
+ |     next()
+ | }
  |
  | module.exports = {
c |     logger,
+ |     isLoggedIn
  | }
```

นำ `IsLoggedIn` Middleware มาใช้งาน

```javascript
-------------------------------------------------------------------
File: backend/routes/user.js
-------------------------------------------------------------------
  | const express = require("express")
  | const pool = require("../config")
  | const Joi = require('joi')
  | const bcrypt = require('bcrypt');
  | const { generateToken } = require("../utils/token");
+ | const { isLoggedIn } = require('../middlewares')
  |
  | //...
  |
+ | router.get('/user/me', isLoggedIn, async (req, res, next) => {
+ |     res.json(req.user)
+ | })
  |
  | exports.router = router
```

## 4. Login Page

ทำการ Login โดยใช้ axios ส่ง username, password ไปแลก token มาและบันทึกลง LocalStorage

```javascript
-------------------------------------------------------------------
File: frontend/views/Login.vue
-------------------------------------------------------------------
  | <script>
+ | import axios from 'axios'
  | 
  | export default {
  |   data () {
  |     return {
  |       username: '',
  |       password: '',
  |       error: ''
  |     }
  |   },
+ |   methods: {
+ |     submit () {
+ |       const data = {
+ |         username: this.username,
+ |         password: this.password
+ |       }
+ | 
+ |       axios.post('http://localhost:3000/user/login/', data)
+ |         .then(res => {
+ |           const token = res.data.token                                
+ |           localStorage.setItem('token', token)
+ |           this.$emit('auth-change')
+ |           this.$router.push({path: '/'})
+ |         })
+ |         .catch(error => {
+ |           this.error = error.response.data
+ |           console.log(error.response.data)
+ |         })
+ |     }
+ |   }
  | }
  | </script>
```

เมื่อ Login สำเร็จทำการ `$emit` event มาที่ App.vue เพื่ออัพเดต Navigation Bar

```javascript
-------------------------------------------------------------------
File: frontend/App.vue
-------------------------------------------------------------------
  | <template>
  |   ...
c |   <router-view :key="$route.fullPath" @auth-change="onAuthChange" />
  |   ...
  | </template>
  |
  | <script>
+ | import axios from 'axios'
  | 
  | export default {
  |   data () {
  |     return {
  |       user: null
  |     }
  |   },
+ |   mounted () {
+ |     this.onAuthChange()
+ |   },
+ |   methods: {
+ |     onAuthChange () {
+ |       const token = localStorage.getItem('token')
+ |       if (token) {
+ |         this.getUser()
+ |       }
+ |     },
+ |     getUser () {
+ |       axios.get('/user/me').then(res => {
+ |         this.user = res.data
+ |       })
+ |     },
+ |   }
  | }
  | </script>
```

---

### แบบฝึกหัด

#### 4.1 ให้นำ `IsLoggedIn` Middleware ไปใช้ที่ backend route ต่อไปนี้

```txt
- POST   /blogs
- PUT    /blog/:id
- DELETE /blogs/:id
- POST   /:blogId/comments
- PUT    /comments/:commentId
- DELETE /comments/:commentId
```

#### 4.2 ใน `POST /blogs` ให้บันทึก `blogs.create_by_id` เป็น `req.user.id`

```javascript
-------------------------------------------------------------------
File: frontend/App.vue
-------------------------------------------------------------------
  | const express = require("express");
  | const path = require("path");
  | const pool = require("../config");
  | const fs = require("fs");
  | const multer = require("multer");
+ | const { isLoggedIn } = require('../middlewares')
  |
  | //...
  |
c | router.post("/blogs", isLoggedIn, upload.array("myImage", 5), async function (req, res, next) {
  |   const file = req.files;
  |   let pathArray = [];
  | 
  |   if (!file) {
  |     return res.status(400).json({ message: "Please upload a file" });
  |   }
  | 
  |   const title = req.body.title;
  |   const content = req.body.content;
  |   const status = req.body.status;
  |   const pinned = req.body.pinned;
  | 
  |   // Begin transaction
  |   const conn = await pool.getConnection();
  |   await conn.beginTransaction();
  | 
  |   try {
  |     let results = await conn.query(
? |       "INSERT INTO blogs(title, content, status, pinned, `like`, create_date, /* เติมเอง */) " +
? |       "VALUES(?, ?, ?, ?, 0, CURRENT_TIMESTAMP, /* เติมเอง */);",
? |       [title, content, status, pinned, /* เติมเอง */]
  |     );
  |   }
  | 
  |   // ...
  | })
```

#### 4.3 ใน `POST /:blogId/comments` ให้บันทึก `comments.comment_by_id` เป็น `req.user.id`

