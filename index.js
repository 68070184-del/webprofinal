const express = require("express");
const path = require("path");
const port = 3000;
const sqlite3 = require("sqlite3").verbose();
const crypto = require("crypto");
const QRCode = require("qrcode");
const session = require("express-session"); 

const app = express();

let db = new sqlite3.Database('buffet.db', (err) => {
    if (err) {
        return console.log(err.message);
    }
    console.log("Connected to the SQlite database.")
})

app.use(express.static('public'));
app.set('view engine','ejs');
app.use(express.json());
app.use(express.urlencoded({extended:true}));

app.use(session({
    secret: "webfinal-secret-key",
    resave: false,
    saveUninitialized: true
}));


app.use((req, res, next) => {
    if (!req.session.cart) {
        req.session.cart = [];
    }
    next();
});

// ---------- Server-Sent Events ----------
let sseClients = [];

app.get("/events", (req, res) => {
    res.set({
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive"
    });
    res.flushHeaders();

    sseClients.push(res);
    req.on("close", () => {
        sseClients = sseClients.filter(c => c !== res);
    });
});

// แจ้งทุกหน้าที่เปิดอยู่ว่ามีข้อมูลเปลี่ยน ("tables" หรือ "orders")
function notify(eventName, data = {}) {
    sseClients.forEach(c => c.write(`event: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`));
}

app.get("/",(req,res) => {
    res.render("home")
})


app.get("/table", (req, res) => {
    db.all("SELECT table_id, status FROM tables", [], (err, rows) => {
        if (err) return res.status(500).send("Database error");
        
        // แปลงเป็น Object เพื่อง่ายต่อการเรียกใช้ เช่น { "1": "occupied", "2": "available" }
        const tableStatus = {};
        rows.forEach(t => {
            tableStatus[t.table_id] = t.status;
        });

        res.render("table", { tableStatus });
    });
});

app.post("/create-session", async (req,res) => {
    const {table_id,customer_count,packages_id} = req.body
    const token = crypto.randomBytes(32).toString('hex');
    const now = new Date();
    const twohourplus = new Date(now.getTime() + 2 * 60 * 60 * 1000)
    const starttime = now.toISOString(); 
    const endtime = twohourplus.toISOString();
    const sql = "INSERT INTO dining_sessions (start_time,end_time,customer_count,session_token,status,table_id,packages_id) VALUES (?,?,?,?,?,?,?)"

    const orderUrl = `${req.protocol}://${req.get('host')}/order/${token}`;
    let qrCodeDataUrl = "";
    try {
        qrCodeDataUrl = await QRCode.toDataURL(orderUrl, {
            width: 160,
            margin: 1
        });
    } catch (qrErr) {
        console.error("QR Code Generation Error:", qrErr);
    }

    db.run(sql,[starttime,endtime,customer_count,token,"active",table_id,packages_id,],(err) =>{
        if (err) {
            console.log(err)
            return res.status(500).json({ error: "Failed to create session" });
        }
        const sessionId = this.lastID;

        const updateTablesql = "UPDATE tables SET status = 'occupied' WHERE table_id = ?" 
        db.run(updateTablesql,[table_id],(err) => {
            if (err) {
                console.log(err)
                return res.status(500).json({error:"Falied to change table status."})
            }
            console.log("Change table status")

            notify("tables", { table_id: table_id, status: "occupied" });

            return res.status(200).json({
                message: "Session created successfully",
                session_id: sessionId,
                session_token: token,
                table_id: table_id,
                starttime: starttime,
                endtime: endtime,
                qrcode: qrCodeDataUrl
            })
        })
    })
})

