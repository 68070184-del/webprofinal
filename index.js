const express = require("express");
const path = require("path");
const port = 3000;
const sqlite3 = require("sqlite3").verbose();
const crypto = require("crypto");
const QRCode = require("qrcode");




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


app.get("/table",(req,res) => {
    res.render("table")
})

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
    const sql = "SELECT session_id,end_time,table_id FROM dining_sessions WHERE session_token = ? AND status = ?"
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

        const menusql = "SELECT * FROM menu_items"
        db.all(menusql,(err,menuresult) => {
            if (err) {
                console.log(err)
                return res.status(500).json({error:"Can not query sql"})
            }
            return res.render("order",{data:menuresult,table_id:result.table_id})
        })
    
    })
})




app.listen(port, () => {
    console.log("Server has started!")
})