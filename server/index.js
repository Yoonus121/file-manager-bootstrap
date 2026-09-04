const express = require('express');
const cors = require('cors');
const mysql = require("mysql2/promise")
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const multer = require("multer");
const fs = require("fs/promises");
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const app = express();
const PORT = 3000;
const JWT_SECRET = process.env.JWT_SECRET;
let dbconnection;


app.use(cors());
app.use(express.json());


const dbConfig = {
    host:process.env.DB_HOST,
    user:process.env.DB_USER,
    password:process.env.DB_PASSWORD,
    port:process.env.DB_PORT,
};


async function init_db(){
    try{
        const connection = await mysql.createConnection(dbConfig);
        let quer = `CREATE DATABASE IF NOT EXISTS ${process.env.DB_NAME}`;
        await connection.query(quer);
        console.log("db created")

        const dbConfigWithDb = { ...dbConfig, database: process.env.DB_NAME };
        dbconnection = await mysql.createConnection(dbConfigWithDb);
        await dbconnection.query(`CREATE TABLE IF NOT EXISTS user (id INT AUTO_INCREMENT PRIMARY KEY, fname Varchar(255), email Varchar(255) UNIQUE, hashed_pass varchar(255), created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`);
        console.log("user table created");

        await dbconnection.query(`CREATE TABLE IF NOT EXISTS files (id INT AUTO_INCREMENT PRIMARY KEY, user_id INT, filename Varchar(255), original_name varchar(255),filepath Varchar(255), size BIGINT, uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (user_id)
        REFERENCES user(id))`);
        console.log("files table created");   

    }catch(err){
        console.log("error",err);
    }
} 


const auth_jwt = (req, res, next)=> {
    const authheader = req.headers.authorization;
    if(!authheader){
        return res.status(401).json({ message: 'authorization missing'});
    }

    const authtoken = authheader.split(' ')[1];
    if(!authtoken){
        return res.status(401).json({ message: 'token missing'});
    }

    try{
        const decode = jwt.verify(authtoken, JWT_SECRET);
        req.user = decode;
        next();
    }catch(err){
        return res.status(403).json({ message: 'Invalid or expired token' });
    }
}


const registerLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,  // 1 hour
    max: 3,                     // 3 registration attempts per hour per IP
    message: { message: "Too many registration attempts, please try again later" }
});


const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,  // 15 minutes
    max: 5,                     // 5 attempts per window per IP
    message: { message: "Too many login attempts, please try again later" }
});


const storage = multer.diskStorage({
    destination: (req, file, cb) =>{
        cb(null, 'uploadedFiles/');
    },
    filename:(req, file, cb)=>{
        const uniqueName = Date.now() + '-' + file.originalname;
        cb(null, uniqueName);
    }
});
const upload = multer({storage: storage});



app.post('/api/register', registerLimiter,async (req, res) => {
    try{
        let fname = req.body.fname;
        let mail = req.body.mail;
        let pass = req.body.pass;

        if (!fname || !mail || !pass) {
            return res.status(400).json({message: "All fields are required"});
        }
        if (!mail.includes("@")) {
            return res.status(400).json({message: "Invalid email format"});
        }
        if (pass.length < 6) {
            return res.status(400).json({message: "Password must be at least 6 characters"});
        }

        const saltRounds = 10;
        const cryptpass =await bcrypt.hash(pass, saltRounds);
        await dbconnection.query(`INSERT INTO user(fname, email, hashed_pass) values(?,?,?)`, [fname, mail, cryptpass]);
        res.json({message:"user registered successfully"})
    }catch(err){
        console.log("error",err);
        res.status(500).json({ message: "registration failed" });
    }
});