app.get("/order/:token", (req,res) => {
    const token = req.params.token;
    const sql = "SELECT session_id,end_time,table_id,packages_id FROM dining_sessions WHERE session_token = ? AND status = ?"
    db.get(sql,[token,"active"], (err,result) =>{

    if (err) {
        console.log(err)
        return res.status(500).json({error:"Can not query sql"})
    }

    if (!result) {
        return res.status(404).send(`
            <div style="font-family: sans-serif; text-align: center; padding-top: 50px;">
                <h2 style="color: #dc3545;">เกิดข้อผิดพลาด</h2>
                <p>ไม่พบรอบการใช้งาน หรือรอบบุฟเฟต์นี้ถูกปิดไปแล้ว</p>
            </div>
        `);
    }

    req.session.session_id = result.session_id;
    req.session.table_id = result.table_id;

    const now = new Date();
        const sessionEndTime = new Date(result.end_time);

        if (now > sessionEndTime) {
            return res.status(403).send(`
                <div style="font-family: sans-serif; text-align: center; padding-top: 50px;">
                    <h2 style="color: #dc3545;">หมดเวลาการใช้งาน</h2>
                    <p>รอบเวลาบุฟเฟต์ของคุณหมดเวลา 2 ชั่วโมงแล้ว กรุณาติดต่อพนักงาน</p>
                </div>
            `);
        }

        const menusql = `
            SELECT m.*
            FROM menu_items m
            LEFT JOIN buffet_packages p ON m.packages_id = p.packages_id
            WHERE m.packages_id IS NULL
            OR p.packages_tier <= (SELECT packages_tier FROM buffet_packages WHERE packages_id = ?)
        `
        db.all(menusql, [result.packages_id], (err,menuresult) => {
            if (err) {
                console.log(err)
                return res.status(500).json({error:"Can not query sql"})
            }
            return res.render("order",{data:menuresult,table_id:result.table_id})
        })
        
    })
})

app.post("/add-to-cart",(req,res) => {
    const {item_id,name,price,quantity} = req.body
    const qty = parseInt(quantity, 10) || 1;
    sql = "SELECT * FROM menu_items WHERE item_id = ?"

    db.get(sql,[item_id],(err,result) => {
        if (err) {
            console.log(err)
            return res.status(500).json({error: "เกิดข้อผิดพลาดในการเชื่อมต่อฐานข้อมูล"})
        }

        if (!result) {
            res.status(200).json({message:"ขออภัย สินค้าหมด โปรดสั่งรายการอื่น"})
        }

        if (result) {
            const existingItemIndex = req.session.cart.findIndex(item => item.item_id === item_id);

        if (existingItemIndex > -1) {
            req.session.cart[existingItemIndex].item_quantity += qty;
        } else {
            req.session.cart.push({
                item_id: item_id,
                item_name: result.name || name,
                item_price: result.price || price,
                item_quantity: qty
            });
        }

        const totalItems = req.session.cart.reduce((sum, item) => sum + item.item_quantity, 0);

        return res.status(200).json({
            message: "เพิ่มสินค้าลงตะกร้า สำเร็จ!",
            totalCartItems: totalItems,
            cart: req.session.cart
        });
        
        }
    })
})

app.get("/get-cart", (req, res) => {
    const cart = req.session.cart || [];
    const totalItems = cart.reduce((sum, item) => sum + item.item_quantity, 0);
    return res.status(200).json({ cart, totalItems });
});

app.post("/update-cart", (req, res) => {
    const { item_id, step } = req.body; // step จะเป็น +1, -1 หรือส่ง action="remove"
    
    if (!req.session.cart) {
        req.session.cart = [];
    }

    const itemIndex = req.session.cart.findIndex(item => item.item_id === item_id);

    if (itemIndex > -1) {
        if (step === 'remove') {
            // สั่งลบรายการออกทันที
            req.session.cart.splice(itemIndex, 1);
        } else {
            // บวกหรือลดจำนวน
            req.session.cart[itemIndex].item_quantity += parseInt(step, 10);
            
            // ถ้าลดจนเหลือ 0 หรือน้อยกว่า ให้ลบรายการนั้นทิ้ง
            if (req.session.cart[itemIndex].item_quantity <= 0) {
                req.session.cart.splice(itemIndex, 1);
            }
        }
    }

    const totalItems = req.session.cart.reduce((sum, item) => sum + item.item_quantity, 0);

    return res.status(200).json({
        cart: req.session.cart,
        totalItems: totalItems
    });
});

