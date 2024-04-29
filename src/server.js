import http from 'http'
import { Server } from "socket.io";
import express from 'express'

const app = express();
app.set("view engine", "pug");
app.set("views", __dirname + "/views");
app.use("/public", express.static(__dirname + "/public"));
app.get("/", (_, res) => res.render("home"));
app.get("/*", (_, res) => res.redirect("/"))

const httpServer = http.createServer(app);
const io = new Server(httpServer);

io.on("connection", (socket) => {
  console.log(socket)
})

const handleListen = () => console.log('Listen one http://localhost:3000,')
httpServer.listen(3000, handleListen);