app.post('/api/login',loginLimiter, async (req, res) => {
    try{
        let mail = req.body.mail;
        let pass = req.body.pass;

        if (!mail || !pass) {
            return res.status(400).json({message: "All fields are required"});
        }
        if (!mail.includes("@")) {
            return res.status(400).json({message: "Invalid email format"});
        }
        
        const [row] = await dbconnection.query(`SELECT id, fname, email, hashed_pass from user where email = ?`,[mail]);
        if(row.length === 0){
            return res.status(404).json({ message: "user not exist" });
        }

        const isMatch = await bcrypt.compare(pass, row[0].hashed_pass);
        if(!isMatch){
           return res.status(401).json({ message: "incorrect password" }); 
        }

        const payload = {
            id:row[0].id,
                fname:row[0].fname,
                mail:row[0].email
            };
        const token = jwt.sign(payload, JWT_SECRET, {expiresIn: '1h'});
        res.json({ message: 'Login successful', token });
           
    }catch(err){
        console.log("error",err);
        res.status(500).json({ message: "login failed" });
    }
});






app.post('/api/upload', auth_jwt, upload.array('files', 10), async (req, res) => {
    try {
        for (const file of req.files) {
            await dbconnection.query(
                `INSERT INTO files(user_id, filename, original_name, filepath, size) values(?,?,?,?,?)`,
                [req.user.id, file.filename, file.originalname, file.path, file.size]
            );
        }
        res.json({message: `${req.files.length} file(s) uploaded successfully`});
    } catch(err) {
        console.log("error", err);
        return res.status(500).json({message: 'failed to upload file(s)'});
    }

});


app.get('/api/files', auth_jwt, async (req, res) =>{
    try{
        const [rows] = await dbconnection.query(`SELECT id, original_name, size, uploaded_at from files where user_id = ?`,[req.user.id]);
        res.json({ files: rows});
    }catch(err){
        console.log("error", err);
        return res.status(500).json({message:'fetching file failed'});
    }
});


app.delete('/api/files/:id', auth_jwt, async (req, res)=>{
    try{
        const [row] = await dbconnection.query(`SELECT filepath FROM files WHERE id = ? AND user_id = ?`,[req.params.id,req.user.id]);
        if (row.length === 0){
            return res.status(404).json({message:'file not found'});
        }
        await fs.unlink(row[0].filepath);
        await dbconnection.query(`DELETE FROM files WHERE id = ? AND user_id = ?`,[req.params.id,req.user.id]);
        res.json({message:'file is deleted successfully'});
    }catch(err){
        console.log("error", err);
        return res.status(500).json({message:'file deletion failed'});
    }
});


app.patch('/api/files/:id', auth_jwt, async (req, res) => {
    try {
        const newName = req.body.new_name;
        
        if (!newName) {
            return res.status(400).json({message: "New name is required"});
        }
        
        const [row] = await dbconnection.query(
            `SELECT id FROM files WHERE id = ? AND user_id = ?`, 
            [req.params.id, req.user.id]
        );
        if (row.length === 0) {
            return res.status(404).json({message: 'file not found'});
        }
        
        await dbconnection.query(
            `UPDATE files SET original_name = ? WHERE id = ? AND user_id = ?`,
            [newName, req.params.id, req.user.id]
        );
        
        res.json({message: 'file renamed successfully'});
    } catch(err) {
        console.log("error", err);
        return res.status(500).json({message: 'rename failed'});
    }
});


app.get('/api/files/:id/download', auth_jwt, async (req, res) => {
    try {
        const [row] = await dbconnection.query(
            `SELECT filepath, original_name FROM files WHERE id = ? AND user_id = ?`,
            [req.params.id, req.user.id]
        );
        if (row.length === 0) {
            return res.status(404).json({message: 'file not found'});
        }
        
        res.download(row[0].filepath, row[0].original_name);
    } catch(err) {
        console.log("error", err);
        return res.status(500).json({message: 'download failed'});
    }
});


async function main (){
    await init_db();
    app.listen(PORT,  ()=>{
    console.log(`express Server running at http://localhost:${PORT}/`)
    });
}

main();