app.post("/submit-order", (req, res) => {
    const cart = req.session.cart || [];

    if (cart.length === 0) {
        return res.status(400).json({ message: "ไม่มีสินค้าในตะกร้า" });
    }

    const sessionId = req.session.session_id || 1;
    const orderTime = new Date().toISOString();

    const insertOrderSql = "INSERT INTO orders (session_id, order_time, status) VALUES (?, ?, 'pending')";

    // 1. สร้างหัวบิลในตาราง orders
    db.run(insertOrderSql, [sessionId, orderTime], function(err) {
        if (err) {
            console.error("Error creating order:", err.message);
            return res.status(500).json({ error: "ไม่สามารถสร้างใบสั่งอาหารได้" });
        }

        const orderId = this.lastID; // order_id ที่เพิ่งสร้าง

        // 2. ใช้คำสั่ง INSERT ให้ตรงกับ 4 คอลัมน์: order_id, item_id, quantity, subtotal
        db.serialize(() => {
            const insertItemSql = "INSERT INTO order_items (order_id, item_id, quantity, subtotal) VALUES (?, ?, ?, ?)";
            const stmt = db.prepare(insertItemSql);

            cart.forEach((item) => {
                const qty = parseInt(item.item_quantity, 10) || 1;
                const price = parseFloat(item.item_price) || 0;
                const subtotal = qty * price;

                stmt.run([orderId, item.item_id, qty, subtotal], (itemErr) => {
                    if (itemErr) {
                        console.error("Error inserting item:", itemErr.message);
                    }
                });
            });

            stmt.finalize((finalizeErr) => {
                if (finalizeErr) {
                    console.error("Finalize error:", finalizeErr.message);
                    return res.status(500).json({ error: "บันทึกรายการอาหารไม่สำเร็จ" });
                }

                // เก็บประวัติลง session เพื่อแสดงในหน้า History
                if (!req.session.orderHistory) {
                    req.session.orderHistory = [];
                }
                const timeString = new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
                req.session.orderHistory.unshift({
                    order_id: orderId,
                    time: timeString,
                    items: [...cart],
                    totalQty: cart.reduce((sum, item) => sum + item.item_quantity, 0)
                });

                // เคลียร์ตะกร้าเมื่อบันทึกเสร็จ
                req.session.cart = [];

                notify("orders");
                return res.status(200).json({
                    message: "ส่งรายการอาหารเข้าครัวเรียบร้อยแล้ว!",
                    order_id: orderId,
                    totalCartItems: 0
                });
            });
        });
    });
});

app.get("/order-history", (req, res) => {
    const sessionId = req.session.session_id || 1;

    const sql = `
        SELECT oi.order_id, m.name, oi.quantity, oi.subtotal
        FROM orders o
        JOIN order_items oi ON o.order_id = oi.order_id
        JOIN menu_items m ON oi.item_id = m.item_id
        WHERE o.session_id = ?
        ORDER BY oi.order_id DESC
    `;

    db.all(sql, [sessionId], (err, rows) => {
        if (err) return res.status(500).json({ history: [] });
        return res.status(200).json({ history: rows });
    });
});

// 1. หน้าครัว: ดึงออเดอร์ที่ยังไม่เสร็จ เรียงตามเวลาเก่าไปใหม่
app.get("/kitchen", (req, res) => {
    const sql = `
        SELECT o.order_id, o.order_time, o.status, s.table_id, oi.quantity, m.name
        FROM orders o
        JOIN dining_sessions s ON o.session_id = s.session_id
        JOIN order_items oi ON o.order_id = oi.order_id
        JOIN menu_items m ON oi.item_id = m.item_id
        WHERE o.status IN ('pending', 'preparing')
        ORDER BY o.order_time ASC
    `;

    db.all(sql, [], (err, rows) => {
        if (err) return res.send("เกิดข้อผิดพลาดในการโหลดข้อมูล");

        // จัดกลุ่มแถวข้อมูลตาม order_id
        const orderMap = {};
        rows.forEach(r => {
            if (!orderMap[r.order_id]) {
                orderMap[r.order_id] = {
                    order_id: r.order_id,
                    table_id: r.table_id,
                    time: new Date(r.order_time).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Bangkok' }),
                    status: r.status,
                    items: []
                };
            }
            orderMap[r.order_id].items.push({ name: r.name, qty: r.quantity });
        });

        res.render("kitchen", { orders: Object.values(orderMap) });
    });
});

// 2. รับคำสั่งเปลี่ยนสถานะ
app.post("/api/order-status", (req, res) => {
    const { order_id, status } = req.body;
    db.run("UPDATE orders SET status = ? WHERE order_id = ?", [status, order_id], (err) => {
        if (err) return res.status(500).json({ success: false });
        res.json({ success: true });
    });
});

app.get("/api/table-bill/:table_id", (req, res) => {
    const sessionSql = `
        SELECT s.session_id, s.customer_count, p.packages_name AS package_name, p.package_price AS package_price
        FROM dining_sessions s
        LEFT JOIN buffet_packages p ON s.packages_id = p.packages_id
        WHERE s.table_id = ? AND s.status = 'active'
        ORDER BY s.session_id DESC
        LIMIT 1
    `;

    db.get(sessionSql, [req.params.table_id], (err, session) => {
        if (err) return res.status(500).json({ error: "SQL error: " + err.message });
        if (!session) return res.status(404).json({ error: "ไม่พบรอบการใช้งาน" });

        const itemsSql = `
            SELECT m.name, oi.quantity, oi.subtotal
            FROM orders o
            JOIN order_items oi ON o.order_id = oi.order_id
            JOIN menu_items m ON oi.item_id = m.item_id
            WHERE o.session_id = ?
        `;

        db.all(itemsSql, [session.session_id], (err, items) => {
            if (err) return res.status(500).json({ error: "SQL error: " + err.message });

            const buffetTotal = session.package_price * session.customer_count;
            const extraTotal = items.reduce((sum, i) => sum + i.subtotal, 0);
            const total = buffetTotal + extraTotal;
            const vat = Number((total * 0.07).toFixed(2));

            res.json({
                session_id: session.session_id,
                package_name: session.package_name,
                customer_count: session.customer_count,
                items: items,
                buffet_total: buffetTotal,
                extra_total: extraTotal,
                total: total,
                vat: vat,
                grand_total: Number((total + vat).toFixed(2))
            });
        });
    });
});

app.post("/api/pay", (req, res) => {
    const { session_id, table_id, buffet_total, extra_total, vat, grand_total, payment_method } = req.body;

    const sql = `
        INSERT INTO payments
        (session_id, buffet_total, extra_subtotal, vat_amount, grand_total, payment_method, payment_time, payment_status)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'paid')
    `;

    db.run(sql, [session_id, buffet_total, extra_total, vat, grand_total, payment_method, new Date().toISOString()], (err) => {
        if (err) return res.status(500).json({ error: err.message });

        db.run("UPDATE dining_sessions SET status = 'closed' WHERE session_id = ?", [session_id]);
        db.run("UPDATE tables SET status = 'billed' WHERE table_id = ?", [table_id]);

        notify("tables", { table_id: table_id, status: "billed" });
        res.json({ success: true });
    });
});

// หน้าพนักงาน: แสดงเฉพาะโต๊ะที่ billed หรือ cleaning
app.get("/employee", (req, res) => {
    db.all("SELECT table_id, status FROM tables WHERE status IN ('billed', 'cleaning')", [], (err, rows) => {
        if (err) return res.status(500).send("Database error");
        res.render("employee", { tables: rows });
    });
});

// เปลี่ยนสถานะโต๊ะ: billed -> cleaning, cleaning -> available เท่านั้น
app.post("/api/table-status", (req, res) => {
    const nextStatus = { billed: 'cleaning', cleaning: 'available' };

    db.get("SELECT status FROM tables WHERE table_id = ?", [req.body.table_id], (err, row) => {
        if (err || !row) return res.status(404).json({ error: "ไม่พบโต๊ะ" });

        const next = nextStatus[row.status];
        if (!next) return res.status(400).json({ error: "โต๊ะนี้เปลี่ยนสถานะไม่ได้" });

        db.run("UPDATE tables SET status = ? WHERE table_id = ?", [next, req.body.table_id], (err) => {
            if (err) return res.status(500).json({ error: err.message });
            notify("tables", { table_id: req.body.table_id, status: next });
            res.json({ success: true });
        });
    });
});

app.listen(port, () => {
    console.log("Server has started!")
})